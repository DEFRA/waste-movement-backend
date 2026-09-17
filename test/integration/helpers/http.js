import { requestBasicAuthTest1 } from '../../../src/test/data/basic-auth.js'

// Deliberately dumb: adds the Basic auth header, sends what it's given and
// returns exactly what crossed the socket - no retries, no unwrapping.
//
// `body` may be an object (JSON-stringified) or a string (sent as-is, so
// malformed JSON can be exercised on purpose).
export async function httpRequest(
  baseUrl,
  path,
  { method = 'GET', headers = {}, body, auth = true } = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: `Basic ${requestBasicAuthTest1}` } : {}),
      ...headers
    },
    body:
      body === undefined
        ? undefined
        : typeof body === 'string'
          ? body
          : JSON.stringify(body)
  })

  const text = await response.text()
  let parsedBody = null
  if (text) {
    try {
      parsedBody = JSON.parse(text)
    } catch {
      parsedBody = text
    }
  }

  return {
    status: response.status,
    headers: response.headers,
    body: parsedBody
  }
}
