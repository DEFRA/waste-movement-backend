import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import {
  buildDefaultProductionApprovalTestResultsObject,
  createProductionApprovalTest,
  buildProductionApprovalTestResultsSummary
} from './production-approval-test-create.js'
import { ObjectId } from 'mongodb'
import * as metrics from '../common/helpers/metrics.js'
import {
  METRIC_NAMES,
  productionApprovalTestScenarioIds,
  productionApprovalTestsResults
} from '@defra/waste-movement-utils'
import { PAT_STATUS } from './production-approval-tests/status.js'
import { createLogger } from '../common/helpers/logging/logger.js'

describe('production-approval-test-create', () => {
  // Remove R01, R02 and R03 from the results so these results will be in a 'Not Submitted' state
  const testResultData = Object.values(productionApprovalTestsResults).slice(3)

  describe('#createProductionApprovalTest', () => {
    let client
    let db
    let productionApprovalTestsCollection

    const clientId = 'client-id-123'

    beforeAll(async () => {
      const testMongo = await createTestMongoDb()
      client = testMongo.client
      db = testMongo.db
    })

    afterAll(async () => {
      await client.close()
    })

    beforeEach(async () => {
      productionApprovalTestsCollection = db.collection(
        'production-approval-tests'
      )

      await productionApprovalTestsCollection.deleteMany({})
    })

    it('should create a production approval test and return the inserted id', async () => {
      const metricsCounterSpy = jest.spyOn(metrics, 'metricsCounter')
      const infoLoggerSpy = jest.spyOn(createLogger(), 'info')

      const result = await createProductionApprovalTest(
        db,
        clientId,
        testResultData
      )

      const createdProductionApprovalTest =
        await productionApprovalTestsCollection.findOne({
          clientId
        })

      expect(result).toEqual({
        submissionId: createdProductionApprovalTest._id
      })

      expect(createdProductionApprovalTest).toMatchObject({
        _id: expect.any(ObjectId),
        clientId,
        createdAt: expect.any(Date),
        results: [
          {
            message: '',
            scenarioId: 'R01',
            status: 'Not Submitted',
            wasteTrackingId: ''
          },
          {
            message: '',
            scenarioId: 'R02',
            status: 'Not Submitted',
            wasteTrackingId: ''
          },
          {
            message: '',
            scenarioId: 'R03',
            status: 'Not Submitted',
            wasteTrackingId: ''
          },
          ...testResultData
        ]
      })

      // The submission summary and count metrics, plus one per scenario
      expect(metricsCounterSpy).toHaveBeenCalledTimes(
        2 + productionApprovalTestScenarioIds.length
      )

      expect(metricsCounterSpy).toHaveBeenCalledWith(
        'productionApprovalTest.create',
        1,
        {
          clientId,
          totalScenarios: 12,
          totalScenariosSubmitted: 9,
          totalScenariosPassed: 4,
          totalScenariosFailed: 5,
          statusB01: 'Fail',
          statusC02: 'Pass',
          statusH01: 'Fail',
          statusH03: 'Pass',
          statusP01: 'Pass',
          statusR01: 'Not Submitted',
          statusR02: 'Not Submitted',
          statusR03: 'Not Submitted',
          statusR04: 'Fail',
          statusR05: 'Fail',
          statusR07: 'Pass',
          statusX01: 'Fail'
        }
      )

      expect(metricsCounterSpy).toHaveBeenCalledWith('pat.submissions', 1, {
        clientId
      })

      expect(metricsCounterSpy).toHaveBeenCalledWith('pat.scenario.result', 1, {
        clientId,
        scenario: 'C02',
        result: PAT_STATUS.PASS
      })

      expect(metricsCounterSpy).toHaveBeenCalledWith('pat.scenario.result', 1, {
        clientId,
        scenario: 'B01',
        result: PAT_STATUS.FAIL
      })

      // Scenarios absent from the submission are still reported
      expect(metricsCounterSpy).toHaveBeenCalledWith('pat.scenario.result', 1, {
        clientId,
        scenario: 'R01',
        result: PAT_STATUS.NOT_SUBMITTED
      })

      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SUBMISSION} - scenarios: 12 - submitted: 9 - passed: 4 - failed: 5`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - R01 - ${PAT_STATUS.NOT_SUBMITTED}`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - R02 - ${PAT_STATUS.NOT_SUBMITTED}`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - R03 - ${PAT_STATUS.NOT_SUBMITTED}`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - R04 - ${PAT_STATUS.FAIL}`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - R05 - ${PAT_STATUS.FAIL}`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - R07 - ${PAT_STATUS.PASS}`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - C02 - ${PAT_STATUS.PASS}`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - B01 - ${PAT_STATUS.FAIL}`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - P01 - ${PAT_STATUS.PASS}`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - H01 - ${PAT_STATUS.FAIL}`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - H03 - ${PAT_STATUS.PASS}`
      )
      expect(infoLoggerSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - X01 - ${PAT_STATUS.FAIL}`
      )
    })

    it('should throw an error if inserted id is undefined', async () => {
      const metricsCounterSpy = jest.spyOn(metrics, 'metricsCounter')

      const mockDb = {
        collection: () => ({
          insertOne: jest.fn().mockResolvedValue(undefined)
        })
      }

      await expect(() =>
        createProductionApprovalTest(mockDb, clientId, testResultData)
      ).rejects.toThrowError(
        'Failed to create production approval test: Inserted id is undefined'
      )

      expect(metricsCounterSpy).not.toHaveBeenCalled()
    })

    it('should handle database errors', async () => {
      const metricsCounterSpy = jest.spyOn(metrics, 'metricsCounter')

      const mockDb = {
        collection: jest.fn().mockImplementation(() => {
          throw mockError
        })
      }
      const mockError = new Error('Database error')

      await expect(
        createProductionApprovalTest(mockDb, clientId, testResultData)
      ).rejects.toThrow(
        `Failed to create production approval test: ${mockError.message}`
      )

      expect(metricsCounterSpy).not.toHaveBeenCalled()
    })
  })

  describe('buildProductionApprovalTestResultsSummary', () => {
    it('should return the correct summary when given results', () => {
      const result = buildProductionApprovalTestResultsSummary(testResultData)

      expect(result).toEqual({
        total: 12,
        totalSubmitted: 9,
        totalPassed: 4,
        totalFailed: 5,
        results: {
          ...productionApprovalTestsResults,
          ...buildDefaultProductionApprovalTestResultsObject([
            'R01',
            'R02',
            'R03'
          ])
        }
      })
    })

    it('should return the default summary when not given results', () => {
      const result = buildProductionApprovalTestResultsSummary([])

      expect(result).toEqual({
        total: 12,
        totalSubmitted: 0,
        totalPassed: 0,
        totalFailed: 0,
        results: buildDefaultProductionApprovalTestResultsObject(
          productionApprovalTestScenarioIds
        )
      })
    })

    it('should throw an error when not given an array', () => {
      expect(() =>
        buildProductionApprovalTestResultsSummary(
          productionApprovalTestsResults
        )
      ).toThrowError(
        `buildProductionApprovalTestResultsSummary() expected 'results' to be array but instead got 'object'`
      )
    })
  })

  describe('#buildDefaultProductionApprovalTestResultsObject', () => {
    it('should return the correct results when given scenario ids', () => {
      const result = buildDefaultProductionApprovalTestResultsObject([
        'R01',
        'R02',
        'R03'
      ])

      expect(result).toEqual({
        R01: {
          scenarioId: 'R01',
          wasteTrackingId: '',
          status: PAT_STATUS.NOT_SUBMITTED,
          message: ''
        },
        R02: {
          scenarioId: 'R02',
          wasteTrackingId: '',
          status: PAT_STATUS.NOT_SUBMITTED,
          message: ''
        },
        R03: {
          scenarioId: 'R03',
          wasteTrackingId: '',
          status: PAT_STATUS.NOT_SUBMITTED,
          message: ''
        }
      })
    })

    it('should throw an error when not given an array', () => {
      expect(() =>
        buildDefaultProductionApprovalTestResultsObject(
          productionApprovalTestsResults
        )
      ).toThrowError(
        `buildDefaultProductionApprovalTestResultsObject() expected 'results' to be array but instead got 'object'`
      )
    })
  })
})
