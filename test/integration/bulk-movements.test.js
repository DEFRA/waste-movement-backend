import { expect, describe, beforeAll, afterAll, it } from '@jest/globals'
import { HTTP_STATUS, BULK_RESPONSE_STATUS } from '@defra/waste-movement-utils'
import { startTestService } from './helpers/test-service.js'
import { createWasteTrackingStub } from './helpers/waste-tracking-stub.js'
import { httpRequest } from './helpers/http.js'
import { expectStandardHeaders } from './helpers/expect-standard-headers.js'
import { createBulkMovementRequest } from '../../src/test/utils/createBulkMovementRequest.js'

describe('bulk movements', () => {
  let testService
  let wasteTrackingStub

  beforeAll(async () => {
    wasteTrackingStub = createWasteTrackingStub()
    await wasteTrackingStub.start()
    testService = await startTestService()
  })

  afterAll(async () => {
    await testService.stop()
    await wasteTrackingStub.stop()
  })

  it('POST /bulk/{bulkId}/movements/receive creates multiple waste inputs', async () => {
    const bulkId = 'integration-create-bulk-id'
    const payload = [createBulkMovementRequest(), createBulkMovementRequest()]

    const res = await httpRequest(
      testService.baseUrl,
      `/bulk/${bulkId}/movements/receive`,
      { method: 'POST', body: payload }
    )

    expect(res.status).toEqual(HTTP_STATUS.CREATED)
    expect(res.body.status).toEqual(BULK_RESPONSE_STATUS.MOVEMENTS_CREATED)
    expect(res.body.movements).toHaveLength(2)
    expectStandardHeaders(res)

    for (const { wasteTrackingId } of res.body.movements) {
      const persisted = await testService.db
        .collection('waste-inputs')
        .findOne({ _id: wasteTrackingId })

      expect(persisted.bulkId).toEqual(bulkId)
      expect(persisted.revision).toEqual(1)
    }
  })

  it('PUT /bulk/{bulkId}/movements/receive updates multiple waste inputs', async () => {
    const createBulkId = 'integration-update-source-bulk-id'
    const updateBulkId = 'integration-update-bulk-id'

    const createRes = await httpRequest(
      testService.baseUrl,
      `/bulk/${createBulkId}/movements/receive`,
      {
        method: 'POST',
        body: [createBulkMovementRequest(), createBulkMovementRequest()]
      }
    )
    expect(createRes.status).toEqual(HTTP_STATUS.CREATED)

    const [{ wasteTrackingId: id1 }, { wasteTrackingId: id2 }] =
      createRes.body.movements

    const updateRes = await httpRequest(
      testService.baseUrl,
      `/bulk/${updateBulkId}/movements/receive`,
      {
        method: 'PUT',
        body: [
          createBulkMovementRequest({ wasteTrackingId: id1 }),
          createBulkMovementRequest({ wasteTrackingId: id2 })
        ]
      }
    )

    expect(updateRes.status).toEqual(HTTP_STATUS.OK)
    expect(updateRes.body.status).toEqual(
      BULK_RESPONSE_STATUS.MOVEMENTS_UPDATED
    )
    expectStandardHeaders(updateRes)

    for (const wasteTrackingId of [id1, id2]) {
      const persisted = await testService.db
        .collection('waste-inputs')
        .findOne({ _id: wasteTrackingId })

      expect(persisted.revision).toEqual(2)
    }
  })
})
