import { calculateExponentialBackoffDelay } from '../common/helpers/exponential-backoff-delay.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { wait } from '@hapi/hoek'

const logger = createLogger()

export async function updateWasteInput(
  db,
  wasteTrackingId,
  updateData,
  fieldToUpdate = undefined,
  depth = 0,
  mongoClient
) {
  const session = mongoClient.startSession()

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

    const now = new Date()
    let result

    await session.withTransaction(async () => {
      await wasteInputsHistoryCollection.insertOne(historyEntry, { session })

      result = await wasteInputsCollection.updateOne(
        { _id: wasteTrackingId },
        {
          $set: {
            ...(fieldToUpdate
              ? { [fieldToUpdate]: { ...updateData } }
              : updateData),
            lastUpdatedAt: now
          },
          $inc: { revision: 1 }
        },
        { session }
      )
    })

    return {
      matchedCount: result?.matchedCount,
      modifiedCount: result?.modifiedCount
    }
  } catch (error) {
    logger.error(`Failed to update waste input: ${error.message}`)

    const { hasDelay, delay } = calculateExponentialBackoffDelay(depth)

    if (hasDelay) {
      logger.error(
        `Waiting ${delay}ms to retry updateWasteInput() with a depth of ${depth}`
      )
      await wait(delay)
      return updateWasteInput(
        db,
        wasteTrackingId,
        updateData,
        fieldToUpdate,
        depth + 1,
        mongoClient
      )
    }

    throw error
  } finally {
    await session.endSession()
  }
}
