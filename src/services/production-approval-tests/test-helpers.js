export function buildWasteInput({ wasteItems, carrier } = {}) {
  return {
    wasteTrackingId: 'wt-test',
    receipt: {
      movement: {
        carrier: carrier ?? {
          meansOfTransport: 'Road',
          vehicleRegistration: 'AB12 CDE'
        },
        wasteItems: wasteItems ?? [buildWasteItem()]
      }
    }
  }
}

export function buildWasteItem(overrides = {}) {
  return {
    ewcCodes: ['200101'],
    disposalOrRecoveryCodes: [{ code: 'R1' }],
    ...overrides
  }
}
