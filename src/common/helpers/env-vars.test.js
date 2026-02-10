import { getEnvVars } from './env-vars.js'

describe('env-vars', () => {
  const originalProcessEnv = process.env

  beforeAll(() => {
    process.env = {
      ACCESS_CRED_WASTE_MOVEMENT_EXTERNAL_API:
        'accesscredwastemovementexternalapi',
      ACCESS_CRED_WASTE_MOVEMENT_BACKEND: 'accesscredwastemovementbackend',
      SERVICE_AUTH_PASSWORD_WASTE_MOVEMENT_BACKEND: 'verysecretpassword123'
    }
  })

  afterAll(() => {
    process.env = originalProcessEnv
  })

  describe('#getEnvVars', () => {
    it('should return env vars when provided with a key prefix', () => {
      const result = getEnvVars('ACCESS_CRED_')

      expect(result).toEqual([
        'accesscredwastemovementexternalapi',
        'accesscredwastemovementbackend'
      ])
    })

    it('should return env vars when provided with a full key', () => {
      const result = getEnvVars('SERVICE_AUTH_PASSWORD_WASTE_MOVEMENT_BACKEND')

      expect(result).toEqual(['verysecretpassword123'])
    })

    it('should return an empty array when not provided with a key', () => {
      const result = getEnvVars()

      expect(result).toEqual([])
    })
  })
})
