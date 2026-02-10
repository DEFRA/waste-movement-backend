function createHistoryEntry(existingWasteInput, wasteTrackingId) {
  const historyEntry = {
    ...existingWasteInput,
    wasteTrackingId,
    timestamp: new Date()
  }
  delete historyEntry._id
  return historyEntry
}

export { createHistoryEntry }
