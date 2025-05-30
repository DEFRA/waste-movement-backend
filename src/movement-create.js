export async function createWasteInput(db, wasteInput) {
  wasteInput._id = wasteInput.wasteTrackingId
  const collection = db.collection('waste-inputs')
  const result = await collection.insertOne(wasteInput)
  return { _id: result.insertedId }
}
