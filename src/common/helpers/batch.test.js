import { getBatches } from './batch'

describe('batch', () => {
  describe('#getBatches', () => {
    it('should get batches with an even number of data items', () => {
      const result = getBatches(2, [1, 2, 3, 4, 5, 6])

      expect(result).toEqual([
        [1, 2],
        [3, 4],
        [5, 6]
      ])
    })

    it('should get batches with an odd number of data items', () => {
      const result = getBatches(2, [1, 2, 3, 4, 5])

      expect(result).toEqual([[1, 2], [3, 4], [5]])
    })

    it('should get a single batch', () => {
      const result = getBatches(100, [1, 2, 3, 4, 5, 6])

      expect(result).toEqual([[1, 2, 3, 4, 5, 6]])
    })

    it('should return an empty array when provided with an empty data array', () => {
      const result = getBatches(2, [])

      expect(result).toEqual([])
    })

    it('should return an empty array when provided with no data array', () => {
      const result = getBatches(2)

      expect(result).toEqual([])
    })

    it('should return an empty array when provided with no batch size', () => {
      const result = getBatches([1, 2, 3, 4, 5, 6])

      expect(result).toEqual([])
    })

    it('should return an empty array when provided with no batch size or data array', () => {
      const result = getBatches()

      expect(result).toEqual([])
    })
  })
})
