import {
  expect,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  it,
  jest
} from '@jest/globals'
import hapi from '@hapi/hapi'
import { createReceiptMovement } from './create-receipt-movement.js'
import { mongoDb } from '../common/helpers/mongodb.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import {
  HTTP_STATUS,
  PRODUCTION_APPROVAL_TEST_SCENARIO_IDS
} from 'waste-movement-utils'
import { config } from '../config.js'
import { base64EncodedOrgApiCodes } from '../test/data/apiCodes.js'
import { requestTracing } from '../common/helpers/request-tracing.js'
import { productionApprovalTestsRequestPayload } from '../test/data/production-approval-tests.js'
import { productionApprovalTests } from './production-approval-tests.js'
import * as runProductionApprovalTests from '../services/production-approval-tests/run-production-approval-tests.js'
import { createMovementRequest } from '../test/utils/createMovementRequest.js'
import { errorHandler } from '../plugins/error-handler.js'
import { failAction } from '../common/helpers/fail-action.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

describe('Production Approval Tests Route Tests', () => {
  let server
  let payload

  beforeEach(() => {
    payload = JSON.parse(JSON.stringify(productionApprovalTestsRequestPayload))
  })

  beforeAll(async () => {
    server = hapi.server({
      routes: {
        validate: {
          options: {
            abortEarly: false
          },
          failAction
        }
      }
    })
    server.route([...createReceiptMovement, productionApprovalTests])
    await server.register([
      requestLogger,
      mongoDb,
      requestTracing,
      errorHandler
    ])
    await server.initialize()

    config.set('orgApiCodes', base64EncodedOrgApiCodes)

    const testWasteItem = {
      ...createMovementRequest().wasteItems[0],
      containsPops: false,
      pops: undefined
    }

    const createR01TestData = await server.inject({
      method: 'POST',
      url: `/movements/${productionApprovalTestsRequestPayload[0].wasteTrackingId}/receive`,
      headers: { 'x-cdp-request-id': 'trace-id-123' },
      payload: {
        movement: createMovementRequest({
          wasteItems: [testWasteItem]
        })
      }
    })

    expect(createR01TestData.statusCode).toEqual(HTTP_STATUS.NO_CONTENT)
    expect(createR01TestData.result).toEqual(null)

    const createR02TestData = await server.inject({
      method: 'POST',
      url: `/movements/${productionApprovalTestsRequestPayload[1].wasteTrackingId}/receive`,
      headers: { 'x-cdp-request-id': 'trace-id-123' },
      payload: {
        movement: createMovementRequest({
          wasteItems: [testWasteItem, testWasteItem]
        })
      }
    })

    expect(createR02TestData.statusCode).toEqual(HTTP_STATUS.NO_CONTENT)
    expect(createR02TestData.result).toEqual(null)
  })

  afterAll(async () => {
    await server.stop()
  })

  it('runs production approval tests when given a valid payload', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/production-approval-tests',
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS.OK)
    expect(result).toEqual([
      {
        scenarioId: payload[0].scenarioId,
        wasteTrackingId: payload[0].wasteTrackingId,
        status: 'Pass',
        message: ''
      },
      {
        scenarioId: payload[1].scenarioId,
        wasteTrackingId: payload[1].wasteTrackingId,
        status: 'Pass',
        message: ''
      }
    ])
  })

  it('runs production approval tests when given a valid payload with duplicate waste tracking ids', async () => {
    payload = [
      ...payload,
      {
        scenarioId: PRODUCTION_APPROVAL_TEST_SCENARIO_IDS.R03,
        wasteTrackingId: payload[0].wasteTrackingId
      }
    ]

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/production-approval-tests',
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS.OK)
    expect(result).toEqual([
      {
        scenarioId: payload[0].scenarioId,
        wasteTrackingId: payload[0].wasteTrackingId,
        status: 'Pass',
        message: ''
      },
      {
        scenarioId: payload[1].scenarioId,
        wasteTrackingId: payload[1].wasteTrackingId,
        status: 'Pass',
        message: ''
      },
      {
        scenarioId: payload[2].scenarioId,
        wasteTrackingId: payload[2].wasteTrackingId,
        status: 'Pass',
        message: ''
      }
    ])
  })

  it('returns a 400 error when given waste tracking ids that do not exist', async () => {
    const invalidWasteTrackingId1 = generateWasteTrackingId()
    const invalidWasteTrackingId2 = generateWasteTrackingId()

    payload = [
      ...payload,
      {
        scenarioId: PRODUCTION_APPROVAL_TEST_SCENARIO_IDS.R03,
        wasteTrackingId: invalidWasteTrackingId1
      },
      {
        scenarioId: PRODUCTION_APPROVAL_TEST_SCENARIO_IDS.R04,
        wasteTrackingId: invalidWasteTrackingId2
      }
    ]

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/production-approval-tests',
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      validation: {
        errors: [
          {
            key: 'wasteTrackingId',
            errorType: 'InvalidValue',
            message: `Could not find waste input(s) for the following id(s): ${invalidWasteTrackingId1}, ${invalidWasteTrackingId2}`
          }
        ]
      }
    })
  })

  it('returns a 400 error when given an invalid payload', async () => {
    const invalidWastetrackingId = generateWasteTrackingId()

    payload = [
      ...payload,
      {
        scenarioId: PRODUCTION_APPROVAL_TEST_SCENARIO_IDS.R01,
        wasteTrackingId: invalidWastetrackingId
      }
    ]

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/production-approval-tests',
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      validation: {
        errors: [
          {
            key: 'ProductionApprovalTestRequest',
            errorType: 'InvalidValue',
            message:
              '"ProductionApprovalTestRequest" contains a duplicate scenarioId value'
          }
        ]
      }
    })
  })

  it('returns a 500 error when an error is thrown', async () => {
    const errorMessage = 'Internal Server Error'

    jest
      .spyOn(runProductionApprovalTests, 'runProductionApprovalTests')
      .mockImplementation(() => {
        throw new Error(errorMessage)
      })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/production-approval-tests',
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      error: 'Error',
      message: errorMessage,
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR
    })
  })
})
