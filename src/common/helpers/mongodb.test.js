import { Db, MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'

import { createServer } from '../../server.js'
import { config } from '../../config.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

describe('#mongoDb', () => {
  let server

  describe('Set up', () => {
    beforeAll(async () => {
      server = await createServer()
      await server.initialize()
    })

    afterAll(async () => {
      await server.stop({ timeout: 0 })
    })

    test('Server should have expected MongoDb decorators', () => {
      expect(server.db).toBeInstanceOf(Db)
      expect(server.mongoClient).toBeInstanceOf(MongoClient)
      expect(server.locker).toBeInstanceOf(LockManager)
    })

    test('MongoDb should have expected database name', () => {
      expect(server.db.databaseName).toBe('waste-movement-backend')
    })

    test('MongoDb should have expected namespace', () => {
      expect(server.db.namespace).toBe('waste-movement-backend')
    })
  })

  describe('Shut down', () => {
    beforeAll(async () => {
      server = await createServer()
      await server.initialize()
    })

    test('Should close Mongo client on server stop', async () => {
      const closeSpy = jest.spyOn(server.mongoClient, 'close')
      await server.stop({ timeout: 0 })

      expect(closeSpy).toHaveBeenCalledWith(true)
    })
  })

  describe('Handles errors', () => {
    test('Server should throw an error if MongoDB times out whilst connecting', async () => {
      config.set('mongo.timeoutMs', 1)

      await expect(() => createServer()).rejects.toThrowError(
        'Failed to connect to MongoDB'
      )
    })
  })
})
