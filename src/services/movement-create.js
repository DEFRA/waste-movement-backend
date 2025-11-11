import { calculateExponentialBackoffDelay } from '../common/helpers/exponential-backoff-delay.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { wait } from '@hapi/hoek'

const logger = createLogger()

export async function createWasteInput(db, wasteInput, depth = 0) {
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

    const { hasDelay, delay } = calculateExponentialBackoffDelay(depth)

    if (hasDelay) {
      logger.error(
        `Waiting ${delay}ms to retry createWasteInput() with a depth of ${depth}`
      )
      return wait(delay, createWasteInput(db, wasteInput, depth + 1))
    }

    throw new Error(error)
  }
}
