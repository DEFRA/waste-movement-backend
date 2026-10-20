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
  wasteSource: 'Household'
}

export const commercialProducer = {
  wasteSource: 'Commercial',
  organisationName: 'ACME Waste Producers Ltd',
  authorisationNumber: 'EAS/P/123456',
  address,
  contactDetails,
  sicCode: '38110'
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
  }
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

export const receiver = {
  siteName: 'Receiver Site Ltd',
  authorisationNumber: 'EAS/P/123456',
  receiptAddress: {
    fullAddress: '3 Receiver Road, Test City',
    postcode: 'TE1 3RC'
  },
  contactDetails: {
    emailAddress: 'receiver@example.com',
    phoneNumber: '01234567890'
  }
}

export const carrier = {
  organisationName: 'Carrier Demo Ltd',
  registrationNumber: 'CBDU123456',
  meansOfTransport: 'Road',
  vehicleRegistration: 'AB12 CDE',
  contactDetails: {
    emailAddress: 'carrier@example.com',
    phoneNumber: '01234567890'
  },
  address: {
    fullAddress: '4 Carrier Lane, Test City',
    postcode: 'TE1 4CR'
  }
}

export const supportingReference = {
  label: 'PO Number',
  reference: 'PO-123456'
}

export const weight = {
  amount: 250.5,
  unit: 'KILOGRAMS',
  isEstimate: false
}

export const physicalDetails = {
  form: 'SOLID',
  containerType: 'DRU',
  containerCount: 4,
  totalWeight: weight
}

export const pops = {
  isPresent: false
}

export const popComponent = {
  code: 'PFOA',
  concentration: 0.5
}

export const popsPresent = {
  isPresent: true,
  sourceOfComponents: 'OWN_TESTING',
  components: [popComponent]
}

export const hazardous = {
  isPresent: false
}

export const hazardousPresent = {
  isPresent: true,
  codes: ['HP_4']
}

export const classification = {
  wasteDescription: 'Mixed municipal waste',
  ewcCodes: ['200301'],
  pops,
  hazardous
}

export const wasteItem = {
  classification,
  physicalDetails
}

// Declares hazardous properties, which is what makes it hazardous. 200121
// (fluorescent tubes) is also a hazardous code in the EWC reference data.
export const hazardousWasteItem = {
  classification: {
    wasteDescription: 'Fluorescent tubes',
    ewcCodes: ['200121'],
    pops,
    hazardous: hazardousPresent
  },
  physicalDetails
}

export const consignmentNote = {
  code: 'CJTILE/A0001'
}

export const treatment = {
  disposalOrRecoveryCode: 'R3',
  weight
}
