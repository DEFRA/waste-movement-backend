import {
  ALL_SITE_AUTHORISATION_NUMBER_REGEXES,
  EA_NRW_CONSIGNMENT_CODE_REGEX,
  ENGLAND_CARRIER_REGISTRATION_NUMBER_REGEX,
  IRL_POSTCODE_REGEX,
  NI_CARRIER_REGISTRATION_NUMBER_REGEX,
  NIEA_CONSIGNMENT_CODE_REGEX,
  NRU_CARRIER_REGISTRATION_NUMBER_REGEX,
  SEPA_CARRIER_REGISTRATION_NUMBER_REGEX,
  SEPA_CONSIGNMENT_CODE_REGEX,
  UK_POSTCODE_REGEX
} from '../common/constants/regexes.js'
import {
  LONG_STRING_MAX_LENGTH,
  MAX_EWC_CODES_COUNT,
  MIN_STRING_LENGTH
} from '../common/constants/field-lengths.js'
import { validEwcCodes } from '../common/constants/ewc-codes.js'
import { WASTE_PHYSICAL_FORMS } from '../common/constants/waste-physical-forms.js'
import { validContainerTypes } from '../common/constants/container-types.js'
import { WEIGHT_UNITS } from '../common/constants/weight-units.js'
import {
  sourceOfComponentsNotProvided,
  sourceOfComponentsProvided
} from '../common/constants/source-of-components.js'
import { validPopNames } from '../common/constants/pop-names.js'
import { validHazCodes } from '../common/constants/haz-codes.js'
import { DISPOSAL_OR_RECOVERY_CODES } from '../common/constants/treatment-codes.js'
import { REASONS_FOR_NO_REGISTRATION_NUMBER } from '../common/constants/reasons-for-no-registration-number.js'
import { MEANS_OF_TRANSPORT } from '../common/constants/means-of-transport.js'

const weightSchema = {
  bsonType: 'object',
  additionalProperties: false,
  required: ['metric', 'amount', 'isEstimate'],
  properties: {
    metric: { bsonType: 'string', enum: WEIGHT_UNITS },
    amount: {
      bsonType: ['int', 'double'],
      minimum: 0,
      exclusiveMinimum: true
    },
    isEstimate: { bsonType: 'bool' }
  }
}

const concentrationSchema = {
  bsonType: 'int',
  minimum: 0,
  exclusiveMinimum: true
}

const carrierOrBrokerDealerAddressSchema = {
  bsonType: 'object',
  additionalProperties: false,
  required: ['postcode'],
  properties: {
    fullAddress: {
      bsonType: 'string'
    },
    postcode: {
      bsonType: 'string',
      anyOf: [
        {
          pattern: UK_POSTCODE_REGEX
        },
        {
          pattern: IRL_POSTCODE_REGEX
        }
      ] // Need to make these case insensitive
    }
  }
}

const receiverAddressSchema = {
  bsonType: 'object',
  additionalProperties: false,
  required: ['fullAddress', 'postcode'],
  properties: {
    fullAddress: {
      bsonType: 'string'
    },
    postcode: {
      bsonType: 'string',
      anyOf: [{ pattern: UK_POSTCODE_REGEX }]
    }
  }
}

const carrierOrBrokerDealerRegistrationNumberSchema = {
  bsonType: 'string',
  anyOf: [
    {
      pattern: ENGLAND_CARRIER_REGISTRATION_NUMBER_REGEX
    },
    {
      pattern: SEPA_CARRIER_REGISTRATION_NUMBER_REGEX
    },
    {
      pattern: NRU_CARRIER_REGISTRATION_NUMBER_REGEX
    },
    {
      pattern: NI_CARRIER_REGISTRATION_NUMBER_REGEX
    }
  ]
}

const allowEmptyStringOrNullValuesSchema = {
  bsonType: ['string', 'null'],
  enum: ['', null]
}

const popsOrHazardousComponentsValidationSchema = [
  {
    properties: {
      sourceOfComponents: {
        bsonType: 'string',
        enum: Object.values(sourceOfComponentsNotProvided)
      },
      components: {
        maxItems: 0
      }
    }
  },
  {
    properties: {
      sourceOfComponents: {
        bsonType: 'string',
        enum: Object.values(sourceOfComponentsProvided)
      },
      components: {}
    }
  }
]

export const wasteInputSchema = {
  bsonType: 'object',
  additionalProperties: false,
  required: ['_id', 'receipt'],
  properties: {
    _id: {
      bsonType: ['objectId', 'string'] // Should be one or the other?
    },
    wasteTrackingId: {
      bsonType: 'string'
    },
    creation: {
      bsonType: 'null'
    },
    collection: {
      bsonType: 'null'
    },
    submittingOrganisation: {
      bsonType: ['object', 'null'],
      required: ['defraCustomerOrganisationId'],
      properties: {
        defraCustomerOrganisationId: {
          bsonType: 'string'
        }
      }
    },
    createdAt: {
      bsonType: 'date'
    },
    lastUpdatedAt: {
      bsonType: 'date'
    },
    orgId: {
      bsonType: ['string', 'null']
    },
    traceId: {
      bsonType: 'string'
    },
    bulkId: {
      bsonType: ['string', 'null']
    },
    revision: {
      bsonType: 'int',
      minimum: 0,
      exclusiveMinimum: true
    },
    timestamp: {
      bsonType: 'date' // waste-inputs-history
    },
    receipt: {
      bsonType: 'object',
      additionalProperties: false,
      required: ['movement'],
      properties: {
        movement: {
          bsonType: 'object',
          additionalProperties: false,
          properties: {
            wasteTrackingId: {
              bsonType: 'string'
            },
            apiCode: {
              bsonType: 'string'
            },
            dateTimeReceived: {
              bsonType: ['date', 'string'] // Should be one or the other? See DWT-1848
            },
            hazardousWasteConsignmentCode: {
              bsonType: 'string',
              anyOf: [
                {
                  pattern: EA_NRW_CONSIGNMENT_CODE_REGEX
                },
                {
                  pattern: SEPA_CONSIGNMENT_CODE_REGEX
                },
                {
                  pattern: NIEA_CONSIGNMENT_CODE_REGEX
                }
              ]
            },
            reasonForNoConsignmentCode: {
              bsonType: 'string'
            },
            yourUniqueReference: {
              bsonType: 'string'
            },
            otherReferencesForMovement: {
              bsonType: 'object',
              additionalProperties: false,
              required: ['label', 'reference'],
              properties: {
                label: {
                  bsonType: 'string',
                  minLength: MIN_STRING_LENGTH
                },
                reference: {
                  bsonType: 'string',
                  minLength: MIN_STRING_LENGTH
                },
                specialHandlingRequirements: {
                  bsonType: 'string',
                  maxLength: LONG_STRING_MAX_LENGTH
                }
              }
            },
            wasteItems: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                additionalProperties: false,
                required: [
                  'ewcCodes',
                  'wasteDescription',
                  'physicalForm',
                  'numberOfContainers',
                  'typeOfContainers',
                  'containsPops',
                  'containsHazardous'
                ],
                properties: {
                  ewcCodes: {
                    bsonType: 'array',
                    items: {
                      enum: validEwcCodes.map(({ code }) => code)
                    },
                    maximum: MAX_EWC_CODES_COUNT
                  },
                  wasteDescription: {
                    bsonType: 'string'
                  },
                  physicalForm: {
                    enum: WASTE_PHYSICAL_FORMS
                  },
                  numberOfContainers: {
                    bsonType: 'int',
                    minimum: 0
                  },
                  typeOfContainers: {
                    bsonType: 'string',
                    enum: validContainerTypes.map(({ code }) => code)
                  },
                  weight: weightSchema,
                  containsPops: {
                    bsonType: 'bool'
                  },
                  pops: {
                    bsonType: 'object',
                    additionalProperties: false,
                    properties: {
                      sourceOfComponents: {},
                      components: {
                        bsonType: 'array',
                        items: {
                          bsonType: 'object',
                          additionalProperties: false,
                          required: ['code'],
                          properties: {
                            code: {
                              bsonType: 'string',
                              enum: validPopNames.map(({ code }) => code)
                            },
                            concentration: concentrationSchema
                          }
                        }
                      }
                    },
                    oneOf: popsOrHazardousComponentsValidationSchema
                  },
                  containsHazardous: {
                    bsonType: 'bool'
                  },
                  hazardous: {
                    bsonType: 'object',
                    additionalProperties: false,
                    properties: {
                      sourceOfComponents: {},
                      hazCodes: {
                        bsonType: 'array',
                        items: {
                          enum: validHazCodes
                        }
                      },
                      components: {
                        bsonType: 'object',
                        additionalProperties: false,
                        required: ['name'],
                        properties: {
                          name: {
                            bsonType: 'string'
                          },
                          concentration: concentrationSchema
                        }
                      }
                    },
                    oneOf: popsOrHazardousComponentsValidationSchema
                  },
                  disposalOrRecoveryCodes: {
                    bsonType: 'array',
                    items: {
                      bsonType: 'object',
                      additionalProperties: false,
                      required: ['code', 'weight'],
                      properties: {
                        code: {
                          bsonType: 'string',
                          enum: DISPOSAL_OR_RECOVERY_CODES
                        },
                        weight: weightSchema
                      }
                    }
                  }
                }
              }
            },
            carrier: {
              bsonType: 'object',
              additionalProperties: false,
              required: ['organisationName', 'meansOfTransport'],
              properties: {
                registrationNumber: {},
                reasonForNoRegistrationNumber: {},
                organisationName: {
                  bsonType: 'string'
                },
                address: carrierOrBrokerDealerAddressSchema,
                emailAddress: {
                  bsonType: 'string'
                },
                phoneNumber: {
                  bsonType: 'string'
                },
                vehicleRegistration: {
                  bsonType: 'string'
                },
                meansOfTransport: {
                  bsonType: 'string',
                  enum: MEANS_OF_TRANSPORT
                },
                otherMeansOfTransport: {
                  bsonType: 'string'
                }
              },
              oneOf: [
                {
                  properties: {
                    registrationNumber:
                      carrierOrBrokerDealerRegistrationNumberSchema,
                    reasonForNoRegistrationNumber:
                      allowEmptyStringOrNullValuesSchema
                  },
                  required: ['registrationNumber']
                },
                {
                  properties: {
                    registrationNumber: allowEmptyStringOrNullValuesSchema,
                    reasonForNoRegistrationNumber: {
                      bsonType: ['string'],
                      enum: REASONS_FOR_NO_REGISTRATION_NUMBER
                    }
                  },
                  required: ['reasonForNoRegistrationNumber']
                }
              ]
            },
            brokerOrDealer: {
              bsonType: 'object',
              additionalProperties: false,
              required: ['organisationName'],
              properties: {
                organisationName: {
                  bsonType: 'string'
                },
                address: carrierOrBrokerDealerAddressSchema,
                registrationNumber:
                  carrierOrBrokerDealerRegistrationNumberSchema,
                phoneNumber: {
                  bsonType: 'string'
                },
                emailAddress: {
                  bsonType: 'string'
                }
              }
            },
            receiver: {
              bsonType: 'object',
              additionalProperties: false,
              required: ['siteName', 'authorisationNumber'],
              properties: {
                siteName: {
                  bsonType: 'string'
                },
                emailAddress: {
                  bsonType: 'string'
                },
                phoneNumber: {
                  bsonType: 'string'
                },
                authorisationNumber: {
                  bsonType: 'string',
                  anyOf: ALL_SITE_AUTHORISATION_NUMBER_REGEXES.map((regex) => ({
                    pattern: regex
                  })) // Need to make these case insensitive
                },
                regulatoryPositionStatements: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'int',
                    minimum: 0,
                    exclusiveMinimum: true
                  }
                }
              }
            },
            receipt: {
              bsonType: 'object',
              additionalProperties: false,
              required: ['address'],
              properties: {
                address: receiverAddressSchema
              }
            }
          }
        }
      }
    }
  }
}
