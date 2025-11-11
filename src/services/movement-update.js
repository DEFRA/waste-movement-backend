import { calculateExponentialBackoffDelay } from '../common/helpers/exponential-backoff-delay.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { wait } from '@hapi/hoek'

const logger = createLogger()

export async function updateWasteInput(
  db,
  wasteTrackingId,
  updateData,
  fieldToUpdate,
  depth = 0
) {
  try {
    const wasteInputsCollection = db.collection('waste-inputs')
    const wasteInputsHistoryCollection = db.collection('waste-inputs-history')
    const invalidSubmissionsCollection = db.collection('invalid-submissions')

    const existingWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    if (!existingWasteInput) {
      await invalidSubmissionsCollection.insertOne({
        wasteTrackingId,
        updateData,
        timestamp: new Date(),
        reason: 'Waste input not found'
      })

      return { matchedCount: 0, modifiedCount: 0 }
    }

    const historyEntry = {
      ...existingWasteInput,
      wasteTrackingId, // Add reference to original document
      timestamp: new Date()
    }

    delete historyEntry._id

    await wasteInputsHistoryCollection.insertOne(historyEntry)

    const now = new Date()
    let result
    if (fieldToUpdate) {
      result = await wasteInputsCollection.updateOne(
        { _id: wasteTrackingId },
        {
          $set: { [fieldToUpdate]: { ...updateData }, lastUpdatedAt: now },
          $inc: { revision: 1 }
        }
      )
    } else {
      result = await wasteInputsCollection.updateOne(
        { _id: wasteTrackingId },
        {
          $set: { ...updateData, lastUpdatedAt: now },
          $inc: { revision: 1 }
        }
      )
    }

    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    }
  } catch (error) {
    logger.error(`Failed to update waste input: ${error.message}`)

    const { hasDelay, delay } = calculateExponentialBackoffDelay(depth)

    if (hasDelay) {
      logger.error(
        `Waiting ${delay}ms to retry updateWasteInput() with a depth of ${depth}`
      )
      return wait(
        delay,
        updateWasteInput(
          db,
          wasteTrackingId,
          updateData,
          fieldToUpdate,
          depth + 1
        )
      )
    }

    throw new Error(error)
  }
}
