import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { getWasteInputs } from './movement-get.js'
import { orgId1 } from '../test/data/apiCodes.js'

describe('getWasteInputs', () => {
  let mongoClient
  let testMongoDb

  const wasteTrackingId = generateWasteTrackingId()
  const bulkId = '32ef4941-d9c4-4ee2-8fa2-74a35a2d4f82'
  const dateNow = new Date()
  const wasteInput = {
    _id: wasteTrackingId,
    wasteTrackingId,
    receipt: { movement: {} },
    createdAt: dateNow,
    lastUpdatedAt: dateNow,
    orgId: orgId1,
    submittingOrganisation: {
      defraCustomerOrganisationId: 'fd98d4ef34e33b34fc8fad03f8c385'
    },
    traceId: '0d673e00-a45c-435e-acec-36dbdcf5c071',
    bulkId,
    revision: 2
  }
  const wasteInputHistory = {
    ...wasteInput,
    revision: 1
  }

  beforeAll(async () => {
    const testMongo = await createTestMongoDb()
    mongoClient = testMongo.client
    testMongoDb = testMongo.db

    const wasteInputsCollection = testMongoDb.collection('waste-inputs')
    const wasteInputsHistoryCollection = testMongoDb.collection(
      'waste-inputs-history'
    )

    await wasteInputsCollection.insertOne(wasteInput)
    await wasteInputsHistoryCollection.insertOne(wasteInputHistory)
  })

  afterAll(async () => {
    await mongoClient.close()
  })

  it('should get the latest waste movement without history when given wasteTrackingId and includeHistory is false', async () => {
    const result = await getWasteInputs({
      db: testMongoDb,
      wasteTrackingId,
      includeHistory: false
    })

    expect(result).toEqual([wasteInput])
  })

  it('should get the latest waste movement without history when given wasteTrackingId and includeHistory is not given', async () => {
    const result = await getWasteInputs({
      db: testMongoDb,
      wasteTrackingId
    })

    expect(result).toEqual([wasteInput])
  })

  it('should get the all waste movements with history when given wasteTrackingId and includeHistory is true', async () => {
    const result = await getWasteInputs({
      db: testMongoDb,
      wasteTrackingId,
      includeHistory: true
    })

    expect(result).toEqual([wasteInput, wasteInputHistory])
  })

  it('should get the latest waste movement without history when given bulkId and includeHistory is false', async () => {
    const result = await getWasteInputs({
      db: testMongoDb,
      bulkId,
      includeHistory: false
    })

    expect(result).toEqual([wasteInput])
  })

  it('should get the latest waste movement without history when given bulkId and includeHistory is not given', async () => {
    const result = await getWasteInputs({
      db: testMongoDb,
      bulkId
    })

    expect(result).toEqual([wasteInput])
  })

  it('should get the all waste movements with history when given bulkId and includeHistory is true', async () => {
    const result = await getWasteInputs({
      db: testMongoDb,
      bulkId,
      includeHistory: true
    })

    expect(result).toEqual([wasteInput, wasteInputHistory])
  })

  it('should get the latest waste movement without history when given wasteTrackingId and bulkId and includeHistory is false', async () => {
    const result = await getWasteInputs({
      db: testMongoDb,
      wasteTrackingId,
      bulkId,
      includeHistory: false
    })

    expect(result).toEqual([wasteInput])
  })

  it('should get the latest waste movement without history when given wasteTrackingId and bulkId and includeHistory is not given', async () => {
    const result = await getWasteInputs({
      db: testMongoDb,
      wasteTrackingId,
      bulkId
    })

    expect(result).toEqual([wasteInput])
  })

  it('should get the all waste movements with history when given wasteTrackingId and bulkId and includeHistory is true', async () => {
    const result = await getWasteInputs({
      db: testMongoDb,
      wasteTrackingId,
      bulkId,
      includeHistory: true
    })

    expect(result).toEqual([wasteInput, wasteInputHistory])
  })

  it('should return an empty array when no waste movements are found', async () => {
    const result = await getWasteInputs({
      db: testMongoDb,
      wasteTrackingId: 'id-does-not-exist',
      includeHistory: true
    })

    expect(result).toEqual([])
  })

  it('should handle database errors', async () => {
    const mockDb = {
      collection: jest.fn().mockImplementation(() => {
        throw mockError
      })
    }
    const mockError = new Error('Database error')

    await expect(
      getWasteInputs({
        db: mockDb,
        wasteTrackingId
      })
    ).rejects.toThrow(mockError.message)
  })
})
