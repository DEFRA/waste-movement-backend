import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as movementService from '../../services/movement.js'
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
  carrier,
  supportingReference
} from '../../schemas/beta-2/test-helpers.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

jest.mock('../../common/helpers/http-client.js', () => ({
  httpClients: {
    wasteTracking: {
      get: jest
        .fn()
        .mockResolvedValue({ payload: { wasteTrackingId: '26S8EYDJ' } })
    }
  }
}))

describe('collection Route Tests version: beta-2', () => {
  let server
  const endpointVersion = 'beta-2'
  const errorMessage = 'Database connection failed'
  const traceId = 'created-trace-id-123'
  const goodPayload = { carrier }
  const goodMovementId = 'movementId'

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

  it('creates a collection when a valid movementId is provided', async () => {
    const getMovementRecordSpy = jest
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue({ id: goodMovementId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('creates a collection when a brokerOrDealer is declared', async () => {
    const payload = {
      carrier,
      brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] }
    }
    const getMovementRecordSpy = jest
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue({ id: goodMovementId })
    const url = `/${endpointVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('returns an error when a declared brokerOrDealer has no details', async () => {
    const invalidPayload = {
      carrier,
      brokerOrDealer: { isPresent: true }
    }
    const getMovementRecordSpy = jest.spyOn(
      movementService,
      'getMovementRecord'
    )
    const url = `/${endpointVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual({
      errorType: 'NotProvided',
      message: '"items" is required',
      pointer: '/brokerOrDealer/items'
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when brokerOrDealer details are given without declaring involvement', async () => {
    const invalidPayload = {
      carrier,
      brokerOrDealer: { isPresent: false, items: [brokerOrDealerEntry] }
    }
    const getMovementRecordSpy = jest.spyOn(
      movementService,
      'getMovementRecord'
    )
    const url = `/${endpointVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        errorType: 'NotAllowed',
        pointer: '/brokerOrDealer/items'
      })
    )
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('creates a collection when supportingReferences are provided', async () => {
    const payload = {
      carrier,
      supportingReferences: [supportingReference]
    }
    const getMovementRecordSpy = jest
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue({ id: goodMovementId })
    const url = `/${endpointVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('returns an error when a supportingReference has an unrecognised label', async () => {
    const invalidPayload = {
      carrier,
      supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
    }
    const getMovementRecordSpy = jest.spyOn(
      movementService,
      'getMovementRecord'
    )
    const url = `/${endpointVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        errorType: 'InvalidValue',
        pointer: '/supportingReferences/0/label'
      })
    )
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('creates a collection when specialHandlingRequirements are provided', async () => {
    const payload = {
      carrier,
      specialHandlingRequirements: 'Handle with care and keep upright.'
    }
    const getMovementRecordSpy = jest
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue({ id: goodMovementId })
    const url = `/${endpointVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('returns an error when specialHandlingRequirements is too long', async () => {
    const invalidPayload = {
      specialHandlingRequirements: 'A'.repeat(501)
    }
    const getMovementRecordSpy = jest.spyOn(
      movementService,
      'getMovementRecord'
    )
    const url = `/${endpointVersion}/movements/${goodMovementId}/collection`
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        pointer: '/specialHandlingRequirements'
      })
    )
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('rejects when no organisation was forwarded (unknown or disabled API code)', async () => {
    const getMovementRecordSpy = jest.spyOn(
      movementService,
      'getMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: '/beta-2/movements/movementId/collection',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('handles when given movementId is not in the system', async () => {
    const getMovementRecordSpy = jest
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue(null)

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.NOT_FOUND)
    expect(result).toEqual({
      detail: 'movementId not found',
      instance: '/beta-2/movements/movementId/collection',
      title: 'Not Found',
      type: `${expectedTypeBase}not-found`
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('returns an error when carrier is missing', async () => {
    const invalidPayload = {}
    const getMovementRecordSpy = jest.spyOn(
      movementService,
      'getMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: '"carrier" is required',
          pointer: '/carrier'
        }
      ],
      instance: '/beta-2/movements/movementId/collection',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  // apiCode is sent in the x-api-code header and resolved by the
  // external API, so the backend rejects it in the body.
  it('returns an error when apiCode is sent in the body', async () => {
    const invalidPayload = { apiCode: apiCode1, carrier }
    const getMovementRecordSpy = jest.spyOn(
      movementService,
      'getMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
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
      instance: '/beta-2/movements/movementId/collection',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('handles error when getting movement', async () => {
    const getMovementRecordSpy = jest
      .spyOn(movementService, 'getMovementRecord')
      .mockRejectedValue(new Error(errorMessage))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: '/beta-2/movements/movementId/collection',
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })

    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('should immediately return 401 when request is unauthenticated', async () => {
    const getMovementRecordSpy = jest.spyOn(
      movementService,
      'getMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: '/beta-2/movements/movementId/collection',
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns a 500 when the response body does not match the response schema', async () => {
    jest
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValueOnce({ id: goodMovementId })
    breakNextResponse(server, (body) => ({ ...body, data: 'not-an-object' }))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })
})
