import {
  base64EncodedOrgApiCodes,
  orgApiCodes
} from '../../../test/data/apiCodes.js'
import { convictValidateOrgApiCodes } from './validate-org-api-codes.js'

describe('#convictValidateOrgApiCodes', () => {
  it('should not throw an error when given API codes in the correct format', () => {
    expect(() => convictValidateOrgApiCodes.validate(orgApiCodes)).not.toThrow()
  })

  it('should throw an error when given API codes in an incorrect format', () => {
    expect(() =>
      convictValidateOrgApiCodes.validate(btoa('apiCode=orgId'))
    ).toThrow()
  })

  it('should format the API Codes correctly', () => {
    expect(convictValidateOrgApiCodes.coerce(base64EncodedOrgApiCodes)).toEqual(
      orgApiCodes
    )
  })
})
