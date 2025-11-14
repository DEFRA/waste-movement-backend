import { MongoClient } from 'mongodb'
import { config } from '../config.js'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
const mongoConfig = config.get('mongo')

export const createTestMongoDb = async (useReplicaSet) => {
  let replicaSet
  let mongoUri = mongoConfig.uri

  // Need to use mongodb-memory-server for testing transactions as jest-mongodb
  // doesn't support that, see https://github.com/shelfio/jest-mongodb/issues/152
  if (useReplicaSet) {
    replicaSet = await MongoMemoryReplSet.create({
      instanceOpts: [
        {
          port: 17017
        }
      ],
      replSet: {
        dbName: 'waste-movement-backend',
        count: 1,
        storageEngine: 'wiredTiger'
      }
    })

    mongoUri = replicaSet.getUri()
  }

  const client = new MongoClient(mongoUri)
  await client.connect()
  return {
    client,
    db: client.db(mongoConfig.databaseName),
    mongoUri,
    replicaSet
  }
}
