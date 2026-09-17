import { expect } from '@jest/globals'

// Exact values captured from a real running instance (Hapi 21, the security
// config at src/server.js:35-44). Keep this the one place they're asserted.
export function expectStandardHeaders(res) {
  expect(res.headers.get('strict-transport-security')).toEqual(
    'max-age=31536000; includeSubDomains'
  )
  expect(res.headers.get('x-frame-options')).toEqual('DENY')
  expect(res.headers.get('x-xss-protection')).toEqual('1; mode=block')
  expect(res.headers.get('x-content-type-options')).toEqual('nosniff')
  expect(res.headers.get('x-download-options')).toEqual('noopen')

  // application/json for plain endpoints, application/problem+json for the
  // RFC9457-formatted /beta-1 error responses.
  const contentType = res.headers.get('content-type')
  if (contentType) {
    expect(contentType).toContain('json')
  }
}
