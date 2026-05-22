import { apiCode1, apiCode2 } from '../../../test/data/apiCodes.js'
import { convictValidateExcludeApiCodes } from './validate-exclude-api-codes.js'

describe('#convictValidateExcludeApiCodes', () => {
  it('should not throw an error when given an empty array', () => {
    expect(() => convictValidateExcludeApiCodes.validate([])).not.toThrow()
  })

  it('should not throw an error when given API codes in the correct format', () => {
    expect(() =>
      convictValidateExcludeApiCodes.validate([apiCode1, apiCode2])
    ).not.toThrow()
  })

  it('should throw an error when given API codes in an incorrect format', () => {
    expect(() =>
      convictValidateExcludeApiCodes.validate(['not-a-uuid'])
    ).toThrow()
  })

  it('should format a comma-separated string of API codes correctly', () => {
    expect(
      convictValidateExcludeApiCodes.coerce(` ${apiCode1}, ${apiCode2}, `)
    ).toEqual([apiCode1, apiCode2])
  })
  it('should format the default value to an empty array if not env variable specified', () => {
    expect(convictValidateExcludeApiCodes.coerce('')).toEqual([])
  })
})
