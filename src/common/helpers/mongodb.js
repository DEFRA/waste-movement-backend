import { MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'

import { config } from '../../config.js'
import Boom from '@hapi/boom'

let mongoConfig = config.get('mongo')

export const mongoDb = {
  plugin: {
    name: 'mongodb',
    version: '1.0.0',
    register: async function (server, options) {
      server.logger.info('Setting up MongoDb')

      let client

      try {
        // Set mongo config value explicitly again so it picks up changes to the config
        // set elsewhere in the code which doesn't happen if it's set in options
        mongoConfig = config.get('mongo')

        client = await MongoClient.connect(mongoConfig.uri, {
          retryWrites: options.retryWrites,
          readPreference: mongoConfig.readPreference,
          serverSelectionTimeoutMS: mongoConfig.timeoutMs,
          connectTimeoutMS: mongoConfig.timeoutMs,
          socketTimeoutMS: mongoConfig.timeoutMs,
          ...(server.secureContext && { secureContext: server.secureContext })
        })

        const databaseName = options.databaseName
        const db = client.db(databaseName)
        const locker = new LockManager(db.collection('mongo-locks'))

        await createIndexes(db)

        server.logger.info(`MongoDb connected to ${databaseName}`)

        server.decorate('server', 'mongoClient', client)
        server.decorate('server', 'db', db)
        server.decorate('server', 'locker', locker)
        server.decorate('request', 'db', () => db, { apply: true })
        server.decorate('request', 'locker', () => locker, { apply: true })
        server.decorate('request', 'mongoClient', client)

        server.events.on('stop', async () => {
          server.logger.info('Closing Mongo client')
          await client.close(true)
        })
      } catch (error) {
        if (client) {
          await client.close(true)
        }
        server.logger.error('Failed to connect to MongoDB')
        throw Boom.internal('Failed to connect to MongoDB')
      }
    }
  },
  options: {
    mongoUri: mongoConfig.uri,
    databaseName: mongoConfig.databaseName,
    retryWrites: false,
    readPreference: mongoConfig.readPreference
  }
}

async function createIndexes(db) {
  await db.collection('mongo-locks').createIndex({ id: 1 })
  await db
    .collection('waste-inputs')
    .createIndex({ id: 1, wasteTrackingId: 1, revision: 1, traceId: 1 })
  await db
    .collection('waste-inputs-history')
    .createIndex({ wasteTrackingId: 1, revision: 1, traceId: 1 })
}
