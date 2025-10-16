export async function createWasteInput(db, wasteInput) {
  wasteInput._id = wasteInput.wasteTrackingId
  wasteInput.revision = 1
  const now = new Date()
  wasteInput.createdAt = now
  wasteInput.lastUpdatedAt = now
  const collection = db.collection('waste-inputs')
  const result = await collection.insertOne(wasteInput)
  return { _id: result.insertedId }
}
