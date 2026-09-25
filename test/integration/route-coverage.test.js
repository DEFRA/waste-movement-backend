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
    // hapi-swagger/vision/inert register their own documentation routes
    // (/swagger.json, /swaggerui*, ...) under the 'hapi-swagger' realm -
    // out of scope here, this guard is only for the router/router-beta-1
    // application routes declared in src/plugins/router.js.
    const actualRoutes = testService.server
      .table()
      .filter(({ realm }) => realm.plugin?.startsWith('router'))
      .map(({ method, path }) => ({ method, path }))
      .sort(byMethodThenPath)

    expect(actualRoutes).toEqual([...expectedRoutes].sort(byMethodThenPath))
  })
})
