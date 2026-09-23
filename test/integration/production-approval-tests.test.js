import { expect, describe, beforeAll, afterAll, it } from '@jest/globals'
import {
  HTTP_STATUS,
  productionApprovalTestsRequestPayload
} from '@defra/waste-movement-utils'
import { startTestService } from './helpers/test-service.js'
import { httpRequest } from './helpers/http.js'
import { expectStandardHeaders } from './helpers/expect-standard-headers.js'
import { createMovementRequest } from '../../src/test/utils/createMovementRequest.js'

const clientId = 'integration-test-client'

describe('POST /production-approval-tests', () => {
  let testService
  let payload

  beforeAll(async () => {
    testService = await startTestService()

    payload = JSON.parse(JSON.stringify(productionApprovalTestsRequestPayload))

    const testWasteItem = {
      ...createMovementRequest().wasteItems[0],
      containsPops: false,
      pops: undefined
    }

    // R01 wants exactly one waste item, R02 wants more than one.
    const wasteItemsByIndex = [[testWasteItem], [testWasteItem, testWasteItem]]

    for (const [index, { wasteTrackingId }] of payload.entries()) {
      const { status } = await httpRequest(
        testService.baseUrl,
        `/movements/${wasteTrackingId}/receive`,
        {
          method: 'POST',
          headers: { 'x-dwt-client-id': clientId },
          body: {
            movement: createMovementRequest({
              wasteItems: wasteItemsByIndex[index]
            })
          }
        }
      )
      expect(status).toEqual(HTTP_STATUS.NO_CONTENT)
    }
  })

  afterAll(async () => {
    await testService.stop()
  })

  it('runs production approval tests for the given waste tracking ids', async () => {
    const { status, body, headers } = await httpRequest(
      testService.baseUrl,
      '/production-approval-tests',
      {
        method: 'POST',
        headers: { 'x-dwt-client-id': clientId },
        body: payload
      }
    )

    expect(status).toEqual(HTTP_STATUS.OK)
    expect(body.results).toEqual(
      payload.map(({ scenarioId, wasteTrackingId }) => ({
        scenarioId,
        wasteTrackingId,
        status: 'Pass',
        message: ''
      }))
    )
    expectStandardHeaders(headers)

    const persisted = await testService.db
      .collection('production-approval-tests')
      .findOne({ clientId })

    expect(persisted._id.toString()).toEqual(body.submissionId)
  })
})
