# Internal HTTP integration tests

An in-repo suite that exercises `waste-movement-backend` **in isolation over real HTTP** — a real socket, a real listener, real Hapi lifecycle, real MongoDB with transactions. Nothing in the request/response path is mocked.

Runs locally (`npm run test:integration`) and in CI, with no Docker and no secrets.

## Why this tier exists

The repo has two other tiers, and neither covers this:

1. **Unit/route tests** (`src/**/*.test.js`) — use `server.inject()`. Faithful to the Hapi lifecycle, but no socket, no wire-level header parsing, and awkward to reach payload-parse failures.
2. **Cross-repo UAT suite** — `.github/workflows/check-pull-request.yml` boots the full `compose.yml` stack and runs `DEFRA/digital-waste-tracking-uat` against it. Real HTTP, but needs ~15 secrets, the whole sibling stack, ZAP and Allure. Not runnable locally on a whim.

This tier sits between them: real sockets, single service, seconds not minutes.

## Isolation boundary

| Concern                                             | Real or stubbed                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Inbound HTTP                                        | **Real** — native `fetch()` to `127.0.0.1:<ephemeral>`                            |
| Server assembly                                     | **Real** — actual `createServer()` from `src/server.js`, plus `server.start()`    |
| Auth, Joi validation, RFC9457 plugin, error handler | **Real**                                                                          |
| MongoDB                                             | **Real** — in-memory replica set; transactions work                               |
| Audit logging                                       | **Real** — `@defra/cdp-auditing` only writes pino to stdout, no network           |
| `waste-tracking-id-backend` `GET /next`             | **Stubbed** — a real local Hapi server, injected via `WASTE_TRACKING_SERVICE_URL` |

No `jest.mock` anywhere in the suite. The single external dependency is replaced by a real HTTP server we control, which doubles as the lever for forcing 5xx without mocking the service under test.

## Running it

```
npm run test:integration
```

This runs `jest --config jest.integration.config.js --runInBand`. `--runInBand` is **mandatory**: the in-memory replica set and the waste-tracking stub both bind fixed ports, so test files cannot run concurrently.

`jest.config.js` (the unit suite) only matches `src/**/*.test.js` and only collects coverage from `src/**/*.js`, so this `test/` directory is invisible to `npm test` and to the coverage report.

CI runs it as part of the `pr-validator` job in `.github/workflows/check-pull-request.yml`, straight after `npm test`. No secrets or Docker needed.

## Layout

```
test/integration/
├── helpers/
│   ├── setup-env.js              Jest `setupFiles` entry — runs before any test module is imported
│   ├── test-service.js           startTestService(): boots real Mongo + real Hapi server on an ephemeral port
│   ├── waste-tracking-stub.js    stand-in for waste-tracking-id-backend's GET /next
│   ├── http.js                   deliberately dumb fetch wrapper (adds Basic auth, no retries/unwrapping)
│   ├── expect-standard-headers.js  shared assertion for security/content-type headers
│   ├── beta-endpoint-tests.js    shared describeBetaEndpointTests() suite, parameterised by beta version
│   └── problem-types.js          RFC9457 `type` URI base
├── expected-routes.js            declared method+path list used by route-coverage.test.js
├── health.test.js
├── movements.test.js
├── bulk-movements.test.js
├── beta-1.test.js
├── beta-2.test.js
├── production-approval-tests.test.js
├── errors.test.js
├── dependency-failures.test.js   isolated — forces failures in the stub, mutates shared process state
└── route-coverage.test.js
```

### `helpers/setup-env.js`

Registered as a Jest `setupFiles` entry so it runs before any test module (and therefore before `src/config.js`) is imported. This ordering is load-bearing: `src/common/helpers/http-client.js` builds its `httpClients` singleton at module-load time from `config.get('services.wasteTracking')`, so setting `WASTE_TRACKING_SERVICE_URL` in a `beforeAll` would be too late.

It also deletes `HTTP_PROXY`/`http_proxy` — otherwise `setupProxy()` installs a global undici dispatcher and the suite's own `fetch()` calls to localhost get proxied into the void on any dev machine with a proxy configured in its shell — and sets `LOG_ENABLED=false`, `CDP_AUDIT_ENABLED=false` to keep test output readable.

### `helpers/test-service.js`

`startTestService()` boots the real service in this order: spins up an in-memory MongoDB replica set (via `createTestMongoDb(true)`, so transactions work), points `config` at it (`readPreference: 'primary'`, since a 1-node replica set can't serve `secondary` reads), sets `orgApiCodes`, `host: '127.0.0.1'` and `port: 0`, then calls the real `createServer()` and `server.start()`. Returns `{ baseUrl, server, db, stop() }` — `baseUrl` uses `127.0.0.1` rather than `server.info.uri`, which reports the unfetchable `0.0.0.0`.

### `helpers/waste-tracking-stub.js`

A real Hapi server standing in for `waste-tracking-id-backend`. Exposes `GET /next` (returns a freshly generated waste tracking ID) and `respondWith({ statusCode })` to force every subsequent call to fail — the mechanism `dependency-failures.test.js` uses to prove failures propagate as real HTTP errors.

### `helpers/http.js`

A deliberately dumb `fetch` wrapper: adds the Basic auth header, sends what it's given, returns `{ status, headers, body }` — no retries, no unwrapping. `body` may be an object (JSON-stringified) or a raw string, so malformed JSON can be sent on purpose (see `errors.test.js`).

### `helpers/expect-standard-headers.js`

One shared `expectStandardHeaders(headers)` so exact header values (`strict-transport-security`, `x-frame-options`, `x-xss-protection`, `x-content-type-options`, `x-download-options`, content-type) live in exactly one place, captured from a real running instance.

## Test files

Style: one explicit named `it()` per endpoint (chosen over a table-driven sweep), split by failure isolation rather than by route.

- **`health.test.js`** — `GET /health`, the only `auth: false` route.
- **`movements.test.js`** — `POST`/`PUT /movements/{wasteTrackingId}/receive`, `POST /movements/retry-audit-log`, `GET /qa-non-prod/movements`.
- **`bulk-movements.test.js`** — `POST`/`PUT /bulk/{bulkId}/movements/receive`.
- **`beta-1.test.js`** / **`beta-2.test.js`** — endpoint-specific cases for each beta version, plus the shared cross-cutting suite from `helpers/beta-endpoint-tests.js` (RFC9457 formatting, content negotiation, request tracing, standard headers, missing required fields) parameterised per version.
- **`production-approval-tests.test.js`** — `POST /production-approval-tests`.
- **`errors.test.js`** — 401 (missing `Authorization` header), 400 with the `validation.errors[]` shape, 400 for malformed JSON (`formatPayloadParseError`), 404 for an unknown path, and a `BusinessRuleViolation` when the submitting organisation doesn't match the original record.
- **`dependency-failures.test.js`** (isolated — it mutates shared stub state) — forces `GET /next` to fail (500, then unreachable) and asserts the failure surfaces as a real HTTP error rather than being silently swallowed. Known cost: `makeRequest`'s retries plus route-level `backOff` mean each case takes several seconds, which is why this stays to two cases.
- **`route-coverage.test.js`** — reads `server.table()`, filters to the `router`/`router-beta-*` realms (excluding `hapi-swagger`'s own doc routes) and asserts it equals the declared list in `expected-routes.js`. A new route fails this test until someone consciously adds it to that list, closing the one real risk of the explicit per-endpoint style used above.

Every endpoint test asserts status **and** calls `expectStandardHeaders(headers)`.

Tests reuse existing fixtures rather than adding new ones — notably `src/schemas/test-helpers/waste-test-helpers.js` (`createTestPayload`), `src/test/utils/createMovementRequest.js`, `src/test/utils/createBulkMovementRequest.js`, and `src/test/data/basic-auth.js` / `apiCodes.js`.

Note `ENVIRONMENT` defaults to `local` (`src/config.js`), so the non-prod routes (`/qa-non-prod/movements`, `/production-approval-tests`) register without extra configuration.

## Adding a new route or endpoint version

1. Add the test file (or extend an existing one) under `test/integration/`, following the one-`it()`-per-case style above.
2. If it's a new beta version, add `beta-N.test.js` and call `describeBetaEndpointTests('beta-N', ...)` from `helpers/beta-endpoint-tests.js` to get the shared cross-cutting cases for free.
3. Add the route's `{ method, path }` to `expected-routes.js` — `route-coverage.test.js` will fail otherwise.

## Out of scope

- Testing the Docker image or real env-var injection — already covered by the compose-based `integration-tests` CI job.
- Post-deploy smoke tests against CDP environments (would need secrets and network access).
- The cross-repo `digital-waste-tracking-uat` suite.
- Making `http-client.js` retry delays configurable purely for tests.
