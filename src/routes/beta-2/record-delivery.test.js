import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as delivery from '../../services/delivery.js'
import { httpClients } from '../../common/helpers/http-client.js'
import { config } from '../../config.js'
import { createTestMongoDb } from '../../test/create-test-mongo-db.js'
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
  supportingReference,
  carrier,
  hazardousWasteItem,
  wasteItem
} from '../../schemas/beta-2/test-helpers.js'

const backoffOptionsConfig = { numOfAttempts: 3, startingDelay: 1 }

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

describe('POST /beta-2/deliveries', () => {
  let server
  let testMongo
  const movementId1 = '25HRA0B1'
  const movementId2 = '25HRA0B2'
  const url = '/beta-2/deliveries'
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
    // A replica set, because deliveries are written in a transaction.
    testMongo = await createTestMongoDb(true)
    config.set('mongo.uri', testMongo.mongoUri)
    config.set('mongo.readPreference', 'primary')
    config.set('orgApiCodes', base64EncodedOrgApiCodes)
    process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
    await testMongo.client.close()
    await testMongo.replicaSet?.stop()
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    // Some tests stub the delivery service; the rest need the real one.
    jest.spyOn(delivery, 'createDeliveryRecords').mockRestore()
    await server.db.collection('movements').deleteMany({})
    await server.db.collection('deliveries').deleteMany({})
  })

  it('records a delivery and returns 201 with the envelope shape', async () => {
    await server.db
      .collection('movements')
      .insertMany([{ movementId: movementId1 }, { movementId: movementId2 }])

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url,
      payload: {
        movementIds: [movementId1, movementId2],
        carrier
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: {
        deliveries: [
          {
            deliveryId: '25KMT4Z9',
            movementIds: [movementId1, movementId2],
            wasteType: 'NON_HAZARDOUS'
          }
        ]
      },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toBeDefined()

    const recordInDb = await server.db
      .collection('deliveries')
      .findOne({ deliveryId: '25KMT4Z9' })

    expect(recordInDb).toMatchObject({
      deliveryId: '25KMT4Z9',
      movementIds: [movementId1, movementId2],
      wasteType: 'NON_HAZARDOUS',
      orgId: forwardedOrganisationId
    })
  })

  it('records a delivery when supportingReferences are provided', async () => {
    await server.db
      .collection('movements')
      .insertOne({ movementId: movementId1 })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        movementIds: [movementId1],
        carrier,
        supportingReferences: [supportingReference]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result.data.deliveries).toHaveLength(1)
  })

  it('returns a 400 when a supportingReference has an unrecognised label', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        movementIds: [movementId1],
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
    await server.db
      .collection('movements')
      .insertOne({ movementId: movementId1 })

    const { headers } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1], carrier },
      headers: tracedAuthHeaders
    })

    expect(headers['x-request-id']).toBe('trace-id-123')
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
      detail: '2 validation errors occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'movementIds' is required",
          pointer: '/movementIds'
        },
        {
          errorType: 'NotProvided',
          message: "'carrier' is required",
          pointer: '/carrier'
        }
      ],
      instance: '/beta-2/deliveries',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when carrier is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1] },
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
      instance: '/beta-2/deliveries',
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
      payload: { apiCode: apiCode1, movementIds: [movementId1], carrier },
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
      instance: '/beta-2/deliveries',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when no organisation was forwarded (unknown or disabled API code)', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1], carrier },
      headers: { ...authHeaders, ...tracedHeaders }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: '/beta-2/deliveries',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when a movementId does not exist', async () => {
    await server.db
      .collection('movements')
      .insertOne({ movementId: movementId1 })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        movementIds: [movementId1, movementId2],
        carrier
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'Movement ID(s) not recognised: 25HRA0B2',
      instance: '/beta-2/deliveries',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 500 when persistence fails', async () => {
    await server.db
      .collection('movements')
      .insertOne({ movementId: movementId1 })

    jest
      .spyOn(delivery, 'createDeliveryRecords')
      .mockRejectedValue(new Error('Database connection failed'))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1], carrier },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: '/beta-2/deliveries',
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  it('returns 401 when unauthenticated', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1], carrier },
      headers: tracedHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: '/beta-2/deliveries',
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
  })

  it('returns a 500 when the response body does not match the response schema', async () => {
    await server.db
      .collection('movements')
      .insertOne({ movementId: movementId1 })
    // Stubbed so the bad id isn't rejected by the deliveries collection first.
    jest.spyOn(delivery, 'createDeliveryRecords').mockResolvedValueOnce([
      {
        deliveryId: 42,
        movementIds: [movementId1],
        wasteType: 'NON_HAZARDOUS'
      }
    ])

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { movementIds: [movementId1], carrier },
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

  describe('splits the movements by waste type', () => {
    const mintedDeliveryId = '25KMT4Z9'
    const nonHazardous = (...movementIds) => ({
      deliveryId: mintedDeliveryId,
      movementIds,
      wasteType: 'NON_HAZARDOUS'
    })
    const hazardous = (movementId) => ({
      deliveryId: movementId,
      movementIds: [movementId],
      wasteType: 'HAZARDOUS'
    })

    const seedMovements = (nonHazardousIds, hazardousIds) =>
      server.db.collection('movements').insertMany([
        ...nonHazardousIds.map((movementId) => ({
          movementId,
          wasteItems: [wasteItem]
        })),
        ...hazardousIds.map((movementId) => ({
          movementId,
          wasteItems: [hazardousWasteItem]
        }))
      ])

    const findDeliveries = () =>
      server.db
        .collection('deliveries')
        .find({}, { projection: { _id: 0, createdAt: 0 } })
        .toArray()

    it.each([
      {
        nonHazardousIds: ['261B23B4'],
        hazardousIds: [],
        submitted: ['261B23B4'],
        expected: [nonHazardous('261B23B4')],
        nextCalls: 1
      },
      {
        nonHazardousIds: ['261B23B4', '262C34C5'],
        hazardousIds: [],
        submitted: ['261B23B4', '262C34C5'],
        expected: [nonHazardous('261B23B4', '262C34C5')],
        nextCalls: 1
      },
      {
        nonHazardousIds: ['261B23B4'],
        hazardousIds: ['269X8Y7Z'],
        submitted: ['269X8Y7Z', '261B23B4'],
        expected: [nonHazardous('261B23B4'), hazardous('269X8Y7Z')],
        nextCalls: 1
      },
      {
        nonHazardousIds: ['261B23B4', '262C34C5'],
        hazardousIds: ['269X8Y7Z'],
        submitted: ['261B23B4', '269X8Y7Z', '262C34C5'],
        expected: [nonHazardous('261B23B4', '262C34C5'), hazardous('269X8Y7Z')],
        nextCalls: 1
      },
      {
        nonHazardousIds: ['261B23B4', '262C34C5'],
        hazardousIds: ['269X8Y7Z', '268W7X6Y'],
        submitted: ['269X8Y7Z', '261B23B4', '268W7X6Y', '262C34C5'],
        expected: [
          nonHazardous('261B23B4', '262C34C5'),
          hazardous('269X8Y7Z'),
          hazardous('268W7X6Y')
        ],
        nextCalls: 1
      },
      {
        nonHazardousIds: [],
        hazardousIds: ['269X8Y7Z', '268W7X6Y'],
        submitted: ['269X8Y7Z', '268W7X6Y'],
        expected: [hazardous('269X8Y7Z'), hazardous('268W7X6Y')],
        nextCalls: 0
      }
    ])(
      'non-hazardous $nonHazardousIds and hazardous $hazardousIds',
      async ({
        nonHazardousIds,
        hazardousIds,
        submitted,
        expected,
        nextCalls
      }) => {
        await seedMovements(nonHazardousIds, hazardousIds)

        const { statusCode, result } = await server.inject({
          method: 'POST',
          url,
          payload: { movementIds: submitted, carrier },
          headers: tracedAuthHeaders
        })

        expect(statusCode).toEqual(HTTP_STATUS.CREATED)
        expect(result).toEqual({
          data: { deliveries: expected },
          validation: { warnings: [] }
        })
        expect(httpClients.wasteTracking.get).toHaveBeenCalledTimes(nextCalls)
        expect(await findDeliveries()).toEqual(
          expected.map((item) => ({
            ...item,
            orgId: forwardedOrganisationId
          }))
        )
      }
    )

    it('treats a movement as hazardous when any one of its waste items has a hazardous EWC code', async () => {
      await seedMovements(['261B23B4'], [])
      await server.db.collection('movements').insertOne({
        movementId: '269X8Y7Z',
        wasteItems: [wasteItem, hazardousWasteItem]
      })

      const { statusCode, result } = await server.inject({
        method: 'POST',
        url,
        payload: { movementIds: ['261B23B4', '269X8Y7Z'], carrier },
        headers: tracedAuthHeaders
      })

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data.deliveries).toEqual([
        nonHazardous('261B23B4'),
        hazardous('269X8Y7Z')
      ])
    })

    // beta-1 movements, and beta-2 ones created before waste items were
    // stored, have no wasteItems.
    it('aggregates a movement stored without waste items as non-hazardous', async () => {
      await seedMovements([], ['269X8Y7Z'])
      await server.db
        .collection('movements')
        .insertOne({ movementId: '261B23B4' })

      const { statusCode, result } = await server.inject({
        method: 'POST',
        url,
        payload: { movementIds: ['269X8Y7Z', '261B23B4'], carrier },
        headers: tracedAuthHeaders
      })

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data.deliveries).toEqual([
        nonHazardous('261B23B4'),
        hazardous('269X8Y7Z')
      ])
    })

    it('delivers a movement ID submitted more than once only once', async () => {
      await seedMovements(['261B23B4'], ['269X8Y7Z'])

      const { statusCode, result } = await server.inject({
        method: 'POST',
        url,
        payload: {
          movementIds: ['261B23B4', '269X8Y7Z', '261B23B4', '269X8Y7Z'],
          carrier
        },
        headers: tracedAuthHeaders
      })

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data.deliveries).toEqual([
        nonHazardous('261B23B4'),
        hazardous('269X8Y7Z')
      ])
      expect(await findDeliveries()).toHaveLength(2)
    })

    describe('rejects the request without minting or storing anything', () => {
      beforeEach(() =>
        seedMovements(['261B23B4', '262C34C5'], ['269X8Y7Z', '268W7X6Y'])
      )

      it.each([
        {
          description: 'movementIds is not provided',
          payload: { carrier },
          error: {
            errorType: 'NotProvided',
            message: "'movementIds' is required",
            pointer: '/movementIds'
          }
        },
        {
          description: 'movementIds is an empty string',
          payload: { movementIds: '', carrier },
          error: {
            errorType: 'InvalidType',
            message: 'must be array',
            pointer: '/movementIds'
          }
        },
        {
          description: 'movementIds is an empty list',
          payload: { movementIds: [], carrier },
          error: {
            errorType: 'OutOfRange',
            message: 'must NOT have fewer than 1 items',
            pointer: '/movementIds'
          }
        }
      ])('when $description', async ({ payload, error }) => {
        const { statusCode, result } = await server.inject({
          method: 'POST',
          url,
          payload,
          headers: tracedAuthHeaders
        })

        expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
        expect(result.errors).toEqual([error])
        expect(httpClients.wasteTracking.get).not.toHaveBeenCalled()
        expect(await findDeliveries()).toEqual([])
      })

      it.each([
        { submitted: ['26ZZZZZZ'], unrecognised: '26ZZZZZZ' },
        { submitted: ['269ZZZZZ'], unrecognised: '269ZZZZZ' },
        { submitted: ['261B23B4', '26ZZZZZZ'], unrecognised: '26ZZZZZZ' }
      ])(
        'when $submitted includes an unrecognised movement ID',
        async ({ submitted, unrecognised }) => {
          const { statusCode, result } = await server.inject({
            method: 'POST',
            url,
            payload: { movementIds: submitted, carrier },
            headers: tracedAuthHeaders
          })

          expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
          expect(result.detail).toEqual(
            `Movement ID(s) not recognised: ${unrecognised}`
          )
          expect(httpClients.wasteTracking.get).not.toHaveBeenCalled()
          expect(await findDeliveries()).toEqual([])
        }
      )
    })
  })
})
