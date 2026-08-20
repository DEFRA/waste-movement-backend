import {
  METRIC_NAMES,
  productionApprovalTestScenarioIds
} from '@defra/waste-movement-utils'
import { createLogger } from '../common/helpers/logging/logger.js'
import { metricsCounter } from '../common/helpers/metrics.js'
import { ProductionApprovalTest } from '../domain/productionApprovalTest.js'
import { PAT_STATUS } from './production-approval-tests/status.js'

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
      clientId,
      totalScenarios: resultsSummary.total,
      totalScenariosSubmitted: resultsSummary.totalSubmitted,
      totalScenariosPassed: resultsSummary.totalPassed,
      totalScenariosFailed: resultsSummary.totalFailed
    }

    logger.info(
      `${METRIC_NAMES.PAT_SUBMISSION} - scenarios: ${resultsSummary.total} - submitted: ${resultsSummary.totalSubmitted} - passed: ${resultsSummary.totalPassed} - failed: ${resultsSummary.totalFailed}`
    )

    Object.values(resultsSummary.results).forEach((result) => {
      metricsDimensions[`status${result.scenarioId}`] = result.status
      logger.info(
        `${METRIC_NAMES.PAT_SCENARIO_RESULT} - ${result.scenarioId} - ${result.status}`
      )
    })

    // CloudWatch only returns a metric when queried with its full dimension
    // set, so the dashboard metrics are emitted separately at low cardinality.
    // Dashboards aggregate across clientId via SEARCH() wildcards.
    await Promise.all([
      metricsCounter('productionApprovalTest.create', 1, metricsDimensions),
      metricsCounter('pat.submissions', 1, { clientId }),
      ...Object.values(resultsSummary.results).map((result) =>
        metricsCounter('pat.scenario.result', 1, {
          clientId,
          scenario: result.scenarioId,
          result: result.status
        })
      )
    ])

    return { submissionId: insertedId }
  } catch (error) {
    logger.error({ error }, 'Failed to create production approval test')
    throw new Error(
      `Failed to create production approval test: ${error.message}`
    )
  }
}

/**
 * Builds a summary of Production Approval Test results
 *
 * @param {Array} results - The Production Approval Test results
 *
 * @returns {Object} The Production Approval Test summary
 */
export function buildProductionApprovalTestResultsSummary(results) {
  if (!Array.isArray(results)) {
    throw new TypeError(
      `buildProductionApprovalTestResultsSummary() expected 'results' to be array but instead got '${typeof results}'`
    )
  }

  return results.reduce(
    (summary, result) => {
      summary.totalPassed += result.status === PAT_STATUS.PASS ? 1 : 0
      summary.totalFailed += result.status === PAT_STATUS.FAIL ? 1 : 0
      summary.results[result.scenarioId] = result
      return summary
    },
    {
      total: productionApprovalTestScenarioIds.length,
      totalSubmitted: results.length,
      totalPassed: 0,
      totalFailed: 0,
      results: buildDefaultProductionApprovalTestResultsObject(
        productionApprovalTestScenarioIds
      )
    }
  )
}

/**
 * Builds a default Production Approval Test results object
 *
 * @param {Array} results - The Production Approval Test results
 *
 * @returns {Object} The Production Approval Test results object
 */
export function buildDefaultProductionApprovalTestResultsObject(results) {
  if (!Array.isArray(results)) {
    throw new TypeError(
      `buildDefaultProductionApprovalTestResultsObject() expected 'results' to be array but instead got '${typeof results}'`
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
