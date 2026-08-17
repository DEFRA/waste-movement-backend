import { MongoClient } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { createTestMongoDb as createTestMongoDbFactory } from '@defra/waste-movement-utils'
import { config } from '../config.js'

export const createTestMongoDb = (useReplicaSet) =>
  createTestMongoDbFactory({
    config,
    MongoClient,
    MongoMemoryReplSet,
    useReplicaSet
  })
