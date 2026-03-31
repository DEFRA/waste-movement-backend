const weightSchema = {
  bsonType: 'object',
  additionalProperties: false,
  required: ['metric', 'amount', 'isEstimate'],
  properties: {
    metric: {
      bsonType: 'string'
    },
    amount: {
      bsonType: ['int', 'double']
    },
    isEstimate: {
      bsonType: 'bool'
    }
  }
}

const addressSchema = {
  bsonType: 'object',
  additionalProperties: false,
  properties: {
    fullAddress: {
      bsonType: 'string'
    },
    postcode: {
      bsonType: 'string'
    }
  }
}

const carrierOrBrokerDealerAddressSchema = {
  ...addressSchema,
  required: ['postcode']
}

const receiverAddressSchema = {
  ...addressSchema,
  required: ['fullAddress', 'postcode']
}

export const wasteInputSchema = {
  bsonType: 'object',
  additionalProperties: false,
  required: ['_id', 'receipt', 'submittingOrganisation'],
  properties: {
    _id: {
      bsonType: ['objectId', 'string']
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
      bsonType: 'object',
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
    traceId: {
      bsonType: 'string'
    },
    bulkId: {
      bsonType: ['string', 'null']
    },
    revision: {
      bsonType: 'int'
    },
    timestamp: {
      bsonType: 'date'
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
            dateTimeReceived: {
              bsonType: 'date'
            },
            hazardousWasteConsignmentCode: {
              bsonType: 'string'
            },
            reasonForNoConsignmentCode: {
              bsonType: 'string'
            },
            yourUniqueReference: {
              bsonType: 'string'
            },
            otherReferencesForMovement: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                additionalProperties: false,
                required: ['label', 'reference'],
                properties: {
                  label: {
                    bsonType: 'string'
                  },
                  reference: {
                    bsonType: 'string'
                  }
                }
              }
            },
            specialHandlingRequirements: {
              bsonType: 'string'
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
                      bsonType: 'string'
                    }
                  },
                  wasteDescription: {
                    bsonType: 'string'
                  },
                  physicalForm: {
                    bsonType: 'string'
                  },
                  numberOfContainers: {
                    bsonType: 'int'
                  },
                  typeOfContainers: {
                    bsonType: 'string'
                  },
                  weight: weightSchema,
                  containsPops: {
                    bsonType: 'bool'
                  },
                  pops: {
                    bsonType: 'object',
                    additionalProperties: false,
                    properties: {
                      sourceOfComponents: {
                        bsonType: 'string'
                      },
                      components: {
                        bsonType: 'array',
                        items: {
                          bsonType: 'object',
                          additionalProperties: false,
                          required: ['code'],
                          properties: {
                            code: {
                              bsonType: 'string'
                            },
                            concentration: {
                              bsonType: ['int', 'double']
                            }
                          }
                        }
                      }
                    }
                  },
                  containsHazardous: {
                    bsonType: 'bool'
                  },
                  hazardous: {
                    bsonType: 'object',
                    additionalProperties: false,
                    properties: {
                      sourceOfComponents: {
                        bsonType: 'string'
                      },
                      hazCodes: {
                        bsonType: 'array',
                        items: {
                          bsonType: 'string'
                        }
                      },
                      components: {
                        bsonType: 'array',
                        items: {
                          bsonType: 'object',
                          additionalProperties: false,
                          required: ['name'],
                          properties: {
                            name: {
                              bsonType: 'string'
                            },
                            concentration: {
                              bsonType: ['int', 'double']
                            }
                          }
                        }
                      }
                    }
                  },
                  disposalOrRecoveryCodes: {
                    bsonType: 'array',
                    items: {
                      bsonType: 'object',
                      additionalProperties: false,
                      required: ['code', 'weight'],
                      properties: {
                        code: {
                          bsonType: 'string'
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
                registrationNumber: {
                  bsonType: ['string', 'null']
                },
                reasonForNoRegistrationNumber: {
                  bsonType: ['string', 'null']
                },
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
                  bsonType: 'string'
                },
                otherMeansOfTransport: {
                  bsonType: 'string'
                }
              }
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
                registrationNumber: {
                  bsonType: 'string'
                },
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
                  bsonType: 'string'
                },
                regulatoryPositionStatements: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'int'
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
