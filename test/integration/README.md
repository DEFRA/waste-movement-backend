# Internal HTTP integration tests

An in-repo suite that exercises `waste-movement-backend` **in isolation over real HTTP** — a real socket, a real listener, real Hapi lifecycle, real MongoDB with transactions. Nothing in the request/response path is mocked.

Runs locally (`npm run test:integration`) and in CI, with no Docker and no secrets.

## Why this tier exists

The repo has two other tiers, and neither covers this:

1. **Unit/route tests** (`src/**/*.test.js`) — use `server.inject()`. Faithful to the Hapi lifecycle, but no socket, no wire-level header parsing, and awkward to reach payload-parse failures.
2. **Cross-repo UAT suite** — `.github/workflows/check-pull-request.yml` boots the full `compose.yml` stack and runs `DEFRA/digital-waste-tracking-uat` against it. Real HTTP, but needs ~15 secrets, the whole sibling stack, ZAP and Allure. Not runnable locally on a whim.

This tier sits between them: real sockets, single service, seconds not minutes.

## Isolation boundary

| Concern                                             | Real or stubbed                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Inbound HTTP                                        | **Real** — native `fetch()` to `127.0.0.1:<ephemeral>`                                                                       |
| Server assembly                                     | **Real** — actual `createServer()` from `src/server.js`, plus `server.start()`                                               |
| Auth, Joi validation, RFC9457 plugin, error handler | **Real**                                                                                                                     |
| MongoDB                                             | **Real** — in-memory replica set; transactions work                                                                          |
| Audit logging                                       | **Real** — `@defra/cdp-auditing` only writes pino to stdout, no network                                                      |
| `waste-tracking-id-backend` `GET /next`             | **Stubbed** — a real local Hapi server on an ephemeral port, injected per-suite via `startTestService({ wasteTrackingUrl })` |

No `jest.mock` anywhere in the suite. The single external dependency is replaced by a real HTTP server we control, which doubles as the lever for forcing 5xx without mocking the service under test.

## Running it

```
npm run test:integration
```

This runs `jest --config jest.integration.config.js --runInBand`. `--runInBand` is **mandatory**: the in-memory MongoDB replica set binds a fixed port (`17017`, set by `@defra/waste-movement-utils`'s test factory), so test files cannot run concurrently. The waste-tracking stub itself binds an ephemeral port and imposes no such constraint on its own.

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
│   ├── expect-problem-response.js  shared assertion for RFC9457 error responses
│   ├── expect-response-body-has-shape.js  shared assertion for SUCCESS/ERROR/VALIDATION-ERROR body shapes
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

Registered as a Jest `setupFiles` entry so it runs before any test module is imported. It sets `WASTE_TRACKING_SERVICE_URL` to an unreachable default (`http://127.0.0.1:1`, a privileged port nothing listens on) — a safety net so suites that never call `startTestService({ wasteTrackingUrl })` can't accidentally hit a real service. Suites that do exercise waste-tracking-id-backend override this per-suite instead: `http-client.js` resolves `config.get('services.wasteTracking')` lazily on every request rather than at module load, so there's no import-ordering constraint to work around here.

It also deletes `HTTP_PROXY`/`http_proxy` — otherwise `setupProxy()` installs a global undici dispatcher and the suite's own `fetch()` calls to localhost get proxied into the void on any dev machine with a proxy configured in its shell — and sets `LOG_ENABLED=false`, `CDP_AUDIT_ENABLED=false` to keep test output readable.

### `helpers/test-service.js`

`startTestService({ wasteTrackingUrl })` boots the real service in this order: spins up an in-memory MongoDB replica set (via `createTestMongoDb(true)`, so transactions work), points `config` at it (`readPreference: 'primary'`, since a 1-node replica set can't serve `secondary` reads), sets `orgApiCodes`, `host: '127.0.0.1'`, `port: 0` and — when passed — `services.wasteTracking` to the stub's URL, then calls the real `createServer()` and `server.start()`. Returns `{ baseUrl, server, db, stop() }` — `baseUrl` uses `127.0.0.1` rather than `server.info.uri`, which reports the unfetchable `0.0.0.0`. Suites that never call the waste-tracking-id-backend client can omit `wasteTrackingUrl` and rely on `setup-env.js`'s unreachable default.

### `helpers/waste-tracking-stub.js`

A real Hapi server standing in for `waste-tracking-id-backend`, bound to an ephemeral port. Exposes `GET /next` (returns a freshly generated waste tracking ID), a `baseUrl` getter (throws if read before `start()`), and `respondWith({ statusCode })` to force every subsequent call to fail — the mechanism `dependency-failures.test.js` uses to prove failures propagate as real HTTP errors. A `stop()` followed by `start()` rebinds the _same_ port rather than picking a new one, since the service under test was already configured with the original `baseUrl`.

### `helpers/http.js`

A deliberately dumb `fetch` wrapper: adds the Basic auth header, sends what it's given, returns `{ status, headers, body }` — no retries, no unwrapping. `body` may be an object (JSON-stringified and sent as `application/json`) or a raw string sent as-is with no content-type, so malformed JSON can be sent on purpose with an explicit `content-type` header (see `errors.test.js`). Bodyless requests send no content-type. `x-cdp-request-id` is only sent when a `requestId` option is passed, so server-side request-ID generation can be tested. Error responses only carry a request ID when one was sent, so error-path tests pass `requestId`.

### `helpers/expect-standard-headers.js`

One shared `expectStandardHeaders(headers)` so exact header values (`strict-transport-security`, `x-frame-options`, `x-xss-protection`, `x-content-type-options`, `x-download-options`, content-type) live in exactly one place, captured from a real running instance. `content-type` is matched exactly and defaults to `application/json; charset=utf-8`; pass `{ contentType: 'application/problem+json' }` for RFC9457 error responses or `{ contentType: null }` for responses without a body.

### `helpers/expect-response-body-has-shape.js`

`expectResponseBodyHasCorrectShape({ body, shape })` asserts a response body matches one of three shapes: `'SUCCESS'` (has `data`, plus a `validation` object — this API always returns a validation container, even on success), `'ERROR'` (RFC9457 fields plus `requestId`), or `'VALIDATION-ERROR'` (the same, plus an `errors` array). Used directly for success-path assertions and internally by `expectProblemResponse` for error paths.

### `helpers/expect-problem-response.js`

`expectProblemResponse(response, { status, type, instance, shape })` is the single assertion for RFC9457 error responses: checks status, `content-type: application/problem+json`, that `x-request-id` is present, delegates to `expectResponseBodyHasCorrectShape` for the body (defaulting to `shape: 'ERROR'`), and checks `title`/`type`/`instance` — deriving `title` from the `type` slug (e.g. `'bad-request'` → `'Bad Request'`) so callers only specify the slug once. It doesn't check the full security-header set; pair it with `expectStandardHeaders` where that also needs asserting.

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

Every endpoint test asserts status, then either calls `expectStandardHeaders` directly (success paths, and the dedicated header cases in `beta-endpoint-tests.js`) or goes through `expectProblemResponse` (error paths), which checks content-type and `x-request-id` but not the full security-header set.

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
