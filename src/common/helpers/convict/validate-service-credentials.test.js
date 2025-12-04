import { convictValidateServiceCredentials } from './validate-service-credentials.js'

describe('#convictValidateServiceCredentials', () => {
  const validCredentials = [
    { username: 'waste-movement-external-api', password: 'test-secret' }
  ]
  const base64EncodedCredentials = btoa(
    'waste-movement-external-api=test-secret'
  )

  it('should not throw an error when given credentials in the correct format', () => {
    expect(() =>
      convictValidateServiceCredentials.validate(validCredentials)
    ).not.toThrow()
  })

  it('should throw an error when password is missing', () => {
    expect(() =>
      convictValidateServiceCredentials.validate([
        { username: 'test', password: undefined }
      ])
    ).toThrow()
  })

  it('should format the credentials correctly', () => {
    expect(
      convictValidateServiceCredentials.coerce(base64EncodedCredentials)
    ).toEqual(validCredentials)
  })

  it('should handle multiple credentials', () => {
    const multipleCredentials = btoa(
      'service-one=password1,service-two=password2'
    )
    expect(
      convictValidateServiceCredentials.coerce(multipleCredentials)
    ).toEqual([
      { username: 'service-one', password: 'password1' },
      { username: 'service-two', password: 'password2' }
    ])
  })

  it('should handle passwords containing equals signs', () => {
    const credentialsWithEquals = btoa('service-name=pass=word=123')
    expect(
      convictValidateServiceCredentials.coerce(credentialsWithEquals)
    ).toEqual([{ username: 'service-name', password: 'pass=word=123' }])
  })
})
