import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()

export async function createBulkWasteInput(db, mongoClient, wasteInputs) {
  try {
    const createdWasteTrackingIds = []
    const wasteInputsCollection = db.collection('waste-inputs')
    const wasteInputsHistoryCollection = db.collection('waste-inputs-history')

    // We need to guarantee that either all or none of the documents are persisted so using a
    // transaction here rather than insertMany() because if insertMany() fails halfway through
    // then the documents inserted up to that point will be persisted and won't be rolled back
    // see: https://www.mongodb.com/docs/manual/reference/method/db.collection.insertMany
    const session = mongoClient.startSession()
    await session.withTransaction(async () => {
      const filters = { bulkId: wasteInputs[0].bulkId, revision: 1 }
      const existingWasteInput = await wasteInputsCollection
        .findOne(filters, { session })
        .then(
          (result) =>
            result || wasteInputsHistoryCollection.findOne(filters, { session })
        )

      if (existingWasteInput) {
        throw new Error(
          `Failed to create waste inputs: Waste inputs with bulk id (${wasteInputs[0].bulkId}) already exist`
        )
      }

      for (const wasteInput of wasteInputs) {
        if (!wasteInput.wasteTrackingId) {
          throw new Error(
            `Failed to create waste inputs: Not all waste inputs with bulk id (${wasteInput.bulkId}) have a waste tracking id`
          )
        }

        wasteInput._id = wasteInput.wasteTrackingId
        const result = await wasteInputsCollection.insertOne(wasteInput, {
          session
        })

        createdWasteTrackingIds.push(result.insertedId)
      }
    })

    return createdWasteTrackingIds.map((wasteTrackingId) => ({
      wasteTrackingId
    }))
  } catch (error) {
    logger.error(`Failed to create waste inputs: ${error.message}`)
    throw error
  }
}
