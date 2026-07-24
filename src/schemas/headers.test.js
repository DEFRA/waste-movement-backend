import { headersSchema } from './headers.js'

describe('headersSchema', () => {
  const headers = { 'x-dwt-client-id': 'client-id-123' }

  it('should accept when given valid headers', () => {
    const { error } = headersSchema.validate(headers)

    expect(error).toBeUndefined()
  })

  it('should accept when given an unknown field', () => {
    headers['x-cdp-request-id'] = 'trace-id-123'

    const { error } = headersSchema.validate(headers)

    expect(error).toBeUndefined()
  })

  it('should reject when client id is undefined', () => {
    headers['x-dwt-client-id'] = undefined

    const { error } = headersSchema.validate(headers)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"x-dwt-client-id" is a required header')
  })

  it('should reject when client id is an empty string', () => {
    headers['x-dwt-client-id'] = ''

    const { error } = headersSchema.validate(headers)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"x-dwt-client-id" is not allowed to be empty'
    )
  })

  it('should reject when client id is null', () => {
    headers['x-dwt-client-id'] = null

    const { error } = headersSchema.validate(headers)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"x-dwt-client-id" must be a string')
  })
})
