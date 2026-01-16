import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { retryAuditLogSchema } from './retry-audit-log.js'

describe('retryAuditLogSchema', () => {
  const traceId = '64a4385a4447a8b1608b5b338d0a3157'
  const wasteTrackingId = generateWasteTrackingId()
  const revision = 1

  it('should accept a payload with traceId', () => {
    const payload = {
      traceId
    }

    const { error } = retryAuditLogSchema.validate(payload)

    expect(error).toBeUndefined()
  })

  it('should accept a payload with wasteTrackingId and revision', () => {
    const payload = {
      wasteTrackingId,
      revision
    }

    const { error } = retryAuditLogSchema.validate(payload)

    expect(error).toBeUndefined()
  })

  it('should reject a missing payload', () => {
    const payload = undefined

    const { error } = retryAuditLogSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"retryAuditLogSchema" is required')
  })

  it.each([undefined, ''])(
    'should reject a payload with "%s" values',
    (value) => {
      const payload = {
        traceId: value,
        wasteTrackingId: value,
        revision: value
      }

      const { error } = retryAuditLogSchema.validate(payload)

      expect(error).toBeDefined()
      expect(error.message).toEqual(
        '"retryAuditLogSchema" must contain at least one of [traceId, wasteTrackingId]'
      )
    }
  )

  it('should reject an empty payload', () => {
    const payload = {}

    const { error } = retryAuditLogSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"retryAuditLogSchema" must contain at least one of [traceId, wasteTrackingId]'
    )
  })

  it('should reject a payload with only wasteTrackingId', () => {
    const payload = {
      wasteTrackingId
    }

    const { error } = retryAuditLogSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"retryAuditLogSchema" contains [wasteTrackingId] without its required peers [revision]'
    )
  })

  it('should reject a payload with only revision', () => {
    const payload = {
      revision
    }

    const { error } = retryAuditLogSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"retryAuditLogSchema" must contain at least one of [traceId, wasteTrackingId]'
    )
  })

  it('should reject a payload with traceId and revision', () => {
    const payload = {
      traceId,
      revision
    }

    const { error } = retryAuditLogSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"retryAuditLogSchema" contains [revision] without its required peers [wasteTrackingId]'
    )
  })

  it('should reject a payload with traceId, wasteTrackingId and revision', () => {
    const payload = {
      traceId,
      wasteTrackingId,
      revision
    }

    const { error } = retryAuditLogSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"retryAuditLogSchema" contains a conflict between exclusive peers [traceId, wasteTrackingId]'
    )
  })

  it.each([12, null])(
    'should return an error when given an invalid value for traceId: "%s"',
    (value) => {
      const payload = {
        traceId: value
      }

      const { error } = retryAuditLogSchema.validate(payload)

      expect(error).toBeDefined()
      expect(error.message).toEqual('"traceId" must be a string')
    }
  )

  it.each([12, null])(
    'should return an error when given an invalid value for wasteTrackingId: "%s"',
    (value) => {
      const payload = {
        wasteTrackingId: value,
        revision
      }

      const { error } = retryAuditLogSchema.validate(payload)

      expect(error).toBeDefined()
      expect(error.message).toEqual('"wasteTrackingId" must be a string')
    }
  )

  it.each(['12', null])(
    'should return an error when given an invalid value for revision: "%s"',
    (value) => {
      const payload = {
        wasteTrackingId,
        revision: value
      }

      const { error } = retryAuditLogSchema.validate(payload)

      expect(error).toBeDefined()
      expect(error.message).toEqual('"revision" must be a number')
    }
  )

  it('should reject a payload when given a revision less than 1', () => {
    const payload = {
      wasteTrackingId,
      revision: 0
    }

    const { error } = retryAuditLogSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"revision" must be a positive number')
  })
})
