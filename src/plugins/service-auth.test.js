import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { serviceAuth } from './service-auth.js'
import { config } from '../config.js'

describe('Service Auth Plugin', () => {
  describe('Local environment (auth bypassed)', () => {
    let server
    const validUsername = 'test-service'
    const validAuthHeader = `Basic ${Buffer.from(`${validUsername}:`).toString('base64')}`

    beforeAll(async () => {
      config.set('cdpEnvironment', 'local')
      server = Hapi.server()
      await server.register(serviceAuth)

      server.route({
        method: 'GET',
        path: '/protected',
        handler: (request) => ({
          message: 'success',
          username: request.auth.credentials.username
        })
      })

      await server.initialize()
    })

    afterAll(async () => {
      await server.stop()
    })

    test('returns 200 when valid username is provided (password not required)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: validAuthHeader
        }
      })

      expect(response.statusCode).toBe(200)
      expect(response.result).toEqual({
        message: 'success',
        username: validUsername
      })
    })
  })

  describe('Non-local environment (credential validation)', () => {
    let server
    const validUsername = 'waste-movement-external-api'
    const validPassword = 'test-secret'
    const validAuthHeader = `Basic ${Buffer.from(`${validUsername}:${validPassword}`).toString('base64')}`

    beforeAll(async () => {
      config.set('cdpEnvironment', 'dev')
      config.set('serviceCredentials', [
        { username: validUsername, password: validPassword }
      ])

      server = Hapi.server()
      await server.register(serviceAuth)

      server.route({
        method: 'GET',
        path: '/protected',
        handler: (request) => ({
          message: 'success',
          username: request.auth.credentials.username
        })
      })

      await server.initialize()
    })

    afterAll(async () => {
      config.set('cdpEnvironment', 'local')
      await server.stop()
    })

    test('returns 401 when password is missing', async () => {
      const noPasswordHeader = `Basic ${Buffer.from(`${validUsername}:`).toString('base64')}`
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: noPasswordHeader
        }
      })

      expect(response.statusCode).toBe(401)
    })

    test('returns 401 when password is invalid', async () => {
      const invalidPasswordHeader = `Basic ${Buffer.from(`${validUsername}:wrong-password`).toString('base64')}`
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: invalidPasswordHeader
        }
      })

      expect(response.statusCode).toBe(401)
    })

    test('returns 401 when username is invalid', async () => {
      const invalidUsernameHeader = `Basic ${Buffer.from(`wrong-user:${validPassword}`).toString('base64')}`
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: invalidUsernameHeader
        }
      })

      expect(response.statusCode).toBe(401)
    })

    test('returns 200 when valid username and password are provided', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: validAuthHeader
        }
      })

      expect(response.statusCode).toBe(200)
      expect(response.result).toEqual({
        message: 'success',
        username: validUsername
      })
    })
  })

  describe('Non-local environment with null credentials', () => {
    let server
    const validAuthHeader = `Basic ${Buffer.from('test:test').toString('base64')}`

    beforeAll(async () => {
      config.set('cdpEnvironment', 'dev')
      config.set('serviceCredentials', null)

      server = Hapi.server()
      await server.register(serviceAuth)

      server.route({
        method: 'GET',
        path: '/protected',
        handler: () => ({ message: 'success' })
      })

      await server.initialize()
    })

    afterAll(async () => {
      config.set('cdpEnvironment', 'local')
      await server.stop()
    })

    test('returns 401 when credentials are not configured', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: validAuthHeader
        }
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
