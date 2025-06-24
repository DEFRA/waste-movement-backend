import { MongoClient } from 'mongodb'
import { config } from '../config.js'
const mongoConfig = config.get('mongo')

export const createTestMongoDb = async () => {
  const client = new MongoClient(mongoConfig.uri)
  await client.connect()
  return { client, db: client.db(mongoConfig.databaseName) }
}
