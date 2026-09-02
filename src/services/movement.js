const movementsCollectionId = 'movements'

/**
 * Looks up the given movement IDs in the `movements` collection and returns
 * the subset that exist.
 *
 * @param {import('mongodb').Db} db
 * @param {string[]} movementIds
 * @returns {Promise<string[]>} the movement IDs that were found
 */
export async function findMovementIds(db, movementIds) {
  const movementsCollection = db.collection(movementsCollectionId)
  const found = await movementsCollection
    .find(
      { movementId: { $in: movementIds } },
      { projection: { movementId: 1 } }
    )
    .toArray()

  return found.map((movement) => movement.movementId)
}
