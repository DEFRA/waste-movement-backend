import {
  jsonSchemaValidator,
  jsonSchemaValidatorFor
} from './hapi-validator.js'
import { apiCode1 } from '../../test/data/apiCodes.js'

const schemaId = 'beta-2/common/producer/producer-base.schema.json'

describe('jsonSchemaValidator', () => {
  test('returns the value unchanged when it is valid', () => {
    const value = { councilMovement: true }

    expect(jsonSchemaValidator(schemaId)(value)).toBe(value)
  })

  test('throws a Boom badRequest when the value is invalid', () => {
    expect(() => jsonSchemaValidator(schemaId)({})).toThrow(
      '"councilMovement" is required'
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
        message: '"councilMovement" is required',
        path: ['councilMovement'],
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

  test('nests the path for an error inside a sub-object', () => {
    const id = 'beta-2/common/producer/producer-commercial.schema.json'
    const [detail] = getDetails(id, {
      wasteSource: 'Commercial',
      councilMovement: false,
      organisationName: 'ACME',
      sicCode: '38110',
      emailAddress: 'a@b.com',
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
      'common/producer/producer-base'
    )
    const value = { councilMovement: true }

    expect(validate(value)).toBe(value)
  })
})
