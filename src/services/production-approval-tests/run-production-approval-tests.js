import { createLogger } from '../../common/helpers/logging/logger.js'
import { SCENARIO_REGISTRY } from './scenario-registry.js'
import { error } from './status.js'

const logger = createLogger()

export function runProductionApprovalTests(productionApprovalTestData) {
  return productionApprovalTestData.map(runSingleTest)
}

function runSingleTest({ scenarioId, wasteTrackingId, wasteInput }) {
  const runner = SCENARIO_REGISTRY[scenarioId]
  let result

  if (!runner) {
    result = error(`Unsupported scenarioId: ${scenarioId}`)
  } else {
    try {
      result = runner(wasteInput)
    } catch (err) {
      logger.error(
        { err, scenarioId, wasteTrackingId },
        'Production approval test threw an unexpected error'
      )
      result = error(err.message)
    }
  }

  return {
    scenarioId,
    wasteTrackingId,
    status: result.status,
    message: result.message
  }
}
