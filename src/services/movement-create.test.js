import { createWasteInput } from './movement-create.js'
import * as cdpAuditing from '@defra/cdp-auditing'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'
import * as logger from '../common/helpers/logging/logger.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest
    .fn()
    .mockImplementationOnce(() => true)
    .mockImplementationOnce(() => {
      throw new Error('Internal Server Error')
    })
}))

describe('createWasteInput', () => {
  let client
  let db
  let wasteInputsCollection

  beforeAll(async () => {
    const testMongo = await createTestMongoDb()
    client = testMongo.client
    db = testMongo.db
  })

  afterAll(async () => {
    await client.close()
  })

  beforeEach(async () => {
    wasteInputsCollection = db.collection('waste-inputs')

    await wasteInputsCollection.deleteMany({})
  })

  it('should create a movement, call the audit endpoint and return the inserted id', async () => {
    const wasteTrackingId = '123456789'
    const mockMovement = {
      wasteTrackingId
    }
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    const result = await createWasteInput(db, mockMovement)

    expect(result).toEqual({ _id: wasteTrackingId })

    const createdWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    expect(createdWasteInput).toMatchObject({
      ...mockMovement,
      revision: 1
    })

    expect(auditSpy).toHaveBeenCalledTimes(1)
    expect(auditSpy).toHaveBeenCalledWith({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_CREATED,
      traceId: undefined,
      version: 1,
      data: mockMovement
    })
  })

  it('should create a movement and return the inserted id when calling the audit endpoint fails', async () => {
    const wasteTrackingId = '123456789'
    const mockMovement = {
      wasteTrackingId
    }
    const errorLoggerSpy = jest.spyOn(logger.createLogger(), 'error')

    const result = await createWasteInput(db, mockMovement)

    expect(result).toEqual({ _id: wasteTrackingId })

    const createdWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    expect(createdWasteInput).toMatchObject({
      ...mockMovement,
      revision: 1
    })

    expect(errorLoggerSpy).toHaveBeenCalledTimes(1)
  })

  it('should handle database errors and not call the audit endpoint', async () => {
    const mockMovement = {
      wasteTrackingId: '124453465'
    }
    const mockError = new Error('Database error')
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    await expect(
      createWasteInput(
        {
          collection: jest.fn().mockImplementation(() => {
            throw mockError
          })
        },
        mockMovement
      )
    ).rejects.toThrow(mockError.message)

    expect(auditSpy).not.toHaveBeenCalled()
  })
})
