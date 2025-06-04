export async function updateWasteInput(db, wasteTrackingId, updateData) {
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

    return {
      matchedCount: 0,
      modifiedCount: 0
    }
  }

  const currentRevision = existingWasteInput.revision || 1

  const historyEntry = {
    ...existingWasteInput,
    wasteTrackingId, // Add reference to original document
    timestamp: new Date()
  }

  await wasteInputsHistoryCollection.insertOne(historyEntry)

  const result = await wasteInputsCollection.updateOne(
    { _id: wasteTrackingId },
    {
      $set: updateData,
      $inc: { revision: currentRevision }
    }
  )

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount
  }
}
