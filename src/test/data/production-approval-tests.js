import { PRODUCTION_APPROVAL_TEST_SCENARIO_IDS } from 'waste-movement-utils'
import { generateWasteTrackingId } from '../generate-waste-tracking-id.js'

export const productionApprovalTestsRequestPayload = [
  {
    scenarioId: PRODUCTION_APPROVAL_TEST_SCENARIO_IDS.R01,
    wasteTrackingId: generateWasteTrackingId()
  },
  {
    scenarioId: PRODUCTION_APPROVAL_TEST_SCENARIO_IDS.R02,
    wasteTrackingId: generateWasteTrackingId()
  }
]
