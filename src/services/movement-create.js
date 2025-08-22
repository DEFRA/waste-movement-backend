export async function createWasteInput(db, wasteInput) {
  wasteInput._id = wasteInput.wasteTrackingId
  wasteInput.revision = 1
  const collection = db.collection('waste-inputs')
  const result = await collection.insertOne(wasteInput)

  if (wasteInput.michaelTest === 'test') {
    return 'Untested'
  }
  return { _id: result.insertedId }
}
