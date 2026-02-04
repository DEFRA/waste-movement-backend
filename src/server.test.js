import { describe, it, expect, jest } from '@jest/globals'

import { createAuthValidation } from './server.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

describe('createAuthValidation', () => {
  const serviceCredentials = [
    'd2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpPTRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA==',
    'd2FzdGUtbW92ZW1lbnQtYmFja2VuZD0yNjZhMmJiZi0xOWEwLTQ3OTUtODI4Zi1kZWI3Njc4MWM3OTc='
  ]

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
    const validate = createAuthValidation(serviceCredentials)
    const result = await validate(
      {},
      'waste-movement-external-api',
      '4d5d48cb-456a-470a-8814-eae2758be90d'
    )

    expect(result).toEqual({
      isValid: true,
      credentials: { username: 'waste-movement-external-api' }
    })
  })

  it('returns isValid false when username does not match', async () => {
    const validate = createAuthValidation(serviceCredentials)
    const result = await validate(
      {},
      'wronguser',
      '4d5d48cb-456a-470a-8814-eae2758be90d'
    )

    expect(result).toEqual({
      isValid: false,
      credentials: { username: 'wronguser' }
    })
  })

  it('returns isValid false when password does not match', async () => {
    const validate = createAuthValidation(serviceCredentials)
    const result = await validate(
      {},
      'waste-movement-external-api',
      'wrongpass'
    )

    expect(result).toEqual({
      isValid: false,
      credentials: { username: 'waste-movement-external-api' }
    })
  })
})
