import { describe, it, expect, jest } from '@jest/globals'

import { createAuthValidation } from './server.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

describe('createAuthValidation', () => {
  it('returns isValid false when serviceCredentials is null', async () => {
    const validate = createAuthValidation(null)
    const result = await validate({}, 'testuser', 'testpass')

    expect(result).toEqual({
      isValid: false,
      credentials: { username: 'testuser' }
    })
  })

  it('returns isValid false when serviceCredentials is undefined', async () => {
    const validate = createAuthValidation(undefined)
    const result = await validate({}, 'testuser', 'testpass')

    expect(result).toEqual({
      isValid: false,
      credentials: { username: 'testuser' }
    })
  })

  it('returns isValid true when credentials match', async () => {
    const serviceCredentials = [
      { username: 'service1', password: 'secret1' },
      { username: 'service2', password: 'secret2' }
    ]
    const validate = createAuthValidation(serviceCredentials)
    const result = await validate({}, 'service1', 'secret1')

    expect(result).toEqual({
      isValid: true,
      credentials: { username: 'service1' }
    })
  })

  it('returns isValid false when username does not match', async () => {
    const serviceCredentials = [{ username: 'service1', password: 'secret1' }]
    const validate = createAuthValidation(serviceCredentials)
    const result = await validate({}, 'wronguser', 'secret1')

    expect(result).toEqual({
      isValid: false,
      credentials: { username: 'wronguser' }
    })
  })

  it('returns isValid false when password does not match', async () => {
    const serviceCredentials = [{ username: 'service1', password: 'secret1' }]
    const validate = createAuthValidation(serviceCredentials)
    const result = await validate({}, 'service1', 'wrongpass')

    expect(result).toEqual({
      isValid: false,
      credentials: { username: 'service1' }
    })
  })
})
