import { MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'

import { config } from '../../config.js'
import Boom from '@hapi/boom'

const mongoConfig = config.get('mongo')

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
        const timeoutMs = config.get('mongo').timeoutMs

        client = await MongoClient.connect(options.mongoUri, {
          retryWrites: options.retryWrites,
          readPreference: options.readPreference,
          serverSelectionTimeoutMS: timeoutMs,
          connectTimeoutMS: timeoutMs,
          socketTimeoutMS: timeoutMs,
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
        throw Boom.internal('Failed to connect to MongoDB')
      }
    }
  },
  options: {
    mongoUri: mongoConfig.uri,
    databaseName: mongoConfig.databaseName,
    retryWrites: false,
    readPreference: 'secondary'
  }
}

async function createIndexes(db) {
  await db.collection('mongo-locks').createIndex({ id: 1 })

  await db.collection('waste-inputs').createIndex({ id: 1 })
  await db.collection('waste-inputs').createIndex({ wasteTrackingId: 1 })
  await db
    .collection('waste-inputs-history')
    .createIndex({ wasteTrackingId: 1, revision: 1 })
}
