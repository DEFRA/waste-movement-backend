// mongosh script: seeds the records that the beta-2 OpenAPI examples refer to,
// so the examples (and Schemathesis' generated requests that reuse their IDs)
// reach the service's core logic instead of stopping at "not found".
//
// The records are read from the examples themselves. The create-movement and
// record-delivery response examples describe what those calls create, so
// they're replayed into the collections the service looks IDs up in.
// Upserts keep the script safe to re-run.
/* global db, print */ // mongosh globals
const fs = require('fs')

const specDir = '/spec'
const orgId = '00000000-0000-0000-0000-000000000000'
const createdAt = new Date().toISOString()

const readExamples = (file) =>
  Object.values(JSON.parse(fs.readFileSync(`${specDir}/${file}`, 'utf8'))).map(
    (example) => example.value
  )

const movements = readExamples(
  'creation/create-movement-response.examples.json'
).map(({ data }) => ({ movementId: data.movementId, orgId, createdAt }))

const deliveries = readExamples(
  'delivery/record-delivery-response.examples.json'
).flatMap(({ data }) =>
  data.deliveries.map(({ deliveryId, movementIds, wasteType }) => ({
    deliveryId,
    movementIds,
    wasteType,
    orgId,
    createdAt
  }))
)

const serviceDb = db.getSiblingDB('waste-movement-backend')

const upsertAll = (collection, key, records) =>
  records.forEach((record) =>
    serviceDb
      .getCollection(collection)
      .replaceOne({ [key]: record[key] }, record, { upsert: true })
  )

upsertAll('movements', 'movementId', movements)
upsertAll('deliveries', 'deliveryId', deliveries)

print(
  `Seeded movements [${movements.map((m) => m.movementId)}] and deliveries [${deliveries.map((d) => d.deliveryId)}]`
)
