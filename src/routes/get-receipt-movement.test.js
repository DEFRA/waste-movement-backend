import { expect, describe, beforeAll, afterAll, it, jest } from '@jest/globals'
import hapi from '@hapi/hapi'
import { mongoDb } from '../common/helpers/mongodb.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { requestTracing } from '../common/helpers/request-tracing.js'
import { getReceiptMovement } from './get-receipt-movement.js'
import * as movementGet from '../services/movement-get.js'
import { Db } from 'mongodb'

const errorMessage = 'Database connection failed'

jest.mock('../services/movement-get.js', () => ({
  getWasteInputs: jest
    .fn()
    .mockImplementationOnce(() => [
      {
        wasteTrackingId: '26NWSI1G',
        revision: 2
      }
    ])
    .mockImplementationOnce(() => [])
    .mockImplementationOnce(() => {
      throw new Error(errorMessage)
    })
}))

describe('Get Receipt Movement Route Tests', () => {
  let server

  const wasteTrackingId = '26NWSI1G'
  const bulkId = '667aa5bf-008a-4661-8edd-53bf73554307'
  const includeHistory = true
  const traceId = 'created-trace-id-123'

  beforeAll(async () => {
    server = hapi.server()
    server.route(getReceiptMovement)
    await server.register([requestLogger, mongoDb, requestTracing])
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('returns waste inputs', async () => {
    const getWasteInputsSpy = jest.spyOn(movementGet, 'getWasteInputs')

    const { statusCode, result } = await server.inject({
      method: 'GET',
      url: `/qa-non-prod/movements?wasteTrackingId=${wasteTrackingId}&bulkId=${bulkId}&includeHistory=${includeHistory}`,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result).toEqual([
      {
        wasteTrackingId: '26NWSI1G',
        revision: 2
      }
    ])

    expect(getWasteInputsSpy).toHaveBeenCalledWith({
      db: expect.any(Db),
      wasteTrackingId,
      bulkId,
      includeHistory
    })
  })

  it('returns a 400 error when validation fails', async () => {
    const getWasteInputsSpy = jest.spyOn(movementGet, 'getWasteInputs')

    const { statusCode } = await server.inject({
      method: 'GET',
      url: `/qa-non-prod/movements`,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)

    expect(getWasteInputsSpy).not.toHaveBeenCalled()
  })

  it('returns a 404 error when a waste movement is not found', async () => {
    const getWasteInputsSpy = jest.spyOn(movementGet, 'getWasteInputs')

    const { statusCode } = await server.inject({
      method: 'GET',
      url: '/qa-non-prod/movements?wasteTrackingId=id-does-not-exist',
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.NOT_FOUND)

    expect(getWasteInputsSpy).toHaveBeenCalledWith({
      db: expect.any(Db),
      wasteTrackingId: 'id-does-not-exist'
    })
  })

  it('returns a 500 error when an error is thrown', async () => {
    const getWasteInputsSpy = jest.spyOn(movementGet, 'getWasteInputs')

    const { statusCode, result } = await server.inject({
      method: 'GET',
      url: `/qa-non-prod/movements?wasteTrackingId=${wasteTrackingId}`,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      statusCode: 500,
      error: 'Error',
      message: errorMessage
    })

    expect(getWasteInputsSpy).toHaveBeenCalledWith({
      db: expect.any(Db),
      wasteTrackingId
    })
  })
})
