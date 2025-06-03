export async function updateWasteInput(db, wasteTrackingId, updateData) {
  const collection = db.collection('waste-inputs')
  const result = await collection.updateOne(
    { _id: wasteTrackingId },
    { $set: updateData }
  )
  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount
  }
}
