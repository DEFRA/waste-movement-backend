import { recordDeliverySchema } from './beta-1.js'
import { apiCode1 } from '../test/data/apiCodes.js'

describe('recordDeliverySchema', () => {
  it('accepts a valid payload', () => {
    const { error } = recordDeliverySchema.validate({
      apiCode: apiCode1,
      movementIds: ['25HRA0B2']
    })

    expect(error).toBeUndefined()
  })

  it('accepts multiple movementIds', () => {
    const { error } = recordDeliverySchema.validate({
      apiCode: apiCode1,
      movementIds: ['25HRA0B2', '25HRA0B3']
    })

    expect(error).toBeUndefined()
  })

  it('requires apiCode', () => {
    const { error } = recordDeliverySchema.validate({
      movementIds: ['25HRA0B2']
    })

    expect(error.details[0].path).toEqual(['apiCode'])
    expect(error.details[0].type).toBe('any.required')
  })

  it('requires apiCode to be a uuid', () => {
    const { error } = recordDeliverySchema.validate({
      apiCode: 'not-a-uuid',
      movementIds: ['25HRA0B2']
    })

    expect(error.details[0].path).toEqual(['apiCode'])
    expect(error.details[0].type).toBe('string.guid')
  })

  it('requires movementIds', () => {
    const { error } = recordDeliverySchema.validate({
      apiCode: apiCode1
    })

    expect(error.details[0].path).toEqual(['movementIds'])
    expect(error.details[0].type).toBe('any.required')
  })

  it('requires movementIds to be a non-empty array', () => {
    const { error } = recordDeliverySchema.validate({
      apiCode: apiCode1,
      movementIds: []
    })

    expect(error.details[0].path).toEqual(['movementIds'])
    expect(error.details[0].type).toBe('array.min')
  })
})
