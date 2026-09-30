// Shared fixtures for the beta-2 schema tests
import { getErrors, validate } from '../validate/index.js'

export const validatorFor = (schemaId) => (payload) => {
  const valid = validate(schemaId, payload)
  return { valid, errors: valid ? null : getErrors(schemaId) }
}

export const apiCode = '25b14080-5e77-4f91-9957-2482a0cb8775'

export const address = {
  fullAddress: '10 Industrial Way, Test City',
  postcode: 'TE1 2PQ'
}

export const contactDetails = {
  emailAddress: 'producer@example.com',
  phoneNumber: '01234567890'
}

export const householdProducer = {
  wasteSource: 'Household',
  councilMovement: true
}

export const commercialProducer = {
  wasteSource: 'Commercial',
  organisationName: 'ACME Waste Producers Ltd',
  authorisationNumber: 'EAS/P/123456',
  address,
  contactDetails,
  sicCode: '38110',
  councilMovement: false
}

export const municipalProducer = {
  wasteSource: 'Municipal',
  organisationName: 'Test Council',
  reasonForNoAuthorisationNumber: 'TBC',
  address: {
    fullAddress: 'Council Depot, Test City',
    postcode: 'TE1 5CD'
  },
  contactDetails: {
    emailAddress: 'waste.services@example.gov.uk',
    phoneNumber: '01234567890'
  },
  councilMovement: true
}

export const brokerOrDealerEntry = {
  organisationName: 'Broker Demo Ltd',
  registrationNumber: 'CBDU654321',
  contactDetails: {
    emailAddress: 'broker@example.com',
    phoneNumber: '01112223333'
  },
  address: {
    fullAddress: '2 Broker Yard, Test City',
    postcode: 'TE1 1ST'
  }
}

export const supportingReference = {
  label: 'PO Number',
  reference: 'PO-123456'
}
