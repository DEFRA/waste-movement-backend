import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as delivery from '../../services/delivery.js'
import { config } from '../../config.js'
import { apiCode1, base64EncodedOrgApiCodes } from '../../test/data/apiCodes.js'
import {
  requestBasicAuthTest1,
  userBasicAuthTest1
} from '../../test/data/basic-auth.js'
import { createServer } from '../../server.js'
import {
  forwardedOrganisationId,
  organisationHeaders
} from '../../test/data/organisation-headers.js'
import {
  brokerOrDealerEntry,
  supportingReference,
  carrier,
  consignmentNote,
  hazardousWasteItem,
  receiver,
  treatment,
  wasteItem
} from '../../schemas/beta-2/test-helpers.js'

const backoffOptionsConfig = { numOfAttempts: 3, startingDelay: 1 }
// A receipt needs at least one treatment on every waste item.
const wasteItems = [{ ...wasteItem, treatments: [treatment] }]
const reasonForNoDeliveryId =
  'No delivery was recorded prior to receipt; waste received directly from the producer.'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

jest.mock('@defra/waste-movement-utils', () => {
  const originalModule = jest.requireActual('@defra/waste-movement-utils')

  return {
    ...originalModule,
    backoffOptions: () => backoffOptionsConfig
  }
})

jest.mock('../../common/helpers/http-client.js', () => ({
  httpClients: {
    wasteTracking: {
      get: jest
        .fn()
        .mockResolvedValue({ payload: { wasteTrackingId: '25KMT4Z9' } })
    }
  }
}))

describe('POST /beta-2/receipts', () => {
  let server
  const url = '/beta-2/receipts'
  const traceId = 'trace-id-123'
  const authHeaders = { Authorization: `Basic ${requestBasicAuthTest1}` }
  const tracedHeaders = { 'x-cdp-request-id': traceId }
  const tracedAuthHeaders = {
    ...authHeaders,
    ...tracedHeaders,
    ...organisationHeaders
  }

  const expectedTypeBase =
    'https://defra.github.io/digital-waste-tracking-api-site/preview/problems/'

  beforeAll(async () => {
    config.set('orgApiCodes', base64EncodedOrgApiCodes)
    process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    await server.db.collection('deliveries').deleteMany({})
  })

  it('mints an empty delivery, acknowledges receipt against it and returns 201 with the envelope shape', async () => {
    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url,
      payload: { reasonForNoDeliveryId, carrier, receiver, wasteItems },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId: '25KMT4Z9' },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toBeDefined()

    const deliveryInDb = await server.db
      .collection('deliveries')
      .findOne({ deliveryId: '25KMT4Z9' })

    expect(deliveryInDb).toMatchObject({
      deliveryId: '25KMT4Z9',
      movementIds: [],
      orgId: forwardedOrganisationId
    })
  })

  // Scenario: A Receipt is created when more than one treatment is declared.
  it('acknowledges receipt when a waste item has more than one treatment', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems: [
          {
            ...wasteItem,
            treatments: [
              treatment,
              { ...treatment, disposalOrRecoveryCode: 'D10' }
            ]
          }
        ]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId: '25KMT4Z9' },
      validation: { warnings: [] }
    })
  })

  it('acknowledges receipt when a brokerOrDealer and supportingReferences are provided', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems,
        brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] },
        supportingReferences: [supportingReference]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId: '25KMT4Z9' },
      validation: { warnings: [] }
    })
  })

  it('returns a 400 when a declared brokerOrDealer has no details', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems,
        brokerOrDealer: { isPresent: true }
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        pointer: '/brokerOrDealer/items'
      })
    )
  })

  it('returns a 400 when a supportingReference has an unrecognised label', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        errorType: 'InvalidValue',
        pointer: '/supportingReferences/0/label'
      })
    )
  })

  it('echoes the inbound x-cdp-request-id as x-request-id', async () => {
    const { headers } = await server.inject({
      method: 'POST',
      url,
      payload: { reasonForNoDeliveryId, carrier, receiver, wasteItems },
      headers: tracedAuthHeaders
    })

    expect(headers['x-request-id']).toEqual(traceId)
  })

  it('returns a 400 when required fields are missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {},
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '4 validation errors occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'reasonForNoDeliveryId' is required",
          pointer: '/reasonForNoDeliveryId'
        },
        {
          errorType: 'NotProvided',
          message: "'carrier' is required",
          pointer: '/carrier'
        },
        {
          errorType: 'NotProvided',
          message: "'receiver' is required",
          pointer: '/receiver'
        },
        {
          errorType: 'NotProvided',
          message: "'wasteItems' is required",
          pointer: '/wasteItems'
        }
      ],
      instance: '/beta-2/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when carrier is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { reasonForNoDeliveryId, receiver, wasteItems },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'carrier' is required",
          pointer: '/carrier'
        }
      ],
      instance: '/beta-2/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when wasteItems is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { reasonForNoDeliveryId, carrier, receiver },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'wasteItems' is required",
          pointer: '/wasteItems'
        }
      ],
      instance: '/beta-2/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  // Scenario: A Receipt isn't created when no treatment is declared.
  it('returns a 400 when a waste item has no treatments', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        reasonForNoDeliveryId,
        carrier,
        receiver,
        wasteItems: [wasteItem]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'treatments' is required",
          pointer: '/wasteItems/0/treatments'
        }
      ],
      instance: '/beta-2/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when receiver is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { reasonForNoDeliveryId, carrier, wasteItems },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'receiver' is required",
          pointer: '/receiver'
        }
      ],
      instance: '/beta-2/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  // apiCode is sent in the x-api-code header and resolved by the
  // external API, so the backend rejects it in the body.
  it('returns a 400 when apiCode is sent in the body', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        apiCode: apiCode1,
        carrier,
        receiver,
        wasteItems,
        reasonForNoDeliveryId
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotAllowed',
          message: 'must NOT have additional properties',
          pointer: '/apiCode'
        }
      ],
      instance: '/beta-2/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when no organisation was forwarded (unknown or disabled API code)', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { reasonForNoDeliveryId, carrier, receiver, wasteItems },
      headers: { ...authHeaders, ...tracedHeaders }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: '/beta-2/receipts',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 500 when persisting the delivery fails', async () => {
    const error = 'Database connection failed'
    jest
      .spyOn(delivery, 'createDeliveryRecord')
      .mockRejectedValue(new Error(error))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { reasonForNoDeliveryId, carrier, receiver, wasteItems },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: '/beta-2/receipts',
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  it('returns 401 when unauthenticated', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { reasonForNoDeliveryId, carrier, receiver, wasteItems },
      headers: tracedHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: '/beta-2/receipts',
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
  })

  it('returns a 500 when the response body does not match the response schema', async () => {
    jest.spyOn(delivery, 'createDeliveryId').mockResolvedValueOnce(42)
    // Stubbed so the bad id isn't rejected by the deliveries collection first.
    jest.spyOn(delivery, 'createDeliveryRecord').mockResolvedValueOnce({})

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        reasonForNoDeliveryId: 'No delivery was recorded',
        carrier,
        receiver,
        wasteItems
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: url,
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  describe('Feature: Describing the waste when recording the receipt of undocumented waste', () => {
    // Background: they are authenticated and have a valid API Code.
    // The Receipt ID is the Delivery ID minted for the receipt.
    const receiptId = '25KMT4Z9'

    // An earlier test leaves createDeliveryRecord mocked to fail.
    beforeEach(() => {
      if (jest.isMockFunction(delivery.createDeliveryRecord)) {
        delivery.createDeliveryRecord.mockRestore()
      }
    })

    const submit = (payload) =>
      server.inject({
        method: 'POST',
        url,
        payload,
        headers: tracedAuthHeaders
      })

    // A receipt needs at least one treatment on every waste item.
    const receiptItem = (item) => ({ ...item, treatments: [treatment] })
    const nonHazardousItem = receiptItem(wasteItem)
    const hazardousItem = receiptItem(hazardousWasteItem)

    const withWasteItems = (items, extra = {}) => ({
      reasonForNoDeliveryId,
      carrier,
      receiver,
      wasteItems: items,
      ...extra
    })
    const withClassification = (classification) =>
      withWasteItems([{ ...nonHazardousItem, classification }])

    const reasonForNoCode = 'Carrier did not provide a consignment note'

    const storedReceipts = () =>
      server.db.collection('deliveries').countDocuments()

    const expectCreated = async (payload) => {
      const { statusCode, result } = await submit(payload)

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data).toEqual({ deliveryId: receiptId })
      expect(await storedReceipts()).toBe(1)
    }

    const expectRejected = async (payload, errors) => {
      const { statusCode, result } = await submit(payload)

      expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(result.errors).toEqual(errors)
      expect(await storedReceipts()).toBe(0)
    }

    // A code that isn't six digits fails the schema; a six-digit code that
    // isn't in the reference data fails the check in waste-reference-data-checks.js.
    const ewcCodeBadlyFormatted = (pointer) => ({
      errorType: 'InvalidFormat',
      message: "must match pattern '^\\d{6}$'",
      pointer
    })
    const ewcCodeNotRecognised = (pointer) => ({
      errorType: 'InvalidValue',
      message: 'must be a recognised EWC code',
      pointer
    })
    const reasonRequired = {
      errorType: 'NotProvided',
      message:
        "Required when a waste item has a hazardous EWC code and 'code' is not provided",
      pointer: '/consignmentNote/reasonForNoCode'
    }
    const consignmentNoteRequired = {
      errorType: 'NotProvided',
      message:
        "Required when a waste item has a hazardous EWC code, with a 'code' or a 'reasonForNoCode'",
      pointer: '/consignmentNote'
    }

    describe('Scenario: A Receipt is created when non-hazardous waste is described without a consignment code', () => {
      it('creates the receipt for a waste description and a non-hazardous EWC code', async () => {
        await expectCreated(
          withClassification({
            wasteDescription: 'Paper and cardboard',
            ewcCodes: ['200101']
          })
        )
      })
    })

    describe('Scenario: A Receipt is created when a consignment code is given for non-hazardous waste', () => {
      it('creates the receipt for a non-hazardous EWC code and a valid consignment code', async () => {
        await expectCreated(
          withWasteItems([nonHazardousItem], { consignmentNote })
        )
      })
    })

    describe('Scenario: A Receipt is created when a mirror EWC code is provided', () => {
      it.each([
        ['1 EWC code', ['170504']],
        ['2 EWC codes', ['170504', '191212']],
        ['5 EWC codes', ['170504', '191212', '170904', '170604', '200101']]
      ])('creates the receipt with %s', async (_, ewcCodes) => {
        await expectCreated(
          withClassification({ wasteDescription: 'Soil and stones', ewcCodes })
        )
      })
    })

    describe("Scenario Outline: A Receipt isn't created when the waste description is missing", () => {
      it('rejects a waste description that is not provided as required', async () => {
        await expectRejected(withClassification({ ewcCodes: ['200101'] }), [
          {
            errorType: 'NotProvided',
            message: "'wasteDescription' is required",
            pointer: '/wasteItems/0/classification/wasteDescription'
          }
        ])
      })

      it('rejects a waste description of ""', async () => {
        await expectRejected(
          withClassification({ wasteDescription: '', ewcCodes: ['200101'] }),
          [
            {
              errorType: 'OutOfRange',
              message: 'must NOT have fewer than 1 characters',
              pointer: '/wasteItems/0/classification/wasteDescription'
            }
          ]
        )
      })
    })

    describe("Scenario Outline: A Receipt isn't created when the EWC code is missing or invalid", () => {
      const description = { wasteDescription: 'Paper and cardboard' }

      // Examples: Not provided or empty
      it('rejects EWC codes that are not provided as required', async () => {
        await expectRejected(withClassification(description), [
          {
            errorType: 'NotProvided',
            message: "'ewcCodes' is required",
            pointer: '/wasteItems/0/classification/ewcCodes'
          }
        ])
      })

      // "" isn't six digits, so it's reported as a format error.
      it('rejects an EWC code of ""', async () => {
        await expectRejected(
          withClassification({ ...description, ewcCodes: [''] }),
          [ewcCodeBadlyFormatted('/wasteItems/0/classification/ewcCodes/0')]
        )
      })

      // Examples: Not recognised
      it.each(['2001', '200101*', '20 01 01'])(
        'rejects an EWC code of %p as not in the recognised format',
        async (code) => {
          await expectRejected(
            withClassification({ ...description, ewcCodes: [code] }),
            [ewcCodeBadlyFormatted('/wasteItems/0/classification/ewcCodes/0')]
          )
        }
      )

      it('rejects an EWC code of "999999" as not recognised', async () => {
        await expectRejected(
          withClassification({ ...description, ewcCodes: ['999999'] }),
          [ewcCodeNotRecognised('/wasteItems/0/classification/ewcCodes/0')]
        )
      })
    })

    describe("Scenario: A Receipt isn't created when more than 5 EWC codes are declared", () => {
      it('rejects 6 EWC codes, saying no more than 5 are permitted', async () => {
        await expectRejected(
          withClassification({
            wasteDescription: 'Soil and stones',
            ewcCodes: [
              '170504',
              '191212',
              '170904',
              '170604',
              '200101',
              '200301'
            ]
          }),
          [
            {
              errorType: 'OutOfRange',
              message: 'must NOT have more than 5 items',
              pointer: '/wasteItems/0/classification/ewcCodes'
            }
          ]
        )
      })
    })

    describe('Scenario Outline: A Receipt is created when hazardous waste has a consignment code', () => {
      it.each([
        ['EA / NRW', 'SMITHS/A1234'],
        ['SEPA', 'SA1234567'],
        ['NIEA', 'DA1234567']
      ])('creates the receipt with a %s code of %s', async (_, code) => {
        await expectCreated(
          withWasteItems([hazardousItem], { consignmentNote: { code } })
        )
      })
    })

    describe('Scenario: A Receipt is created when hazardous waste has a reason for no consignment code', () => {
      it('creates the receipt with a hazardous EWC code and a reason', async () => {
        await expectCreated(
          withWasteItems([hazardousItem], {
            consignmentNote: { reasonForNoCode }
          })
        )
      })
    })

    describe("Scenario Outline: A Receipt isn't created when hazardous waste has neither a consignment code nor a reason", () => {
      it.each([
        ['(not provided)', {}],
        ['""', { code: '', reasonForNoCode: '' }],
        ['null', { code: null, reasonForNoCode: null }]
      ])(
        'rejects a code and a reason of %s, saying a reason is required',
        async (_, note) => {
          await expectRejected(
            withWasteItems([hazardousItem], { consignmentNote: note }),
            [reasonRequired]
          )
        }
      )

      it('rejects a receipt with no consignment note at all, saying a code or a reason is required', async () => {
        await expectRejected(withWasteItems([hazardousItem]), [
          consignmentNoteRequired
        ])
      })
    })

    describe("Scenario: A Receipt isn't created when any one of several wastes is hazardous and has neither a consignment code nor a reason", () => {
      it('rejects one hazardous and one non-hazardous waste with no consignment code or reason', async () => {
        await expectRejected(
          withWasteItems([nonHazardousItem, hazardousItem], {
            consignmentNote: {}
          }),
          [reasonRequired]
        )
      })
    })

    describe("Scenario Outline: A Receipt isn't created when the consignment code is invalid", () => {
      it.each(['12345', 'ABC/123', 'SD1234567'])(
        'rejects a consignment code of %p as not in a recognised format',
        async (code) => {
          await expectRejected(
            withWasteItems([hazardousItem], { consignmentNote: { code } }),
            [
              {
                errorType: 'InvalidFormat',
                message: expect.stringMatching(/^must match pattern /),
                pointer: '/consignmentNote/code'
              }
            ]
          )
        }
      )
    })

    describe("Scenario: A Receipt isn't created when both a consignment code and a reason are given", () => {
      it('rejects the reason as not permitted', async () => {
        await expectRejected(
          withWasteItems([hazardousItem], {
            consignmentNote: { ...consignmentNote, reasonForNoCode }
          }),
          [
            {
              errorType: 'NotAllowed',
              message: "Not allowed when 'code' is provided",
              pointer: '/consignmentNote/reasonForNoCode'
            }
          ]
        )
      })
    })

    describe("Scenario: A Receipt isn't created when any one of several wastes is described with missing or invalid details", () => {
      it('reports each invalid detail against the waste it belongs to', async () => {
        await expectRejected(
          withWasteItems([
            nonHazardousItem,
            { ...nonHazardousItem, classification: { ewcCodes: ['999999'] } }
          ]),
          [
            {
              errorType: 'NotProvided',
              message: "'wasteDescription' is required",
              pointer: '/wasteItems/1/classification/wasteDescription'
            },
            ewcCodeNotRecognised('/wasteItems/1/classification/ewcCodes/0')
          ]
        )
      })
    })
  })
})
