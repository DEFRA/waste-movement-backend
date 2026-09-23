import { expect } from '@jest/globals'

// Exact values captured from a real running instance (Hapi 21, the security
// config at src/server.js:35-44). Keep this the one place they're asserted.
export function expectStandardHeaders(headers) {
  expect(headers.get('strict-transport-security')).toEqual(
    'max-age=31536000; includeSubDomains'
  )
  expect(headers.get('x-frame-options')).toEqual('DENY')
  expect(headers.get('x-xss-protection')).toEqual('1; mode=block')
  expect(headers.get('x-content-type-options')).toEqual('nosniff')
  expect(headers.get('x-download-options')).toEqual('noopen')

  // application/json for plain endpoints, application/problem+json for the
  // RFC9457-formatted /beta-1 error responses.
  const contentType = headers.get('content-type')
  if (contentType) {
    expect(contentType).toContain('json')
  }
}
