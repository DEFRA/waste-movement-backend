import { findWasteInputs } from './find-waste-inputs.js'

describe('#findWasteInputs', () => {
  const wasteTrackingIds = [{ wasteTrackingId: 1 }, { wasteTrackingId: 2 }]

  it('should return the requested waste inputs on the first attempt', async () => {
    const collection = {
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockReturnValue([{}, {}])
      })
    }
    const findSpy = jest.spyOn(collection, 'find')

    const result = await findWasteInputs(2, [collection], wasteTrackingIds)

    expect(result).toEqual([{}, {}])

    expect(findSpy).toHaveBeenCalledTimes(1)
  })

  it('should return the requested waste inputs on the third attempt if not found in the previous attempts', async () => {
    const collection = {
      find: jest.fn().mockReturnValue({
        toArray: jest
          .fn()
          .mockReturnValueOnce([])
          .mockReturnValueOnce([])
          .mockReturnValueOnce([{}, {}])
      })
    }
    const findSpy = jest.spyOn(collection, 'find')

    const result = await findWasteInputs(2, [collection], wasteTrackingIds)

    expect(result).toEqual([{}, {}])

    expect(findSpy).toHaveBeenCalledTimes(3)
  })

  it('should throw an error if no waste inputs were found', async () => {
    const collection = {
      find: jest.fn().mockReturnValue({
        toArray: jest
          .fn()
          .mockReturnValueOnce([])
          .mockReturnValueOnce([])
          .mockReturnValueOnce([])
          .mockReturnValueOnce([])
          .mockReturnValueOnce([])
      })
    }
    const findSpy = jest.spyOn(collection, 'find')

    await expect(
      findWasteInputs(2, [collection], wasteTrackingIds)
    ).rejects.toThrow(
      "Failed to find waste inputs: Number of waste inputs found is different to the request waste inputs: Expected '2' but found '0'"
    )

    expect(findSpy).toHaveBeenCalledTimes(5)
  })

  it('should throw an error if less waste inputs than expected were found', async () => {
    const collection = {
      find: jest.fn().mockReturnValue({
        toArray: jest
          .fn()
          .mockReturnValueOnce([])
          .mockReturnValueOnce([])
          .mockReturnValueOnce([])
          .mockReturnValueOnce([])
          .mockReturnValueOnce([{}])
      })
    }
    const findSpy = jest.spyOn(collection, 'find')

    await expect(
      findWasteInputs(2, [collection], wasteTrackingIds)
    ).rejects.toThrow(
      "Failed to find waste inputs: Number of waste inputs found is different to the request waste inputs: Expected '2' but found '1'"
    )

    expect(findSpy).toHaveBeenCalledTimes(5)
  })
})
