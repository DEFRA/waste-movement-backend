import { runScenarioR01Tests } from './r01-single-waste-item.js'
import { runScenarioR02Tests } from './r02-multiple-waste-items.js'
import { runScenarioR03Tests } from './r03-road-transport.js'
import { runScenarioR04Tests } from './r04-no-disposal-or-recovery-codes.js'
import { runScenarioR05Tests } from './r05-multiple-disposal-or-recovery-codes.js'
import { runScenarioR07Tests } from './r07-dual-ewc-codes.js'

export const SCENARIO_REGISTRY = {
  R01: runScenarioR01Tests,
  R02: runScenarioR02Tests,
  R03: runScenarioR03Tests,
  R04: runScenarioR04Tests,
  R05: runScenarioR05Tests,
  R07: runScenarioR07Tests
}

export const SUPPORTED_SCENARIO_IDS = Object.keys(SCENARIO_REGISTRY)
