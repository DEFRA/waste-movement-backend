import hapi from '@hapi/hapi'
import { movementUpdate } from './movement-update.js'
import { updateWasteInput } from '../movement-update.js'

jest.mock('../movement-update.js')

describe('movementUpdate Route Tests', () => {
  let server

  beforeAll(async () => {
    server = hapi.server()
    server.route(movementUpdate)
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(async () => {})

  it('updates a waste input', async () => {
    const wasteTrackingId = '238ut324'
    const updatePayload = {
      movement: {
        receivingSiteId: 'updated-site',
        receiverReference: 'updated-ref',
        specialHandlingRequirements: 'updated-requirements',
        waste: [
          {
            ewcCode: 'updated-code',
            description: 'updated-description',
            form: 'Liquid',
            containers: 'updated-containers',
            quantity: {
              value: 10,
              unit: 'kg',
              isEstimate: false
            }
          }
        ],
        carrier: {
          registrationNumber: 'updated-reg',
          organisationName: 'updated-org',
          address: 'updated-address',
          emailAddress: 'updated@email.com',
          companiesHouseNumber: 'updated-ch',
          phoneNumber: 'updated-phone',
          vehicleRegistration: 'updated-vehicle',
          meansOfTransport: 'Rail'
        },
        acceptance: {
          acceptingAll: true
        },
        receiver: {
          authorisationType: 'updated-type',
          authorisationNumber: 'updated-number',
          regulatoryPositionStatement: 'updated-statement'
        },
        receipt: {
          estimateOrActual: 'Actual',
          dateTimeReceived: new Date(2025, 6, 15),
          disposalOrRecoveryCode: {
            code: 'updated-code',
            quantity: {
              value: 10,
              unit: 'kg',
              isEstimate: false
            }
          }
        }
      }
    }

    updateWasteInput.mockResolvedValueOnce({
      matchedCount: 1,
      modifiedCount: 1
    })

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: updatePayload
    })

    expect(statusCode).toEqual(200)
    expect(result).toEqual(null)

    expect(updateWasteInput).toHaveBeenCalledWith(undefined, wasteTrackingId, {
      receipt: updatePayload
    })
  })

  it('returns 404 when updating a non-existent waste input', async () => {
    const wasteTrackingId = 'nonexistent-id'
    const updatePayload = {
      movement: {
        receivingSiteId: 'updated-site',
        receiverReference: 'updated-ref',
        // Minimal payload for test
        carrier: {
          registrationNumber: 'updated-reg',
          organisationName: 'updated-org',
          address: 'updated-address',
          emailAddress: 'updated@email.com',
          phoneNumber: 'updated-phone',
          vehicleRegistration: 'updated-vehicle',
          meansOfTransport: 'Road'
        },
        acceptance: {
          acceptingAll: true
        },
        receiver: {
          authorisationType: 'updated-type',
          authorisationNumber: 'updated-number'
        },
        receipt: {
          estimateOrActual: 'Actual',
          dateTimeReceived: new Date(2025, 6, 15)
        }
      }
    }

    updateWasteInput.mockResolvedValueOnce({
      matchedCount: 0,
      modifiedCount: 0
    })

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: updatePayload
    })

    expect(statusCode).toEqual(404)
    expect(result).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: `Waste input with ID ${wasteTrackingId} not found`
    })

    expect(updateWasteInput).toHaveBeenCalledWith(undefined, wasteTrackingId, {
      receipt: updatePayload
    })
  })
})
