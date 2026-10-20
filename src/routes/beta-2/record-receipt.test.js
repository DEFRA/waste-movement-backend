import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as delivery from '../../services/delivery.js'
import { config } from '../../config.js'
import { apiCode1, base64EncodedOrgApiCodes } from '../../test/data/apiCodes.js'
import {
  requestBasicAuthTest1,
  userBasicAuthTest1
} from '../../test/data/basic-auth.js'
import { createServer } from '../../server.js'
import { breakNextResponse } from '../../test/break-next-response.js'
import { organisationHeaders } from '../../test/data/organisation-headers.js'
import {
  brokerOrDealerEntry,
  supportingReference,
  carrier,
  receiver,
  physicalDetails,
  hazardous,
  treatment
} from '../../schemas/beta-2/test-helpers.js'

const backoffOptionsConfig = { numOfAttempts: 3, startingDelay: 1 }
const treatments = [treatment]

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

describe('POST /beta-2/deliveries/{deliveryId}/receipt', () => {
  let server
  const deliveryId = '25KMT4Z9'
  const url = `/beta-2/deliveries/${deliveryId}/receipt`
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
    // clearAllMocks doesn't undo a test's mockRejectedValue on deliveryExists,
    // which would otherwise fail every later request with a 500.
    if (jest.isMockFunction(delivery.deliveryExists)) {
      delivery.deliveryExists.mockRestore()
    }
    await server.db.collection('deliveries').deleteMany({})
  })

  it('acknowledges receipt against an existing delivery and returns 201 with the envelope shape', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver, physicalDetails, hazardous, treatments },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toBeDefined()
  })

  // Scenario: A Receipt is created when more than one treatment is declared.
  it('acknowledges receipt when more than one treatment is declared', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        carrier,
        receiver,
        physicalDetails,
        hazardous,
        treatments: [treatment, { ...treatment, disposalOrRecoveryCode: 'D10' }]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
  })

  it('acknowledges receipt when a brokerOrDealer and supportingReferences are provided', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        carrier,
        receiver,
        physicalDetails,
        hazardous,
        treatments,
        brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] },
        supportingReferences: [supportingReference]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
  })

  it('returns a 400 when a declared brokerOrDealer has no details', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        carrier,
        receiver,
        physicalDetails,
        hazardous,
        treatments,
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
        carrier,
        receiver,
        physicalDetails,
        hazardous,
        treatments,
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
    await server.db.collection('deliveries').insertOne({ deliveryId })

    const { headers } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver, physicalDetails, hazardous, treatments },
      headers: {
        ...authHeaders,
        ...organisationHeaders,
        'x-cdp-request-id': 'trace-id-123'
      }
    })

    expect(headers['x-request-id']).toEqual(traceId)
  })

  it('returns a 404 when the delivery does not exist', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver, physicalDetails, hazardous, treatments },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.NOT_FOUND)
    expect(result).toEqual({
      detail: `No delivery exists with delivery ID: ${deliveryId}`,
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Not Found',
      type: `${expectedTypeBase}not-found`,
      requestId: traceId
    })
  })

  it('returns a 400 when the deliveryId is not in the ID format', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/beta-2/deliveries/NONEXISTENT/receipt',
      payload: {},
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      {
        errorType: 'InvalidFormat',
        message: "must match pattern '^[0-9]{2}[A-Z0-9]{6,7}$'",
        pointer: '/deliveryId'
      }
    ])
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
        physicalDetails,
        hazardous,
        treatments
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
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when carrier is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { receiver, physicalDetails, hazardous, treatments },
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
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when physicalDetails is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver, hazardous, treatments },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'physicalDetails' is required",
          pointer: '/physicalDetails'
        }
      ],
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  // Scenario: A Receipt isn't created when no treatment is declared.
  it('returns a 400 when treatments is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver, physicalDetails, hazardous },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'treatments' is required",
          pointer: '/treatments'
        }
      ],
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  // Scenario: A Receipt isn't created when any one of several treatments is
  // declared with missing or invalid details.
  it('returns a 400 naming each invalid field of each invalid treatment', async () => {
    const { weight, ...noWeight } = treatment
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        carrier,
        receiver,
        physicalDetails,
        hazardous,
        treatments: [
          treatment,
          noWeight,
          { ...treatment, disposalOrRecoveryCode: 'R14' }
        ]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      expect.objectContaining({
        errorType: 'NotProvided',
        pointer: '/treatments/1/weight'
      }),
      expect.objectContaining({
        errorType: 'InvalidValue',
        pointer: '/treatments/2/disposalOrRecoveryCode'
      })
    ])
  })

  it('returns a 400 when receiver is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, physicalDetails, hazardous, treatments },
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
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when no organisation was forwarded (unknown or disabled API code)', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver, physicalDetails, hazardous, treatments },
      headers: { ...authHeaders, ...tracedHeaders }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 500 when the delivery lookup fails', async () => {
    const error = 'Database connection failed'
    jest.spyOn(delivery, 'deliveryExists').mockRejectedValue(new Error(error))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver, physicalDetails, hazardous, treatments },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  it('returns 401 when unauthenticated', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver, physicalDetails, hazardous, treatments },
      headers: tracedHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: url,
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
  })

  it('returns a 500 when the response body does not match the response schema', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })
    breakNextResponse(server, (body) => ({ ...body, data: {} }))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver, physicalDetails, hazardous, treatments },
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

  describe('Feature: Declaring the hazardous properties of the waste received against a delivery', () => {
    const withHazardous = (hazardous) => ({
      carrier,
      receiver,
      physicalDetails,
      hazardous,
      treatments
    })

    const submit = (payload) =>
      server.inject({
        method: 'POST',
        url,
        payload,
        headers: tracedAuthHeaders
      })

    const expectCreated = async (payload) => {
      await server.db.collection('deliveries').insertOne({ deliveryId })

      const { statusCode, result } = await submit(payload)

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data).toEqual({ deliveryId })
    }

    const expectRejected = async (payload, errors) => {
      await server.db.collection('deliveries').insertOne({ deliveryId })

      const { statusCode, result } = await submit(payload)

      expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(result.errors).toEqual(errors)
    }

    const hazardousPointer = '/hazardous'
    const codesPointer = `${hazardousPointer}/codes`
    const quoted = (code) => `'${code}'`
    const hpCodes = [
      'HP_1',
      'HP_2',
      'HP_3',
      'HP_4',
      'HP_5',
      'HP_6',
      'HP_7',
      'HP_8',
      'HP_9',
      'HP_10',
      'HP_11',
      'HP_12',
      'HP_13',
      'HP_14',
      'HP_15',
      'HP_POP'
    ]
    const codeNotRecognised = (pointer) => ({
      errorType: 'InvalidValue',
      message: `must be one of: ${hpCodes.map(quoted).join(', ')}`,
      pointer
    })

    describe('Scenario: A Receipt is created when the waste is declared as having no hazardous properties', () => {
      it('creates the receipt', async () => {
        await expectCreated(withHazardous({ isPresent: false }))
      })
    })

    describe('Scenario Outline: A Receipt is created when hazardous properties are declared', () => {
      it.each([[['HP_4']], [['HP_4', 'HP_8']]])(
        'creates the receipt with codes %p',
        async (codes) => {
          await expectCreated(withHazardous({ isPresent: true, codes }))
        }
      )
    })

    describe("Scenario Outline: A Receipt isn't created when whether the waste has hazardous properties is missing or invalid", () => {
      it('rejects whether the waste has hazardous properties not being provided, as required', async () => {
        await expectRejected(withHazardous({}), [
          {
            errorType: 'NotProvided',
            message: "'isPresent' is required",
            pointer: `${hazardousPointer}/isPresent`
          }
        ])
      })

      // "" isn't true or false either.
      it.each(['', 'Maybe', 'Unknown'])(
        'rejects whether the waste has hazardous properties of %p as not true or false',
        async (isPresent) => {
          await expectRejected(withHazardous({ isPresent }), [
            {
              errorType: 'InvalidType',
              message: 'must be boolean',
              pointer: `${hazardousPointer}/isPresent`
            }
          ])
        }
      )

      it('rejects hazardous properties not being declared at all', async () => {
        const { hazardous: _, ...withoutHazardous } = withHazardous()
        await expectRejected(withoutHazardous, [
          {
            errorType: 'NotProvided',
            message: "'hazardous' is required",
            pointer: hazardousPointer
          }
        ])
      })
    })

    describe("Scenario Outline: A Receipt isn't created when the waste has hazardous properties but the codes are missing or invalid", () => {
      it('rejects codes not being provided, saying they are required', async () => {
        await expectRejected(withHazardous({ isPresent: true }), [
          {
            errorType: 'NotProvided',
            message: "Required when 'isPresent' is true",
            pointer: codesPointer
          }
        ])
      })

      it('rejects an empty list of codes, saying at least one is required', async () => {
        await expectRejected(withHazardous({ isPresent: true, codes: [] }), [
          {
            errorType: 'OutOfRange',
            message: 'must NOT have fewer than 1 items',
            pointer: codesPointer
          }
        ])
      })

      it('rejects codes of "" as not a list', async () => {
        await expectRejected(withHazardous({ isPresent: true, codes: '' }), [
          {
            errorType: 'InvalidType',
            message: 'must be array',
            pointer: codesPointer
          }
        ])
      })

      it.each(['HP_22', 'Flammable'])(
        'rejects a code of %p as not recognised',
        async (code) => {
          await expectRejected(
            withHazardous({ isPresent: true, codes: [code] }),
            [codeNotRecognised(`${codesPointer}/0`)]
          )
        }
      )

      it('reports each unrecognised code against that code', async () => {
        await expectRejected(
          withHazardous({ isPresent: true, codes: ['HP01', 'HP_99'] }),
          [
            codeNotRecognised(`${codesPointer}/0`),
            codeNotRecognised(`${codesPointer}/1`)
          ]
        )
      })
    })

    describe("Scenario: A Receipt isn't created when codes are given for waste declared as having no hazardous properties", () => {
      it('rejects the codes as not permitted', async () => {
        await expectRejected(
          withHazardous({ isPresent: false, codes: ['HP_4'] }),
          [
            {
              errorType: 'NotAllowed',
              message: "Not allowed unless 'isPresent' is true",
              pointer: codesPointer
            }
          ]
        )
      })
    })
  })
})
