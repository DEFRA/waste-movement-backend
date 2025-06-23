import hapi from '@hapi/hapi'
import { updateReceiptMovementPops } from './update-receipt-movement-pops.js'
import { updateWasteInput } from '../services/movement-update.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'

jest.mock('../services/movement-update.js')

describe('updateReceiptMovementPops Route Tests', () => {
  let server

  beforeAll(async () => {
    server = hapi.server()
    server.route(updateReceiptMovementPops)
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(async () => {})

  it('updates POPs details', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const updatePayload = {
      receipt: {
        pops: {
          // Sample POPs data
          processingCode: 'R1',
          processingDate: '2023-05-15',
          processingDetails: 'Recycled as per regulations',
          processingCertificate: 'CERT-12345'
        }
      }
    }

    updateWasteInput.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1
    })

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive/pops`,
      payload: updatePayload
    })

    expect(statusCode).toEqual(200)
    expect(result).toEqual(null)

    expect(updateWasteInput).toHaveBeenCalledWith(undefined, wasteTrackingId, {
      'receipt.pops': updatePayload.receipt.pops
    })
  })

  it('returns 404 when updating POPs for a non-existent waste input', async () => {
    const wasteTrackingId = 'nonexistent-id'
    const updatePayload = {
      receipt: {
        pops: {
          // Minimal payload for test
          processingCode: 'R1'
        }
      }
    }

    updateWasteInput.mockResolvedValueOnce({
      matchedCount: 0,
      modifiedCount: 0
    })

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive/pops`,
      payload: updatePayload
    })

    expect(statusCode).toEqual(404)
    expect(result).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: `Waste input with ID ${wasteTrackingId} not found`
    })

    expect(updateWasteInput).toHaveBeenCalledWith(undefined, wasteTrackingId, {
      'receipt.pops': updatePayload.receipt.pops
    })
  })
})
