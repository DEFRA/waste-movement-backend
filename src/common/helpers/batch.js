export const getBatches = (batchSize, data = []) => {
  if (isNaN(batchSize)) {
    return []
  }

  let currentBatchStart = 0
  let currentBatchEnd = batchSize

  const batches = []

  while (currentBatchStart <= data.length) {
    const currentBatch = data.slice(currentBatchStart, currentBatchEnd)

    if (currentBatch.length > 0) {
      batches.push(currentBatch)
    }

    currentBatchStart += batchSize
    currentBatchEnd += batchSize
  }

  return batches
}
