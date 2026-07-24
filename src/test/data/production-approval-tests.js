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

export const productionApprovalTestsResults = {
  R01: {
    scenarioId: 'R01',
    wasteTrackingId: '26BHUT6U',
    status: 'Pass',
    message: ''
  },
  R02: {
    scenarioId: 'R02',
    wasteTrackingId: '26BHUT6U',
    status: 'Fail',
    message: 'Expected more than 1 waste item for R02, found 1'
  },
  R03: {
    scenarioId: 'R03',
    wasteTrackingId: '26BHUT6U',
    status: 'Fail',
    message:
      'Expected carrier.meansOfTransport to be "Road" for R03, found "Rail"'
  },
  R04: {
    scenarioId: 'R04',
    wasteTrackingId: '26BHUT6U',
    status: 'Fail',
    message:
      'Expected no disposal or recovery codes for R04, found codes on waste item(s) at index 0'
  },
  R05: {
    scenarioId: 'R05',
    wasteTrackingId: '26BHUT6U',
    status: 'Fail',
    message:
      'Expected at least one waste item to have multiple disposal or recovery codes for R05'
  },
  R07: {
    scenarioId: 'R07',
    wasteTrackingId: '26BHUT6U',
    status: 'Pass',
    message: ''
  },
  C02: {
    scenarioId: 'C02',
    wasteTrackingId: '26BHUT6U',
    status: 'Pass',
    message: ''
  },
  B01: {
    scenarioId: 'B01',
    wasteTrackingId: '26BHUT6U',
    status: 'Fail',
    message: 'No broker or dealer involvement in the movement'
  },
  P01: {
    scenarioId: 'P01',
    wasteTrackingId: '26BHUT6U',
    status: 'Pass',
    message: ''
  },
  H01: {
    scenarioId: 'H01',
    wasteTrackingId: '26BHUT6U',
    status: 'Fail',
    message:
      'Expected one or more waste items to have multiple hazardous components'
  },
  H03: {
    scenarioId: 'H03',
    wasteTrackingId: '26BHUT6U',
    status: 'Pass',
    message: ''
  },
  X01: {
    scenarioId: 'X01',
    wasteTrackingId: '26BHUT6U',
    status: 'Fail',
    message:
      'Expected one or more waste items to have POPs and Hazardous components'
  }
}
