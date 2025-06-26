export const createMovementPostBody = () => ({
  movement: {
    receivingSiteId: 'test',
    receiverReference: 'test',
    specialHandlingRequirements: 'test',
    waste: [
      {
        ewcCode: 'test',
        description: 'test',
        form: 'Gas',
        containers: 'test',
        quantity: {
          value: 0,
          unit: 'test',
          isEstimate: true
        }
      }
    ],
    carrier: {
      registrationNumber: 'test',
      organisationName: 'test',
      address: 'test',
      emailAddress: 'test@test.com',
      companiesHouseNumber: 'test',
      phoneNumber: 'test',
      vehicleRegistration: 'test',
      meansOfTransport: 'Road'
    },
    acceptance: {
      acceptingAll: true
    },
    receiver: {
      authorisationType: 'test',
      authorisationNumber: 'test'
    },
    receipt: {
      estimateOrActual: 'Estimate',
      dateTimeReceived: '2025-06-29T23:00:00.000Z',
      disposalOrRecoveryCode: {
        code: 'test',
        quantity: {
          value: 0,
          unit: 'test',
          isEstimate: true
        }
      }
    }
  }
})
