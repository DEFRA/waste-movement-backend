import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as movementCreate from '../../services/movement.js'
import { config } from '../../config.js'
import {
  apiCode1,
  apiCode3,
  base64EncodedOrgApiCodes
} from '../../test/data/apiCodes.js'
import {
  requestBasicAuthTest1,
  userBasicAuthTest1
} from '../../test/data/basic-auth.js'
import { createServer } from '../../server.js'

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
        .mockResolvedValue({ payload: { wasteTrackingId: '26S8EYDJ' } })
    }
  }
}))

describe('movement Route Tests version: beta-2', () => {
  let server
  const endpointVersion = 'beta-2'
  const errorMessage = 'Database connection failed'
  const traceId = 'created-trace-id-123'
  const apiCode = apiCode1
  const producer = {
    wasteSource: 'Household',
    councilMovement: true
  }
  const goodPayload = { apiCode, producer }

  const commercialProducer = {
    wasteSource: 'Commercial',
    organisationName: 'ACME Waste Producers Ltd',
    authorisationNumber: 'EAS/P/123456',
    address: {
      fullAddress: '10 Industrial Way, Test City',
      postcode: 'TE1 2PQ'
    },
    contactDetails: {
      emailAddress: 'producer@example.com',
      phoneNumber: '01234567890'
    },
    sicCode: '38110',
    councilMovement: false
  }

  const municipalProducer = {
    wasteSource: 'Municipal',
    organisationName: 'Test Council',
    reasonForNoAuthorisationNumber: 'TBC',
    address: {
      fullAddress: 'Council Depot, Test City',
      postcode: 'TE1 5CD'
    },
    contactDetails: {
      emailAddress: 'waste.services@example.gov.uk',
      phoneNumber: '01234567890'
    },
    councilMovement: true
  }

  const expectedTypeBase =
    'https://defra.github.io/digital-waste-tracking-api-docs/preview/problems/'

  beforeAll(async () => {
    config.set('orgApiCodes', base64EncodedOrgApiCodes)

    process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

    server = await createServer()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('creates a movement', async () => {
    const createMovementRecordSpy = jest
      .spyOn(movementCreate, 'createMovementRecord')
      .mockResolvedValue(goodPayload)

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { movementId: expect.any(String) },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toEqual(traceId)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['Commercial', commercialProducer],
    ['Municipal', municipalProducer]
  ])('creates a movement for a %s producer', async (_wasteSource, prod) => {
    const payload = { apiCode, producer: prod }
    const createMovementRecordSpy = jest
      .spyOn(movementCreate, 'createMovementRecord')
      .mockResolvedValue(payload)

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { movementId: expect.any(String) },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toEqual(traceId)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('handles error when creating a movement fails', async () => {
    const createMovementRecordSpy = jest
      .spyOn(movementCreate, 'createMovementRecord')
      .mockRejectedValue(new Error(errorMessage))

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: '/beta-2/movements',
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
    expect(headers['content-type']).toContain('application/problem+json')

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(
      backoffOptionsConfig.numOfAttempts
    )
  })

  it('returns an error when apiCode is missing and does not create a movement', async () => {
    const invalidPayload = { producer }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: '"apiCode" is required',
          pointer: '/apiCode'
        }
      ],
      instance: '/beta-2/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when producer is missing and does not create a movement', async () => {
    const invalidPayload = { apiCode }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: '"producer" is required',
          pointer: '/producer'
        }
      ],
      instance: '/beta-2/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when apiCode validation fails and does not create a movement', async () => {
    const invalidPayload = { apiCode: apiCode3, producer }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: '/beta-2/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('should return 401 when request is unauthenticated', async () => {
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: `/${endpointVersion}/movements`,
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })
})
