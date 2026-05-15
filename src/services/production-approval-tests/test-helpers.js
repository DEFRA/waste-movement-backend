export function buildWasteInput({
  wasteItems,
  carrier,
  brokerOrDealer,
  reasonForNoConsignmentCode
} = {}) {
  const movement = {
    carrier: carrier ?? {
      meansOfTransport: 'Road',
      vehicleRegistration: 'AB12 CDE'
    },
    wasteItems: wasteItems ?? [buildWasteItem()]
  }

  if (brokerOrDealer !== undefined) {
    movement.brokerOrDealer = brokerOrDealer
  }

  if (reasonForNoConsignmentCode !== undefined) {
    movement.reasonForNoConsignmentCode = reasonForNoConsignmentCode
  }

  return {
    wasteTrackingId: 'wt-test',
    receipt: { movement }
  }
}

export function buildWasteItem(overrides = {}) {
  return {
    ewcCodes: ['200101'],
    disposalOrRecoveryCodes: [{ code: 'R1' }],
    containsPops: false,
    containsHazardous: false,
    ...overrides
  }
}
