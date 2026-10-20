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
  pops,
  popComponent,
  popsPresent,
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

  // Shared by the business scenario features below.
  // Background: they are authenticated and have a valid API Code.
  // The Receipt ID is the Delivery ID minted for the receipt.
  const receiptId = '25KMT4Z9'

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

  const storedReceipts = () =>
    server.db.collection('deliveries').countDocuments()

  // An earlier test leaves createDeliveryRecord mocked to fail, and
  // clearAllMocks doesn't undo that, so the scenarios restore the real one.
  const restoreCreateDeliveryRecord = () => {
    if (jest.isMockFunction(delivery.createDeliveryRecord)) {
      delivery.createDeliveryRecord.mockRestore()
    }
  }

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

  describe('Feature: Describing the waste when recording the receipt of undocumented waste', () => {
    beforeEach(restoreCreateDeliveryRecord)

    // Every classification declares its POPs; these scenarios aren't about
    // them, so it's always none unless the test says otherwise.
    const withClassification = (classification) =>
      withWasteItems([
        { ...nonHazardousItem, classification: { pops, ...classification } }
      ])

    const reasonForNoCode = 'Carrier did not provide a consignment note'

    // A code that isn't six digits fails the schema; a six-digit code that
    // isn't in the reference data fails the check in
    // waste-reference-data-checks.js.
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
            {
              ...nonHazardousItem,
              classification: { ewcCodes: ['999999'], pops }
            }
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

  describe('Feature: Declaring persistent organic pollutants when creating a receipt of undocumented waste', () => {
    beforeEach(restoreCreateDeliveryRecord)

    const withPops = (pops) =>
      withWasteItems([
        {
          ...nonHazardousItem,
          classification: { ...nonHazardousItem.classification, pops }
        }
      ])
    const withComponents = (components) =>
      withPops({ ...popsPresent, components })

    const popsPointer = '/wasteItems/0/classification/pops'
    const componentPointer = (index, field) =>
      `${popsPointer}/components/${index}/${field}`

    describe('Scenario: A Receipt is created when the waste is declared as not containing POPs', () => {
      it('creates the receipt', async () => {
        await expectCreated(withPops({ isPresent: false }))
      })
    })

    describe('Scenario Outline: A Receipt is created when a POP is declared with a concentration', () => {
      // HBCDD in the scenario is HBCD in the reference data.
      it.each([
        ['PFOA', 0.5],
        ['PFOS', 12],
        ['HBCD', 0.001]
      ])(
        'creates the receipt with a POP code of %s and a concentration of %s',
        async (code, concentration) => {
          await expectCreated(withComponents([{ code, concentration }]))
        }
      )
    })

    describe('Scenario Outline: A Receipt is created when a POP is declared against its threshold', () => {
      it.each([
        ['less than', 'LESS_THAN'],
        ['equal to', 'EQUAL_TO'],
        ['greater than', 'GREATER_THAN']
      ])(
        'creates the receipt with a PFOA concentration %s its threshold',
        async (_, concentrationThresholdOperator) => {
          await expectCreated(
            withComponents([{ code: 'PFOA', concentrationThresholdOperator }])
          )
        }
      )
    })

    describe('Scenario Outline: A Receipt is created when the source of the POP details is declared', () => {
      it.each([
        ['Government guidance', 'GUIDANCE'],
        ['Provided with the waste', 'PROVIDED_WITH_WASTE'],
        ['Own testing or analysis', 'OWN_TESTING'],
        ['Not provided', 'NOT_PROVIDED']
      ])(
        'creates the receipt with a source of %s',
        async (_, sourceOfComponents) => {
          await expectCreated(withPops({ ...popsPresent, sourceOfComponents }))
        }
      )
    })

    describe('Scenario: A Receipt is created when more than one POP is declared', () => {
      it('creates the receipt with a code and a concentration or threshold for each POP', async () => {
        await expectCreated(
          withComponents([
            { code: 'PFOA', concentration: 0.5 },
            { code: 'PFOS', concentrationThresholdOperator: 'GREATER_THAN' }
          ])
        )
      })
    })

    describe("Scenario Outline: A Receipt isn't created when whether the waste contains POPs is missing or invalid", () => {
      // Examples: Not provided or empty
      it('rejects whether the waste contains POPs not being provided, as required', async () => {
        await expectRejected(withPops({}), [
          {
            errorType: 'NotProvided',
            message: "'isPresent' is required",
            pointer: `${popsPointer}/isPresent`
          }
        ])
      })

      // Examples: Not recognised. "" isn't true or false either.
      it.each(['', 'Maybe', 'Unknown'])(
        'rejects whether the waste contains POPs of %p as not true or false',
        async (isPresent) => {
          await expectRejected(withPops({ isPresent }), [
            {
              errorType: 'InvalidType',
              message: 'must be boolean',
              pointer: `${popsPointer}/isPresent`
            }
          ])
        }
      )

      it('rejects POPs not being declared at all', async () => {
        const { pops: _, ...withoutPops } = nonHazardousItem.classification
        await expectRejected(
          withWasteItems([
            { ...nonHazardousItem, classification: withoutPops }
          ]),
          [
            {
              errorType: 'NotProvided',
              message: "'pops' is required",
              pointer: popsPointer
            }
          ]
        )
      })
    })

    describe("Scenario: A Receipt isn't created when POP details are given for waste declared as not containing POPs", () => {
      it('rejects the POP details as not permitted', async () => {
        await expectRejected(withPops({ ...popsPresent, isPresent: false }), [
          {
            errorType: 'NotAllowed',
            message: "Not allowed unless 'isPresent' is true",
            pointer: `${popsPointer}/sourceOfComponents`
          },
          {
            errorType: 'NotAllowed',
            message: "Not allowed unless 'isPresent' is true",
            pointer: `${popsPointer}/components`
          }
        ])
      })
    })

    describe("Scenario: A Receipt isn't created when the waste contains POPs but none are declared", () => {
      it('rejects no POPs being declared, saying at least one is required', async () => {
        const { components, ...withoutComponents } = popsPresent
        await expectRejected(withPops(withoutComponents), [
          {
            errorType: 'NotProvided',
            message: "Required when 'isPresent' is true",
            pointer: `${popsPointer}/components`
          }
        ])
      })

      it('rejects an empty list of POPs, saying at least one is required', async () => {
        await expectRejected(withComponents([]), [
          {
            errorType: 'OutOfRange',
            message: 'must NOT have fewer than 1 items',
            pointer: `${popsPointer}/components`
          }
        ])
      })

      // At least one is needed whatever the source, even when it's not
      // provided.
      it('rejects no POPs being declared when the source is not provided', async () => {
        await expectRejected(
          withPops({ isPresent: true, sourceOfComponents: 'NOT_PROVIDED' }),
          [
            {
              errorType: 'NotProvided',
              message: "Required when 'isPresent' is true",
              pointer: `${popsPointer}/components`
            }
          ]
        )
      })
    })

    describe("Scenario Outline: A Receipt isn't created when the POP code is missing or invalid", () => {
      // Examples: Not provided or empty
      it('rejects a POP code that is not provided, as required', async () => {
        await expectRejected(withComponents([{ concentration: 0.5 }]), [
          {
            errorType: 'NotProvided',
            message: "'code' is required",
            pointer: componentPointer(0, 'code')
          }
        ])
      })

      it('rejects a POP code of ""', async () => {
        await expectRejected(
          withComponents([{ code: '', concentration: 0.5 }]),
          [
            {
              errorType: 'OutOfRange',
              message: 'must NOT have fewer than 1 characters',
              pointer: componentPointer(0, 'code')
            }
          ]
        )
      })

      // Examples: Not recognised
      it.each(['Mercury', 'ABC123'])(
        'rejects a POP code of %p as not recognised',
        async (code) => {
          await expectRejected(withComponents([{ code, concentration: 0.5 }]), [
            {
              errorType: 'InvalidValue',
              message: 'must be a recognised POP code',
              pointer: componentPointer(0, 'code')
            }
          ])
        }
      )
    })

    describe("Scenario: A Receipt isn't created when a POP has neither a concentration nor a threshold", () => {
      it('rejects the POP, saying a concentration or threshold is required', async () => {
        await expectRejected(withComponents([{ code: 'PFOA' }]), [
          {
            errorType: 'NotProvided',
            message: "Required when 'concentration' is not provided",
            pointer: componentPointer(0, 'concentrationThresholdOperator')
          }
        ])
      })
    })

    describe("Scenario: A Receipt isn't created when a POP has both a concentration and a threshold", () => {
      it('rejects the threshold, saying only one of the two is permitted', async () => {
        await expectRejected(
          withComponents([
            {
              code: 'PFOA',
              concentration: 0.5,
              concentrationThresholdOperator: 'LESS_THAN'
            }
          ]),
          [
            {
              errorType: 'NotAllowed',
              message: "Not allowed when 'concentration' is provided",
              pointer: componentPointer(0, 'concentrationThresholdOperator')
            }
          ]
        )
      })
    })

    describe("Scenario Outline: A Receipt isn't created when the POP concentration is invalid", () => {
      // Examples: Empty. "" counts as no concentration, so a threshold is
      // needed instead.
      it.each([
        ['""', ''],
        ['null', null]
      ])(
        'rejects a POP concentration of %s, saying a concentration or threshold is required',
        async (_, concentration) => {
          await expectRejected(
            withComponents([{ code: 'PFOA', concentration }]),
            [
              {
                errorType: 'NotProvided',
                message: "Required when 'concentration' is not provided",
                pointer: componentPointer(0, 'concentrationThresholdOperator')
              }
            ]
          )
        }
      )

      // Examples: Not greater than 0
      it.each([0, -1])(
        'rejects a POP concentration of %p as not greater than 0',
        async (concentration) => {
          await expectRejected(
            withComponents([{ code: 'PFOA', concentration }]),
            [
              {
                errorType: 'OutOfRange',
                message: 'Must be greater than 0',
                pointer: componentPointer(0, 'concentration')
              }
            ]
          )
        }
      )
    })

    describe("Scenario Outline: A Receipt isn't created when the POP threshold is invalid", () => {
      it.each(['Greater than', 'Above'])(
        'rejects a POP threshold of %p as not recognised',
        async (concentrationThresholdOperator) => {
          await expectRejected(
            withComponents([{ code: 'PFOA', concentrationThresholdOperator }]),
            [
              {
                errorType: 'InvalidValue',
                message:
                  "must be one of: 'LESS_THAN', 'EQUAL_TO', 'GREATER_THAN'",
                pointer: componentPointer(0, 'concentrationThresholdOperator')
              }
            ]
          )
        }
      )
    })

    describe("Scenario Outline: A Receipt isn't created when the source of the POP details is missing or invalid", () => {
      // Examples: Not provided or empty
      it('rejects a source that is not provided, as required', async () => {
        const { sourceOfComponents, ...withoutSource } = popsPresent
        await expectRejected(withPops(withoutSource), [
          {
            errorType: 'NotProvided',
            message: "Required when 'isPresent' is true",
            pointer: `${popsPointer}/sourceOfComponents`
          }
        ])
      })

      // Examples: Not recognised. "" isn't one of the sources either.
      it.each(['', 'Supplier', 'Unknown'])(
        'rejects a source of %p as not recognised',
        async (sourceOfComponents) => {
          await expectRejected(
            withPops({ ...popsPresent, sourceOfComponents }),
            [
              {
                errorType: 'InvalidValue',
                message:
                  "must be one of: 'GUIDANCE', 'PROVIDED_WITH_WASTE', 'OWN_TESTING', 'NOT_PROVIDED'",
                pointer: `${popsPointer}/sourceOfComponents`
              }
            ]
          )
        }
      )
    })

    describe("Scenario: A Receipt isn't created when any one of several POPs is declared with missing or invalid details", () => {
      it('reports each invalid detail against the POP it belongs to', async () => {
        await expectRejected(
          withComponents([
            popComponent,
            { code: 'ABC123', concentration: 0 },
            { concentrationThresholdOperator: 'Above' }
          ]),
          [
            {
              errorType: 'OutOfRange',
              message: 'Must be greater than 0',
              pointer: componentPointer(1, 'concentration')
            },
            {
              errorType: 'NotProvided',
              message: "'code' is required",
              pointer: componentPointer(2, 'code')
            },
            {
              errorType: 'InvalidValue',
              message:
                "must be one of: 'LESS_THAN', 'EQUAL_TO', 'GREATER_THAN'",
              pointer: componentPointer(2, 'concentrationThresholdOperator')
            },
            {
              errorType: 'InvalidValue',
              message: 'must be a recognised POP code',
              pointer: componentPointer(1, 'code')
            }
          ]
        )
      })
    })
  })
})
