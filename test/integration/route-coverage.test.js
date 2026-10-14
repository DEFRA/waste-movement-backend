import { expect, describe, beforeAll, afterAll, it } from '@jest/globals'
import { startTestService } from './helpers/test-service.js'
import { expectedRoutes } from './expected-routes.js'

function byMethodThenPath(a, b) {
  return a.method === b.method
    ? a.path.localeCompare(b.path)
    : a.method.localeCompare(b.method)
}

describe('route coverage', () => {
  let testService

  beforeAll(async () => {
    testService = await startTestService()
  })

  afterAll(async () => {
    await testService.stop()
  })

  it('registers exactly the declared set of routes', () => {
    // This guard is only for the router/router-beta-* application routes
    // declared in src/plugins/router.js, not routes other plugins register.
    const actualRoutes = testService.server
      .table()
      .filter(({ realm }) => realm.plugin?.startsWith('router'))
      .map(({ method, path }) => ({ method, path }))
      .sort(byMethodThenPath)

    expect(actualRoutes).toEqual([...expectedRoutes].sort(byMethodThenPath))
  })
})
