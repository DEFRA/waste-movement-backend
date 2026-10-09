import {
  jsonSchemaRequestValidator,
  jsonSchemaRequestValidatorFor,
  jsonSchemaResponseValidator,
  jsonSchemaResponseValidatorFor
} from './hapi-validator.js'
import { apiCode1 } from '../../test/data/apiCodes.js'

const mockLoggerError = jest.fn()

jest.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    error: (...args) => mockLoggerError(...args)
  })
}))

const schemaId = 'beta-2/common/producer/producer-household.schema.json'

describe('jsonSchemaRequestValidator', () => {
  test('returns the value unchanged when it is valid', () => {
    const value = { wasteSource: 'Household' }

    expect(jsonSchemaRequestValidator(schemaId)(value)).toBe(value)
  })

  test('throws a Boom badRequest when the value is invalid', () => {
    expect(() => jsonSchemaRequestValidator(schemaId)({})).toThrow(
      '"wasteSource" is required'
    )
  })

  const getDetails = (id, value) => {
    try {
      jsonSchemaRequestValidator(id)(value)
      throw new Error('expected validation to fail')
    } catch (error) {
      return error.details
    }
  }

  test('maps a missing property to NotProvided', () => {
    expect(getDetails(schemaId, {})).toEqual([
      {
        message: '"wasteSource" is required',
        path: ['wasteSource'],
        type: 'NotProvided'
      }
    ])
  })

  test('maps an additional property to NotAllowed', () => {
    const id = 'beta-1/create-movement-request.schema.json'
    const [detail] = getDetails(id, { apiCode: apiCode1, extra: 'x' })

    expect(detail).toMatchObject({ path: ['extra'], type: 'NotAllowed' })
  })

  test('maps a format mismatch to InvalidFormat', () => {
    const id = 'beta-1/create-movement-request.schema.json'
    const [detail] = getDetails(id, { apiCode: 'not-a-uuid' })

    expect(detail).toMatchObject({ path: ['apiCode'], type: 'InvalidFormat' })
  })

  test('maps a minLength violation to OutOfRange', () => {
    const id = 'beta-1/record-receipt-without-delivery-request.schema.json'
    const [detail] = getDetails(id, { apiCode: apiCode1, reason: '' })

    expect(detail).toMatchObject({ path: ['reason'], type: 'OutOfRange' })
  })

  test('maps an exclusiveMinimum violation to OutOfRange', () => {
    const id = 'beta-2/common/waste-item/weight.schema.json'
    const [detail] = getDetails(id, {
      amount: 0,
      unit: 'KILOGRAMS',
      isEstimate: false
    })

    expect(detail).toMatchObject({ path: ['amount'], type: 'OutOfRange' })
  })

  test('maps a forbidden property in a oneOf branch to NotAllowed', () => {
    const id = 'beta-2/common/broker-or-dealer/broker-or-dealer.schema.json'
    const details = getDetails(id, {
      isPresent: false,
      items: [
        {
          organisationName: 'Broker Demo Ltd',
          registrationNumber: 'CBDU654321',
          contactDetails: { emailAddress: 'broker@example.com' }
        }
      ]
    })

    expect(details).toContainEqual(
      expect.objectContaining({ path: ['items'], type: 'NotAllowed' })
    )
  })

  describe('composition keyword summaries', () => {
    const carrierId = 'beta-2/common/carrier.schema.json'
    const carrier = {
      organisationName: 'Carrier Ltd',
      meansOfTransport: 'Rail',
      registrationNumber: 'CBDU123456',
      contactDetails: { emailAddress: 'carrier@example.com' }
    }

    test.each([
      {
        rule: 'if/then',
        value: { ...carrier, meansOfTransport: 'Road' },
        expected: [
          {
            message: '"vehicleRegistration" is required',
            path: ['vehicleRegistration'],
            type: 'NotProvided'
          }
        ]
      },
      {
        rule: 'if/else',
        value: { ...carrier, vehicleRegistration: 'AB12 CDE' },
        expected: [
          {
            message: 'must NOT be valid',
            path: ['vehicleRegistration'],
            type: 'NotAllowed'
          }
        ]
      },
      {
        rule: 'oneOf',
        value: { ...carrier, registrationNumber: undefined },
        expected: [
          {
            message: '"registrationNumber" is required',
            path: ['registrationNumber'],
            type: 'NotProvided'
          },
          {
            message: '"reasonForNoRegistrationNumber" is required',
            path: ['reasonForNoRegistrationNumber'],
            type: 'NotProvided'
          }
        ]
      },
      {
        rule: 'anyOf',
        value: { ...carrier, contactDetails: {} },
        expected: [
          {
            message: '"emailAddress" is required',
            path: ['contactDetails', 'emailAddress'],
            type: 'NotProvided'
          },
          {
            message: '"phoneNumber" is required',
            path: ['contactDetails', 'phoneNumber'],
            type: 'NotProvided'
          }
        ]
      }
    ])(
      'reports only the specific errors when $rule fails',
      ({ value, expected }) => {
        expect(
          getDetails(carrierId, JSON.parse(JSON.stringify(value)))
        ).toEqual(expected)
      }
    )
  })

  test('nests the path for an error inside a sub-object', () => {
    const id = 'beta-2/common/producer/producer-commercial.schema.json'
    const [detail] = getDetails(id, {
      wasteSource: 'Commercial',
      organisationName: 'ACME',
      sicCode: '38110',
      contactDetails: { emailAddress: 'a@b.com' },
      authorisationNumber: 'EAS/P/123456',
      address: { fullAddress: '10 Way', postcode: 'NOTAPOSTCODE' }
    })

    expect(detail).toMatchObject({
      path: ['address', 'postcode'],
      type: 'InvalidFormat'
    })
  })
})

describe('jsonSchemaRequestValidatorFor', () => {
  test('resolves the schema id from a version and name', () => {
    const validate = jsonSchemaRequestValidatorFor('beta-2')(
      'common/producer/producer-household'
    )
    const value = { wasteSource: 'Household' }

    expect(validate(value)).toBe(value)
  })
})

describe('jsonSchemaResponseValidator', () => {
  const responseSchemaId =
    'beta-2/creation/create-movement-response.schema.json'
  const validBody = { data: { movementId: '25HRA0B2' } }

  beforeEach(() => {
    mockLoggerError.mockClear()
  })

  test('returns the value unchanged when it is valid', () => {
    expect(jsonSchemaResponseValidator(responseSchemaId)(validBody)).toBe(
      validBody
    )
    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  test('throws and logs the schema id and ajv errors when the value is invalid', () => {
    const invalidBody = { data: {} }

    expect(() =>
      jsonSchemaResponseValidator(responseSchemaId)(invalidBody)
    ).toThrow(`Response does not match ${responseSchemaId}`)
    expect(mockLoggerError).toHaveBeenCalledWith(
      {
        schemaId: responseSchemaId,
        errors: [
          expect.objectContaining({
            keyword: 'required',
            instancePath: '/data',
            params: { missingProperty: 'movementId' }
          })
        ]
      },
      'Response failed schema validation'
    )
  })

  test('throws for an unknown schema id', () => {
    expect(() =>
      jsonSchemaResponseValidator('beta-2/does-not-exist.schema.json')(
        validBody
      )
    ).toThrow('No schema registered under "beta-2/does-not-exist.schema.json".')
  })
})

describe('jsonSchemaResponseValidatorFor', () => {
  test('resolves the schema id from a version and name', () => {
    const validate = jsonSchemaResponseValidatorFor('beta-1')(
      'record-receipt-response'
    )
    const body = {
      data: { deliveryId: '25KMT4Z9' },
      validation: { warnings: [] }
    }

    expect(validate(body)).toBe(body)
  })
})
