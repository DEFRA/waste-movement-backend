import { runScenarioR01Tests } from './scenarios/r01-single-waste-item.js'
import { runScenarioR02Tests } from './scenarios/r02-multiple-waste-items.js'
import { runScenarioR03Tests } from './scenarios/r03-road-transport.js'
import { runScenarioR04Tests } from './scenarios/r04-no-disposal-or-recovery-codes.js'
import { runScenarioR05Tests } from './scenarios/r05-multiple-disposal-or-recovery-codes.js'
import { runScenarioR07Tests } from './scenarios/r07-dual-ewc-codes.js'
import { runScenarioC02Tests } from './scenarios/c02-reason-for-no-carrier-registration-number.js'

export const SCENARIO_REGISTRY = {
  R01: runScenarioR01Tests,
  R02: runScenarioR02Tests,
  R03: runScenarioR03Tests,
  R04: runScenarioR04Tests,
  R05: runScenarioR05Tests,
  R07: runScenarioR07Tests,
  C02: runScenarioC02Tests
}

export const SUPPORTED_SCENARIO_IDS = Object.keys(SCENARIO_REGISTRY)
