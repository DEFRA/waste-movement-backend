import hapi from '@hapi/hapi'
import { createReceiptMovement } from './create-receipt-movement.js'
import { createWasteInput } from '../services/movement-create.js'
import { WasteInput } from '../domain/wasteInput.js'

jest.mock('../services/movement-create.js')

describe('movement Route Tests', () => {
  let server

  beforeAll(async () => {
    server = hapi.server()
    server.route(createReceiptMovement)
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(async () => {})

  it('creates a waste input', async () => {
    const wasteTrackingId = '238ut324'
    const expectedPayload = {
      movement: {
        receivingSiteId: 'string',
        receiverReference: 'string',
        specialHandlingRequirements: 'string',
        waste: [
          {
            ewcCode: 'string',
            description: 'string',
            form: 'Gas',
            containers: 'string',
            quantity: {
              value: 0,
              unit: 'string',
              isEstimate: true
            }
          }
        ],
        carrier: {
          registrationNumber: 'string',
          organisationName: 'string',
          address: 'string',
          emailAddress: 'test@email.com',
          companiesHouseNumber: 'string',
          phoneNumber: 'string',
          vehicleRegistration: 'string',
          meansOfTransport: 'Road'
        },
        acceptance: {
          acceptingAll: true
        },
        receiver: {
          authorisationType: 'string',
          authorisationNumber: 'string',
          regulatoryPositionStatement: 'string'
        },
        receipt: {
          estimateOrActual: 'Estimate',
          dateTimeReceived: new Date(2025, 5, 30),
          disposalOrRecoveryCode: {
            code: 'string',
            quantity: {
              value: 0,
              unit: 'string',
              isEstimate: true
            }
          }
        }
      }
    }
    const expectedWasteInput = new WasteInput()
    expectedWasteInput.receipt = expectedPayload
    expectedWasteInput.wasteTrackingId = wasteTrackingId

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: expectedPayload
    })

    expect(statusCode).toEqual(204)
    expect(result).toEqual(null)

    expect(createWasteInput).toHaveBeenCalledWith(undefined, expectedWasteInput)
  })
})
