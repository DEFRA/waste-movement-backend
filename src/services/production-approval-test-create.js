import { productionApprovalTestScenarioIds } from 'waste-movement-utils'
import { createLogger } from '../common/helpers/logging/logger.js'
import { metricsCounter } from '../common/helpers/metrics.js'
import { ProductionApprovalTest } from '../domain/productionApprovalTest.js'
import { PAT_STATUS } from '../services/production-approval-tests/status.js'

const logger = createLogger()

export async function createProductionApprovalTest(db, clientId, results) {
  try {
    const resultsSummary = buildProductionApprovalTestResultsSummary(results)

    const productionApprovalTest = new ProductionApprovalTest()
    productionApprovalTest.clientId = clientId
    productionApprovalTest.createdAt = new Date()
    productionApprovalTest.results = Object.values(resultsSummary.results)

    const insertedId = await db
      .collection('production-approval-tests')
      .insertOne(productionApprovalTest)
      .then((result) => result?.insertedId)

    if (!insertedId) {
      throw new Error('Inserted id is undefined')
    }

    const metricsDimensions = {
      createdAt: productionApprovalTest.createdAt,
      clientId,
      totalScenarios: resultsSummary.total,
      totalScenariosSubmitted: resultsSummary.totalSubmitted,
      totalScenariosPassed: resultsSummary.totalPassed,
      totalScenariosFailed: resultsSummary.totalFailed
    }

    Object.values(resultsSummary.results).forEach((result) => {
      metricsDimensions[`status${result.scenarioId}`] = result.status
    })

    await metricsCounter('productionApprovalTest.create', 1, metricsDimensions)

    return { submissionId: insertedId }
  } catch (error) {
    logger.error({ error }, 'Failed to create production approval test')
    throw new Error(
      `Failed to create production approval test: ${error.message}`
    )
  }
}

export function buildProductionApprovalTestResultsSummary(results) {
  if (!Array.isArray(results)) {
    throw new Error(
      `buildProductionApprovalTestResultsSummary() expected 'results' to be array but instead got '${typeof results}'`
    )
  }

  return results.reduce(
    (info, result) => {
      info.totalPassed += result.status === PAT_STATUS.PASS ? 1 : 0
      info.totalFailed += result.status === PAT_STATUS.FAIL ? 1 : 0
      info.results[result.scenarioId] = result
      return info
    },
    {
      total: productionApprovalTestScenarioIds.length,
      totalSubmitted: results.length,
      totalPassed: 0,
      totalFailed: 0,
      results: buildDefaultResultsObject(productionApprovalTestScenarioIds)
    }
  )
}

export function buildDefaultResultsObject(results) {
  if (!Array.isArray(results)) {
    throw new Error(
      `buildDefaultResultsObject() expected 'results' to be array but instead got '${typeof results}'`
    )
  }

  return results.reduce((status, scenarioId) => {
    status[scenarioId] = {
      scenarioId,
      wasteTrackingId: '',
      status: PAT_STATUS.NOT_SUBMITTED,
      message: ''
    }
    return status
  }, {})
}
