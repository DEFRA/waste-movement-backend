import {
  jsonSchemaValidator,
  jsonSchemaValidatorFor
} from './hapi-validator.js'
import { apiCode1 } from '../../test/data/apiCodes.js'

const schemaId = 'beta-2/common/producer/producer-household.schema.json'

describe('jsonSchemaValidator', () => {
  test('returns the value unchanged when it is valid', () => {
    const value = { wasteSource: 'Household' }

    expect(jsonSchemaValidator(schemaId)(value)).toBe(value)
  })

  test('throws a Boom badRequest when the value is invalid', () => {
    expect(() => jsonSchemaValidator(schemaId)({})).toThrow(
      '"wasteSource" is required'
    )
  })

  const getDetails = (id, value) => {
    try {
      jsonSchemaValidator(id)(value)
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
    const id = 'beta-1/create-movement.schema.json'
    const [detail] = getDetails(id, { apiCode: apiCode1, extra: 'x' })

    expect(detail).toMatchObject({ path: ['extra'], type: 'NotAllowed' })
  })

  test('maps a format mismatch to InvalidFormat', () => {
    const id = 'beta-1/create-movement.schema.json'
    const [detail] = getDetails(id, { apiCode: 'not-a-uuid' })

    expect(detail).toMatchObject({ path: ['apiCode'], type: 'InvalidFormat' })
  })

  test('maps a minLength violation to OutOfRange', () => {
    const id = 'beta-1/record-receipt-without-delivery.schema.json'
    const [detail] = getDetails(id, { apiCode: apiCode1, reason: '' })

    expect(detail).toMatchObject({ path: ['reason'], type: 'OutOfRange' })
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

describe('jsonSchemaValidatorFor', () => {
  test('resolves the schema id from a version and name', () => {
    const validate = jsonSchemaValidatorFor('beta-2')(
      'common/producer/producer-household'
    )
    const value = { wasteSource: 'Household' }

    expect(validate(value)).toBe(value)
  })
})
