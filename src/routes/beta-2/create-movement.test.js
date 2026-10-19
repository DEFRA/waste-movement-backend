import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as movementCreate from '../../services/movement.js'
import { config } from '../../config.js'
import { apiCode1, base64EncodedOrgApiCodes } from '../../test/data/apiCodes.js'
import {
  requestBasicAuthTest1,
  userBasicAuthTest1
} from '../../test/data/basic-auth.js'
import { createServer } from '../../server.js'
import {
  forwardedOrganisationId,
  organisationHeaders
} from '../../test/data/organisation-headers.js'
import {
  carrier,
  consignmentNote,
  hazardousWasteItem,
  receiver,
  treatment,
  wasteItem
} from '../../schemas/beta-2/test-helpers.js'

const backoffOptionsConfig = { numOfAttempts: 3, startingDelay: 1 }

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

jest.mock('@defra/waste-movement-utils', () => {
  const originalModule = jest.requireActual('@defra/waste-movement-utils')

  return {
    ...originalModule,
    backoffOptions: () => backoffOptionsConfig
  }
})

jest.mock('../../common/helpers/http-client.js', () => ({
  httpClients: {
    wasteTracking: {
      get: jest
        .fn()
        .mockResolvedValue({ payload: { wasteTrackingId: '26S8EYDJ' } })
    }
  }
}))

describe('movement Route Tests version: beta-2', () => {
  let server
  const endpointVersion = 'beta-2'
  const errorMessage = 'Database connection failed'
  const traceId = 'created-trace-id-123'
  const producer = {
    wasteSource: 'Household'
  }
  const intendedCarriers = [carrier]
  const intendedReceivers = [receiver]
  const wasteItems = [wasteItem]
  const goodPayload = {
    producer,
    intendedCarriers,
    intendedReceivers,
    wasteItems
  }

  const commercialProducer = {
    wasteSource: 'Commercial',
    organisationName: 'ACME Waste Producers Ltd',
    authorisationNumber: 'EAS/P/123456',
    address: {
      fullAddress: '10 Industrial Way, Test City',
      postcode: 'TE1 2PQ'
    },
    contactDetails: {
      emailAddress: 'producer@example.com',
      phoneNumber: '01234567890'
    },
    sicCode: '38110'
  }

  const municipalProducer = {
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

  const expectedTypeBase =
    'https://defra.github.io/digital-waste-tracking-api-site/preview/problems/'

  beforeAll(async () => {
    config.set('orgApiCodes', base64EncodedOrgApiCodes)

    process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

    server = await createServer()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('creates a movement', async () => {
    const createMovementRecordSpy = jest
      .spyOn(movementCreate, 'createMovementRecord')
      .mockResolvedValue(goodPayload)

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { movementId: expect.any(String) },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toEqual(traceId)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
    expect(createMovementRecordSpy).toHaveBeenCalledWith(expect.anything(), {
      movementId: expect.any(String),
      orgId: forwardedOrganisationId,
      wasteItems
    })
  })

  it.each([
    ['Commercial', commercialProducer],
    ['Municipal', municipalProducer]
  ])('creates a movement for a %s producer', async (_wasteSource, prod) => {
    const payload = {
      producer: prod,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    const createMovementRecordSpy = jest
      .spyOn(movementCreate, 'createMovementRecord')
      .mockResolvedValue(payload)

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { movementId: expect.any(String) },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toEqual(traceId)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('handles error when creating a movement fails', async () => {
    const createMovementRecordSpy = jest
      .spyOn(movementCreate, 'createMovementRecord')
      .mockRejectedValue(new Error(errorMessage))

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: '/beta-2/movements',
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
    expect(headers['content-type']).toContain('application/problem+json')

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(
      backoffOptionsConfig.numOfAttempts
    )
  })

  it('creates a movement when a brokerOrDealer is declared', async () => {
    const payload = {
      producer,
      intendedCarriers,
      intendedReceivers,
      wasteItems,
      brokerOrDealer: {
        isPresent: true,
        items: [
          {
            organisationName: 'Broker Demo Ltd',
            registrationNumber: 'CBDU654321',
            contactDetails: { emailAddress: 'broker@example.com' },
            address: {
              fullAddress: '2 Broker Yard, Test City',
              postcode: 'TE1 1ST'
            }
          }
        ]
      }
    }
    const createMovementRecordSpy = jest
      .spyOn(movementCreate, 'createMovementRecord')
      .mockResolvedValue(payload)

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { movementId: expect.any(String) },
      validation: { warnings: [] }
    })
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('returns an error when a declared brokerOrDealer has no details', async () => {
    const invalidPayload = {
      producer,
      intendedCarriers,
      intendedReceivers,
      wasteItems,
      brokerOrDealer: { isPresent: true }
    }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      {
        errorType: 'NotProvided',
        message: "Required when 'isPresent' is true",
        pointer: '/brokerOrDealer/items'
      }
    ])
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when brokerOrDealer details are given without declaring involvement', async () => {
    const invalidPayload = {
      producer,
      intendedCarriers,
      intendedReceivers,
      wasteItems,
      brokerOrDealer: {
        isPresent: false,
        items: [
          {
            organisationName: 'Broker Demo Ltd',
            registrationNumber: 'CBDU654321',
            contactDetails: { emailAddress: 'broker@example.com' }
          }
        ]
      }
    }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        errorType: 'NotAllowed',
        pointer: '/brokerOrDealer/items'
      })
    )
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  // apiCode is sent in the x-api-code header and resolved by the
  // external API, so the backend rejects it in the body.
  it('returns an error when apiCode is sent in the body and does not create a movement', async () => {
    const invalidPayload = {
      apiCode: apiCode1,
      producer,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotAllowed',
          message: 'must NOT have additional properties',
          pointer: '/apiCode'
        }
      ],
      instance: '/beta-2/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when producer is missing and does not create a movement', async () => {
    const invalidPayload = { intendedCarriers, intendedReceivers, wasteItems }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'producer' is required",
          pointer: '/producer'
        }
      ],
      instance: '/beta-2/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  // Scenario: A Movement isn't created when no intended carrier is declared.
  it('returns an error when intendedCarriers is missing and does not create a movement', async () => {
    const invalidPayload = { producer, intendedReceivers, wasteItems }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'intendedCarriers' is required",
          pointer: '/intendedCarriers'
        }
      ],
      instance: '/beta-2/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when intendedReceivers is missing and does not create a movement', async () => {
    const invalidPayload = { producer, intendedCarriers, wasteItems }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'intendedReceivers' is required",
          pointer: '/intendedReceivers'
        }
      ],
      instance: '/beta-2/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when wasteItems is missing and does not create a movement', async () => {
    const invalidPayload = { producer, intendedCarriers, intendedReceivers }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: "'wasteItems' is required",
          pointer: '/wasteItems'
        }
      ],
      instance: '/beta-2/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('stores the waste items', async () => {
    // Earlier tests stub createMovementRecord; this one needs the real write.
    jest.spyOn(movementCreate, 'createMovementRecord').mockRestore()
    jest
      .spyOn(movementCreate, 'createMovementId')
      .mockResolvedValueOnce('26CLS001')

    const { statusCode } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: {
        ...goodPayload,
        wasteItems: [wasteItem, hazardousWasteItem],
        consignmentNote
      },
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    const recordInDb = await server.db
      .collection('movements')
      .findOne({ movementId: '26CLS001' }, { projection: { _id: 0 } })

    expect(recordInDb).toEqual({
      movementId: '26CLS001',
      orgId: forwardedOrganisationId,
      wasteItems: [wasteItem, hazardousWasteItem],
      createdAt: expect.any(String)
    })
  })

  // Whether the waste is hazardous comes from its EWC codes, so callers
  // can't declare it.
  it('returns an error when wasteType is sent in the body and does not create a movement', async () => {
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: { ...goodPayload, wasteType: 'HAZARDOUS' },
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      {
        errorType: 'NotAllowed',
        message: 'must NOT have additional properties',
        pointer: '/wasteType'
      }
    ])
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when a waste item weight is not greater than 0 and does not create a movement', async () => {
    const invalidPayload = {
      producer,
      intendedCarriers,
      intendedReceivers,
      wasteItems: [
        {
          ...wasteItem,
          physicalDetails: {
            ...wasteItem.physicalDetails,
            totalWeight: { ...wasteItem.physicalDetails.totalWeight, amount: 0 }
          }
        }
      ]
    }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      {
        errorType: 'OutOfRange',
        message: 'must be > 0',
        pointer: '/wasteItems/0/physicalDetails/totalWeight/amount'
      }
    ])

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  // Treatments are part of the shared waste item, but creating a movement
  // doesn't take them yet.
  it('returns an error when a waste item declares treatments and does not create a movement', async () => {
    const invalidPayload = {
      producer,
      intendedCarriers,
      intendedReceivers,
      wasteItems: [{ ...wasteItem, treatments: [treatment] }]
    }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      expect.objectContaining({
        errorType: 'NotAllowed',
        pointer: '/wasteItems/0/treatments'
      })
    ])
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('rejects when no organisation was forwarded (unknown or disabled API code) and does not create a movement', async () => {
    const invalidPayload = {
      producer,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: '/beta-2/movements',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('should return 401 when request is unauthenticated', async () => {
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: `/${endpointVersion}/movements`,
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns a 500 when the response body does not match the response schema', async () => {
    jest.spyOn(movementCreate, 'createMovementId').mockResolvedValueOnce(12345)
    jest
      .spyOn(movementCreate, 'createMovementRecord')
      .mockResolvedValueOnce(goodPayload)

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`,
        ...organisationHeaders
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: `/${endpointVersion}/movements`,
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  // ajv checks a oneOf value against every branch, so a value of the wrong
  // type used to be reported once per branch (12 errors for a string
  // producer). It must be reported once, at its own pointer.
  describe('reports a value of the wrong type once', () => {
    it.each([
      {
        description: 'producer',
        payload: {
          producer: 'fail',
          intendedCarriers: [carrier],
          intendedReceivers,
          wasteItems
        }
      },
      {
        description: 'brokerOrDealer',
        payload: {
          producer,
          brokerOrDealer: 'fail',
          intendedCarriers: [carrier],
          intendedReceivers,
          wasteItems
        }
      }
    ])(
      'when $description is not an object',
      async ({ description, payload }) => {
        const createMovementRecordSpy = jest.spyOn(
          movementCreate,
          'createMovementRecord'
        )

        const { statusCode, result } = await server.inject({
          method: 'POST',
          url: `/${endpointVersion}/movements`,
          payload,
          headers: {
            'x-cdp-request-id': traceId,
            Authorization: `Basic ${requestBasicAuthTest1}`,
            ...organisationHeaders
          }
        })

        expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
        expect(result.errors).toEqual([
          {
            errorType: 'InvalidType',
            message: 'must be object',
            pointer: `/${description}`
          }
        ])
        expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
      }
    )
  })

  // Collapsing a wrong-type value only drops errors at or below *that*
  // value: an error deeper in the payload keeps its full pointer.
  describe('points a deeply nested error at the field itself', () => {
    const brokerOrDealerEntry = {
      organisationName: 'Broker Demo Ltd',
      registrationNumber: 'CBDU654321',
      contactDetails: { emailAddress: 'broker@example.com' }
    }
    const withBrokerOrDealerEntry = (entry) => ({
      producer,
      brokerOrDealer: {
        isPresent: true,
        items: [{ ...brokerOrDealerEntry, ...entry }]
      },
      intendedCarriers: [carrier],
      intendedReceivers,
      wasteItems
    })

    it.each([
      {
        description: 'a nested field has an invalid format',
        payload: withBrokerOrDealerEntry({
          contactDetails: { emailAddress: 'not-an-email' }
        }),
        expectedError: {
          errorType: 'InvalidFormat',
          message: "must match format 'email'",
          pointer: '/brokerOrDealer/items/0/contactDetails/emailAddress'
        }
      },
      {
        description: 'a nested field has the wrong type',
        payload: withBrokerOrDealerEntry({
          address: { fullAddress: '2 Broker Yard', postcode: 5 }
        }),
        expectedError: {
          errorType: 'InvalidType',
          message: 'must be string',
          pointer: '/brokerOrDealer/items/0/address/postcode'
        }
      },
      {
        description: 'a nested object has the wrong type',
        payload: withBrokerOrDealerEntry({ contactDetails: 'not-an-object' }),
        expectedError: {
          errorType: 'InvalidType',
          message: 'must be object',
          pointer: '/brokerOrDealer/items/0/contactDetails'
        }
      }
    ])('when $description', async ({ payload, expectedError }) => {
      const { statusCode, result } = await server.inject({
        method: 'POST',
        url: `/${endpointVersion}/movements`,
        payload,
        headers: {
          'x-cdp-request-id': traceId,
          Authorization: `Basic ${requestBasicAuthTest1}`,
          ...organisationHeaders
        }
      })

      expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(result.errors).toEqual([expectedError])
    })
  })

  describe('Feature: Describing the waste when creating a waste movement', () => {
    // Background: they are authenticated and have a valid API Code.
    const submit = (payload) =>
      server.inject({
        method: 'POST',
        url: `/${endpointVersion}/movements`,
        payload,
        headers: {
          'x-cdp-request-id': traceId,
          Authorization: `Basic ${requestBasicAuthTest1}`,
          ...organisationHeaders
        }
      })

    const withWasteItems = (items, extra = {}) => ({
      ...goodPayload,
      wasteItems: items,
      ...extra
    })
    const withClassification = (classification) =>
      withWasteItems([{ ...wasteItem, classification }])

    const reasonForNoCode = 'Carrier did not provide a consignment note'

    // A code that isn't six digits fails the schema; a six-digit code that
    // isn't in the reference data fails the check in waste-reference-data-checks.js.
    const ewcCodeBadlyFormatted = (pointer) => ({
      errorType: 'InvalidFormat',
      message: "must match pattern '^\\d{6}$'",
      pointer
    })
    const ewcCodeNotRecognised = (pointer) => ({
      errorType: 'InvalidValue',
      message: 'must be a recognised EWC code',
      pointer
    })

    const expectCreated = async (payload) => {
      const createMovementRecordSpy = jest
        .spyOn(movementCreate, 'createMovementRecord')
        .mockResolvedValue(payload)

      const { statusCode, result } = await submit(payload)

      expect(statusCode).toEqual(HTTP_STATUS.CREATED)
      expect(result.data).toEqual({ movementId: expect.any(String) })
      expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
    }

    const expectRejected = async (payload, errors) => {
      const createMovementRecordSpy = jest.spyOn(
        movementCreate,
        'createMovementRecord'
      )

      const { statusCode, result } = await submit(payload)

      expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(result.errors).toEqual(errors)
      expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
    }

    const reasonRequired = {
      errorType: 'NotProvided',
      message:
        "Required when a waste item has a hazardous EWC code and 'code' is not provided",
      pointer: '/consignmentNote/reasonForNoCode'
    }
    const consignmentNoteRequired = {
      errorType: 'NotProvided',
      message:
        "Required when a waste item has a hazardous EWC code, with a 'code' or a 'reasonForNoCode'",
      pointer: '/consignmentNote'
    }

    describe('Scenario: A Movement is created when non-hazardous waste is described without a consignment code', () => {
      it('creates the movement for a waste description and a non-hazardous EWC code', async () => {
        await expectCreated(
          withClassification({
            wasteDescription: 'Paper and cardboard',
            ewcCodes: ['200101']
          })
        )
      })
    })

    describe('Scenario: A Movement is created when a consignment code is given for non-hazardous waste', () => {
      it('creates the movement for a non-hazardous EWC code and a valid consignment code', async () => {
        await expectCreated({ ...goodPayload, consignmentNote })
      })
    })

    describe('Scenario: A Movement is created when a mirror EWC code is provided', () => {
      it.each([
        ['1 EWC code', ['170504']],
        ['2 EWC codes', ['170504', '191212']],
        ['5 EWC codes', ['170504', '191212', '170904', '170604', '200101']]
      ])('creates the movement with %s', async (_, ewcCodes) => {
        await expectCreated(
          withClassification({ wasteDescription: 'Soil and stones', ewcCodes })
        )
      })
    })

    describe("Scenario Outline: A Movement isn't created when the waste description is missing", () => {
      it('rejects a waste description that is not provided as required', async () => {
        await expectRejected(withClassification({ ewcCodes: ['200101'] }), [
          {
            errorType: 'NotProvided',
            message: "'wasteDescription' is required",
            pointer: '/wasteItems/0/classification/wasteDescription'
          }
        ])
      })

      it('rejects a waste description of ""', async () => {
        await expectRejected(
          withClassification({ wasteDescription: '', ewcCodes: ['200101'] }),
          [
            {
              errorType: 'OutOfRange',
              message: 'must NOT have fewer than 1 characters',
              pointer: '/wasteItems/0/classification/wasteDescription'
            }
          ]
        )
      })
    })

    describe("Scenario Outline: A Movement isn't created when the EWC code is missing or invalid", () => {
      const description = { wasteDescription: 'Paper and cardboard' }

      // Examples: Not provided or empty
      it('rejects EWC codes that are not provided as required', async () => {
        await expectRejected(withClassification(description), [
          {
            errorType: 'NotProvided',
            message: "'ewcCodes' is required",
            pointer: '/wasteItems/0/classification/ewcCodes'
          }
        ])
      })

      // "" isn't six digits, so it's reported as a format error.
      it('rejects an EWC code of ""', async () => {
        await expectRejected(
          withClassification({ ...description, ewcCodes: [''] }),
          [ewcCodeBadlyFormatted('/wasteItems/0/classification/ewcCodes/0')]
        )
      })

      // Examples: Not recognised
      it.each(['2001', '200101*', '20 01 01'])(
        'rejects an EWC code of %p as not in the recognised format',
        async (code) => {
          await expectRejected(
            withClassification({ ...description, ewcCodes: [code] }),
            [ewcCodeBadlyFormatted('/wasteItems/0/classification/ewcCodes/0')]
          )
        }
      )

      it('rejects an EWC code of "999999" as not recognised', async () => {
        await expectRejected(
          withClassification({ ...description, ewcCodes: ['999999'] }),
          [ewcCodeNotRecognised('/wasteItems/0/classification/ewcCodes/0')]
        )
      })

      it('reports each unrecognised code on a waste, and only those', async () => {
        await expectRejected(
          withClassification({
            ...description,
            ewcCodes: ['200101', '999999', '200301', '999998']
          }),
          [
            ewcCodeNotRecognised('/wasteItems/0/classification/ewcCodes/1'),
            ewcCodeNotRecognised('/wasteItems/0/classification/ewcCodes/3')
          ]
        )
      })

      it('rejects an empty list of EWC codes', async () => {
        await expectRejected(
          withClassification({ ...description, ewcCodes: [] }),
          [
            {
              errorType: 'OutOfRange',
              message: 'must NOT have fewer than 1 items',
              pointer: '/wasteItems/0/classification/ewcCodes'
            }
          ]
        )
      })
    })

    describe("Scenario: A Movement isn't created when more than 5 EWC codes are declared", () => {
      it('rejects 6 EWC codes, saying no more than 5 are permitted', async () => {
        await expectRejected(
          withClassification({
            wasteDescription: 'Soil and stones',
            ewcCodes: [
              '170504',
              '191212',
              '170904',
              '170604',
              '200101',
              '200301'
            ]
          }),
          [
            {
              errorType: 'OutOfRange',
              message: 'must NOT have more than 5 items',
              pointer: '/wasteItems/0/classification/ewcCodes'
            }
          ]
        )
      })
    })

    describe('Scenario Outline: A Movement is created when hazardous waste has a consignment code', () => {
      it.each([
        ['EA / NRW', 'SMITHS/A1234'],
        ['SEPA', 'SA1234567'],
        ['NIEA', 'DA1234567']
      ])('creates the movement with a %s code of %s', async (_, code) => {
        await expectCreated(
          withWasteItems([hazardousWasteItem], { consignmentNote: { code } })
        )
      })
    })

    describe('Scenario: A Movement is created when hazardous waste has a reason for no consignment code', () => {
      it('creates the movement with a hazardous EWC code and a reason', async () => {
        await expectCreated(
          withWasteItems([hazardousWasteItem], {
            consignmentNote: { reasonForNoCode }
          })
        )
      })
    })

    describe("Scenario Outline: A Movement isn't created when hazardous waste has neither a consignment code nor a reason", () => {
      it('rejects a code and a reason that are not provided, saying a reason is required', async () => {
        await expectRejected(
          withWasteItems([hazardousWasteItem], { consignmentNote: {} }),
          [reasonRequired]
        )
      })

      it.each([
        ['""', { code: '', reasonForNoCode: '' }],
        ['null', { code: null, reasonForNoCode: null }]
      ])(
        'rejects a code and a reason of %s, saying a reason is required',
        async (_, note) => {
          await expectRejected(
            withWasteItems([hazardousWasteItem], { consignmentNote: note }),
            [reasonRequired]
          )
        }
      )

      it('rejects a movement with no consignment note at all, saying a code or a reason is required', async () => {
        await expectRejected(withWasteItems([hazardousWasteItem]), [
          consignmentNoteRequired
        ])
      })
    })

    describe("Scenario: A Movement isn't created when any one of several wastes is hazardous and has neither a consignment code nor a reason", () => {
      it('rejects one hazardous and one non-hazardous waste with no consignment code or reason', async () => {
        await expectRejected(
          withWasteItems([wasteItem, hazardousWasteItem], {
            consignmentNote: {}
          }),
          [reasonRequired]
        )
      })

      it('rejects a hazardous mirror code alongside a non-hazardous one on the same waste', async () => {
        await expectRejected(
          withClassification({
            wasteDescription: 'Mixed waste from shredding',
            ewcCodes: ['191212', '191211']
          }),
          [consignmentNoteRequired]
        )
      })
    })

    describe("Scenario Outline: A Movement isn't created when the consignment code is invalid", () => {
      it.each(['12345', 'ABC/123', 'SD1234567'])(
        'rejects a consignment code of %p as not in a recognised format',
        async (code) => {
          await expectRejected(
            withWasteItems([hazardousWasteItem], { consignmentNote: { code } }),
            [
              {
                errorType: 'InvalidFormat',
                message: expect.stringMatching(/^must match pattern /),
                pointer: '/consignmentNote/code'
              }
            ]
          )
        }
      )
    })

    describe("Scenario: A Movement isn't created when both a consignment code and a reason are given", () => {
      it('rejects the reason as not permitted', async () => {
        await expectRejected(
          withWasteItems([hazardousWasteItem], {
            consignmentNote: { ...consignmentNote, reasonForNoCode }
          }),
          [
            {
              errorType: 'NotAllowed',
              message: "Not allowed when 'code' is provided",
              pointer: '/consignmentNote/reasonForNoCode'
            }
          ]
        )
      })
    })

    describe("Scenario: A Movement isn't created when any one of several wastes is described with missing or invalid details", () => {
      it('reports each invalid detail against the waste it belongs to', async () => {
        await expectRejected(
          withWasteItems([
            wasteItem,
            { ...wasteItem, classification: { ewcCodes: ['999999'] } }
          ]),
          [
            {
              errorType: 'NotProvided',
              message: "'wasteDescription' is required",
              pointer: '/wasteItems/1/classification/wasteDescription'
            },
            ewcCodeNotRecognised('/wasteItems/1/classification/ewcCodes/0')
          ]
        )
      })
    })
  })
})
