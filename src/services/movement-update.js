export async function updateWasteInput(
  db,
  wasteTrackingId,
  updateData,
  fieldToUpdate
) {
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

  const historyEntry = {
    ...existingWasteInput,
    wasteTrackingId, // Add reference to original document
    timestamp: new Date()
  }

  delete historyEntry._id

  await wasteInputsHistoryCollection.insertOne(historyEntry)

  let result
  if (fieldToUpdate) {
    result = await wasteInputsCollection.updateOne(
      { _id: wasteTrackingId },
      {
        $set: { [fieldToUpdate]: { ...updateData } },
        $inc: { revision: 1 }
      }
    )
  } else {
    result = await wasteInputsCollection.updateOne(
      { _id: wasteTrackingId },
      {
        $set: updateData,
        $inc: { revision: 1 }
      }
    )
  }

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount
  }
}
