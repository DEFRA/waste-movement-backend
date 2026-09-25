import { createServer } from '../../../src/server.js'
import { config } from '../../../src/config.js'
import { createTestMongoDb } from '../../../src/test/create-test-mongo-db.js'
import { base64EncodedOrgApiCodes } from '../../../src/test/data/apiCodes.js'

// Boots the real service - real MongoDB (in-memory replica set, so
// transactions work), real Hapi server, real socket on an ephemeral port.
//
// `wasteTrackingUrl` points the service's waste-tracking-id-backend client at
// a stub (see waste-tracking-stub.js); suites that don't need it can omit it.
export async function startTestService({ wasteTrackingUrl } = {}) {
  const { client, db, mongoUri, replicaSet } = await createTestMongoDb(true)

  // The factory doesn't write these back to config, and a 1-node replica set
  // can't serve `secondary` reads (the schema default).
  config.set('mongo.uri', mongoUri)
  config.set('mongo.readPreference', 'primary')
  config.set('orgApiCodes', base64EncodedOrgApiCodes)
  config.set('host', '127.0.0.1')
  config.set('port', 0)
  if (wasteTrackingUrl) {
    config.set('services.wasteTracking', wasteTrackingUrl)
  }

  const server = await createServer()
  await server.start()

  // 127.0.0.1, not server.info.uri, which reports the unfetchable 0.0.0.0.
  const baseUrl = `http://127.0.0.1:${server.info.port}`

  return {
    baseUrl,
    server,
    db,
    async stop() {
      await server.stop()
      await client.close()
      if (replicaSet) {
        await replicaSet.stop()
      }
    }
  }
}
