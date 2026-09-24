import { expect } from '@jest/globals'

export function expectResponseBodyHasCorrectShape({
  body = {},
  shape = 'SUCCESS' | 'ERROR' | 'VALIDATION-ERROR'
}) {
  switch (shape) {
    case 'SUCCESS':
      expect(body).toMatchObject({
        data: expect.any(Object),
        validation: expect.any(Object)
      })
      break

    case 'ERROR':
      expect(body).toMatchObject({
        title: expect.any(String),
        type: expect.any(String),
        instance: expect.any(String),
        detail: expect.any(String),
        requestId: expect.any(String)
      })
      break

    case 'VALIDATION-ERROR':
      expect(body).toMatchObject({
        title: expect.any(String),
        type: expect.any(String),
        instance: expect.any(String),
        detail: expect.any(String),
        requestId: expect.any(String),
        errors: expect.any(Array)
      })
      break

    default:
      expect(body).toBeDefined()
  }
}
