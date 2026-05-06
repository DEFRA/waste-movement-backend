import { runProductionApprovalTests } from './run-production-approval-tests.js'
import { buildWasteInput, buildWasteItem } from './test-helpers.js'
import { PAT_STATUS } from './status.js'
import * as logger from '../../common/helpers/logging/logger.js'

describe('runProductionApprovalTests', () => {
  it('returns one positional result per payload item', () => {
    const results = runProductionApprovalTests([
      {
        scenarioId: 'R01',
        wasteTrackingId: 'wt-1',
        wasteInput: buildWasteInput({ wasteItems: [buildWasteItem()] })
      },
      {
        scenarioId: 'R02',
        wasteTrackingId: 'wt-2',
        wasteInput: buildWasteInput({
          wasteItems: [buildWasteItem(), buildWasteItem()]
        })
      }
    ])

    expect(results).toEqual([
      {
        scenarioId: 'R01',
        wasteTrackingId: 'wt-1',
        status: PAT_STATUS.PASS,
        message: ''
      },
      {
        scenarioId: 'R02',
        wasteTrackingId: 'wt-2',
        status: PAT_STATUS.PASS,
        message: ''
      }
    ])
  })

  it('continues running tests after one fails and returns mixed results', () => {
    const results = runProductionApprovalTests([
      {
        scenarioId: 'R01',
        wasteTrackingId: 'wt-pass',
        wasteInput: buildWasteInput({ wasteItems: [buildWasteItem()] })
      },
      {
        scenarioId: 'R01',
        wasteTrackingId: 'wt-fail',
        wasteInput: buildWasteInput({
          wasteItems: [buildWasteItem(), buildWasteItem()]
        })
      },
      {
        scenarioId: 'R02',
        wasteTrackingId: 'wt-pass-2',
        wasteInput: buildWasteInput({
          wasteItems: [buildWasteItem(), buildWasteItem()]
        })
      }
    ])

    expect(results.map((r) => r.status)).toEqual([
      PAT_STATUS.PASS,
      PAT_STATUS.FAIL,
      PAT_STATUS.PASS
    ])
    expect(results[1].message).toContain('Expected exactly 1 waste item')
  })

  it('returns Error status for an unsupported scenarioId', () => {
    const [result] = runProductionApprovalTests([
      {
        scenarioId: 'R99',
        wasteTrackingId: 'wt-1',
        wasteInput: buildWasteInput()
      }
    ])

    expect(result).toEqual({
      scenarioId: 'R99',
      wasteTrackingId: 'wt-1',
      status: PAT_STATUS.ERROR,
      message: 'Unsupported scenarioId: R99'
    })
  })

  it('catches and reports thrown errors as Error status', () => {
    const errorLoggerSpy = jest
      .spyOn(logger.createLogger(), 'error')
      .mockImplementation(() => {})

    const wasteInput = {
      receipt: {
        get movement() {
          throw new Error('boom')
        }
      }
    }

    const [result] = runProductionApprovalTests([
      { scenarioId: 'R01', wasteTrackingId: 'wt-broken', wasteInput }
    ])

    expect(result).toEqual({
      scenarioId: 'R01',
      wasteTrackingId: 'wt-broken',
      status: PAT_STATUS.ERROR,
      message: 'boom'
    })
    expect(errorLoggerSpy).toHaveBeenCalledTimes(1)
    errorLoggerSpy.mockRestore()
  })
})
