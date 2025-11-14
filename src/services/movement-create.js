import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()

export async function createWasteInput(db, wasteInput) {
  try {
    wasteInput._id = wasteInput.wasteTrackingId
    wasteInput.revision = 1
    const now = new Date()
    wasteInput.createdAt = now
    wasteInput.lastUpdatedAt = now
    const collection = db.collection('waste-inputs')
    const result = await collection.insertOne(wasteInput)
    return { _id: result?.insertedId }
  } catch (error) {
    logger.error(`Failed to create waste input: ${error.message}`)
    throw error
  }
}
