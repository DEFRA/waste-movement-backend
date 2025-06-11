import hapi from '@hapi/hapi'
import { updateHazardousWaste } from './update-hazardous-waste.js'
import { updateWasteInput } from '../services/movement-update.js'

jest.mock('../services/movement-update.js')

describe('updateHazardousWaste Route Tests', () => {
  let server

  beforeAll(async () => {
    server = hapi.server()
    server.route(updateHazardousWaste)
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(async () => {})

  it('updates hazardous waste details', async () => {
    const wasteTrackingId = '238ut324'
    const updatePayload = {
      receipt: {
        hazardousWaste: {
          // Sample hazardous waste data
          hazardCode: 'H3-A',
          components: [
            {
              name: 'Toxic substance',
              concentration: '10%'
            }
          ],
          physicalForm: 'Liquid',
          handlingInstructions: 'Handle with care'
        }
      }
    }

    updateWasteInput.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1
    })

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive/hazardous`,
      payload: updatePayload
    })

    expect(statusCode).toEqual(200)
    expect(result).toEqual(null)

    expect(updateWasteInput).toHaveBeenCalledWith(undefined, wasteTrackingId, {
      'receipt.hazardousWaste': updatePayload.receipt.hazardousWaste
    })
  })

  it('returns 404 when updating hazardous waste for a non-existent waste input', async () => {
    const wasteTrackingId = 'nonexistent-id'
    const updatePayload = {
      receipt: {
        hazardousWaste: {
          // Minimal payload for test
          hazardCode: 'H3-A'
        }
      }
    }

    updateWasteInput.mockResolvedValueOnce({
      matchedCount: 0,
      modifiedCount: 0
    })

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive/hazardous`,
      payload: updatePayload
    })

    expect(statusCode).toEqual(404)
    expect(result).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: `Waste input with ID ${wasteTrackingId} not found`
    })

    expect(updateWasteInput).toHaveBeenCalledWith(undefined, wasteTrackingId, {
      'receipt.hazardousWaste': updatePayload.receipt.hazardousWaste
    })
  })
})
