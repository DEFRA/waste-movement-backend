# Internal HTTP Integration Tests

**Date:** 2026-09-16
**Status:** Planned

## Goal

Add an in-repo integration suite that exercises `waste-movement-backend` **in isolation over real HTTP** — a real socket, a real listener, real Hapi lifecycle, real MongoDB with transactions. Nothing in the request/response path is mocked.

Runs locally (`npm run test:integration`) and in CI, with no Docker and no secrets.

## Why this is a new tier

The repo already has two tiers, and neither covers this:

1. **Unit/route tests** (`src/**/*.test.js`) — use `server.inject()`. Faithful to the Hapi lifecycle, but no socket, no wire-level header parsing, and awkward to reach payload-parse failures.
2. **Cross-repo UAT suite** — `.github/workflows/check-pull-request.yml:44-147` boots the full `compose.yml` stack and runs `DEFRA/digital-waste-tracking-uat` against it. Real HTTP, but needs ~15 secrets, the whole sibling stack, ZAP and Allure. Not runnable locally on a whim.

This tier sits between them: real sockets, single service, seconds not minutes.

## Isolation boundary

| Concern | Real or stubbed |
|---|---|
| Inbound HTTP | **Real** — native `fetch()` to `127.0.0.1:<ephemeral>` |
| Server assembly | **Real** — actual `createServer()` from `src/server.js`, plus `server.start()` |
| Auth, Joi validation, RFC9457 plugin, error handler | **Real** |
| MongoDB | **Real** — in-memory replica set; transactions work |
| Audit logging | **Real** — `@defra/cdp-auditing` only writes pino to stdout, no network |
| `waste-tracking-id-backend` `GET /next` | **Stubbed** — as a real local Hapi server, injected via `WASTE_TRACKING_SERVICE_URL` |

No `jest.mock` anywhere in the suite. The single external dependency is replaced by a real HTTP server we control, which doubles as the lever for forcing 5xx without mocking the service under test.

## Prerequisite

`node_modules` is stale: it has `@defra/waste-movement-utils@1.4.0` but `package.json` pins `1.9.0`, so `formatErrorToRFC9457Response` (imported at `src/server.js:19`) is missing and the server will not boot.

- [ ] Run `nvm use && npm ci`, and confirm `formatErrorToRFC9457Response` is exported by the installed package

## Implementation steps

### 1. Harness — `test/integration/helpers/`

- [ ] **`setup-env.js`** (registered as Jest `setupFiles`, so it runs *before any test module is imported*)
  - Set `WASTE_TRACKING_SERVICE_URL` to the stub address (default `http://127.0.0.1:3999`, env-overridable).
    **Ordering is load-bearing:** `src/common/helpers/http-client.js:154` builds `httpClients` at module-load time from `config.get('services.wasteTracking')`. Setting this in a `beforeAll` is too late.
    (Verified: the env var *does* win over the `overrideConfig` block at `src/config.js:189-193` — convict env precedence beats `.load()`.)
  - Set `ACCESS_CRED_TEST1` from `src/test/data/basic-auth.js`
  - **Delete `HTTP_PROXY`** — otherwise `setupProxy()` (`src/common/helpers/proxy/setup-proxy.js:20`) installs a global undici dispatcher and the suite's own `fetch()` to localhost gets proxied into the void on any dev machine with a proxy in its shell
  - Set `LOG_ENABLED=false`, `CDP_AUDIT_ENABLED=false` to keep output readable

- [ ] **`waste-tracking-stub.js`** — a real Hapi server on the fixed stub port
  - `GET /next` → `{ wasteTrackingId }`
  - `stub.respondWith({ statusCode })` to force failures
  - `start()` / `stop()`

- [ ] **`test-service.js`** — `startTestService()`, in this order:
  1. `createTestMongoDb(true)` → in-memory replica set (transactions)
  2. `config.set('mongo.uri', mongoUri)` and `config.set('mongo.readPreference', 'primary')`
     Required: the factory does not write back to config, and a 1-node replica set cannot serve `secondary` reads (the schema default). Mirrors `src/routes/update-bulk-receipt-movement.test.js:97-104`.
  3. `config.set('orgApiCodes', base64EncodedOrgApiCodes)`, `config.set('host', '127.0.0.1')`, `config.set('port', 0)`
  4. `createServer()`, then `server.start()`
  - Returns `{ baseUrl: \`http://127.0.0.1:${server.info.port}\`, server, db, stop() }`
  - Ephemeral port avoids collisions; `127.0.0.1` avoids the unfetchable `0.0.0.0` in `server.info.uri`

- [ ] **`http.js`** — a deliberately dumb `fetch` wrapper: adds the Basic auth header, returns `{ status, headers, body }`. No retries, no unwrapping — what is asserted is what crossed the socket.

- [ ] **`expect-standard-headers.js`** — one shared `expectStandardHeaders(res)`, so exact header values live in exactly one place: `content-type`, plus the security headers configured at `src/server.js:41-51` (`strict-transport-security`, `x-content-type-options`, `x-frame-options`).
  Capture the **actual** emitted values during implementation rather than assuming what Hapi 21 sends for `xss: 'enabled'`.

### 2. Jest config and scripts

- [ ] **`jest.integration.config.js`**
  - `testMatch: ['<rootDir>/test/integration/**/*.test.js']`
  - `setupFiles: ['<rootDir>/test/integration/helpers/setup-env.js']`
  - `testTimeout: 30000` — replica set plus server start exceeds the 5 s default
  - `transform: { '^.+\\.js$': 'babel-jest' }` and `transformIgnorePatterns` **copied** from `jest.config.js` (ESM-only deps). Deliberate duplication: factoring out a shared base config would couple the two suites for one array.
  - `collectCoverage: false`
  - **Do not use the `@shelf/jest-mongodb` preset.** `createTestMongoDb(true)` spins its own replica set and we overwrite `config.set('mongo.uri', ...)`, so the preset's instance would be a second, unused Mongo — pure startup cost.

- [ ] **`package.json`** — add:
  ```
  "test:integration": "node --no-experimental-require-module ./node_modules/jest/bin/jest.js --config jest.integration.config.js --runInBand"
  ```
  The `--no-experimental-require-module` flag matches the existing `test` script. `--runInBand` is **mandatory**: both the replica set (port `17017`) and the stub bind fixed ports.

- [ ] Confirm `jest.config.js` needs **no change** — its `testMatch` is `**/src/**/*.test.js` and `collectCoverageFrom` is `src/**/*.js`, so a top-level `test/` directory is already invisible to `npm test` and to coverage.

### 3. Test files

Style: **one explicit named `it()` per endpoint** (chosen over a table-driven sweep). Split by failure isolation, not by route.

- [ ] **`health.test.js`** — `GET /health` (the only `auth: false` route)
- [ ] **`movements.test.js`**
  - `POST /movements/{wasteTrackingId}/receive`
  - `PUT /movements/{wasteTrackingId}/receive`
  - `POST /movements/retry-audit-log`
  - `GET /qa-non-prod/movements`
- [ ] **`bulk-movements.test.js`**
  - `POST /bulk/{bulkId}/movements/receive`
  - `PUT /bulk/{bulkId}/movements/receive`
- [ ] **`beta-1.test.js`**
  - `POST /beta-1/movements`
  - `POST /beta-1/movements/{movementId}/collection`
  - `POST /beta-1/deliveries`
  - `POST /beta-1/deliveries/{deliveryId}/receipt`
  - `POST /beta-1/receipts`
- [ ] **`production-approval-tests.test.js`** — `POST /production-approval-tests`
- [ ] **`errors.test.js`**
  - **401** — no `Authorization` header on a protected route (proves `basicAuth` parses a real wire header)
  - **400** — invalid payload; assert the `validation.errors[]` shape (key / errorType / message)
  - **400** — **malformed JSON**: send a raw `'{'` body and assert `formatPayloadParseError` (`src/plugins/error-handler.js:6-17`) fires. This path is genuinely awkward to reach via `server.inject`, so it is real new signal rather than a re-test.
  - **404** — unknown path
  - **Org mismatch** — `errorType: 'BusinessRuleViolation'`
- [ ] **`dependency-failures.test.js`** (isolated — it breaks shared state)
  - `stub.respondWith({ statusCode: 500 })` on `GET /next`, propagating through bulk create and the beta-1 paths
  - **Known cost:** `makeRequest` retries 3× with a **hardcoded** 1000 ms delay (`src/common/helpers/http-client.js:11-13`), and route handlers add `backOff` on top — roughly 3-4 s per case. Keep to one or two cases rather than making retry delays configurable purely for tests.

Every endpoint test asserts status **and** calls `expectStandardHeaders(res)`.

Reuse existing fixtures — do not add new ones:
- `src/schemas/test-helpers/waste-test-helpers.js` (`createTestPayload`)
- `src/test/utils/createMovementRequest.js`, `src/test/utils/createBulkMovementRequest.js`
- `src/test/data/basic-auth.js`, `src/test/data/apiCodes.js`

Note `ENVIRONMENT` defaults to `local` (`src/config.js`), so the non-prod routes (`/qa-non-prod/movements`, `/production-approval-tests`) register without extra configuration.

### 4. Route-coverage guard

- [ ] **`test/integration/expected-routes.js`** — a declared list of `method + path`
- [ ] **`route-coverage.test.js`** — read `server.table()`, map to `method + path`, assert it equals the declared list

This closes the one real risk of explicit per-endpoint tests (a new route landing untested) without the readability cost of a table-driven suite: a new route fails this test until someone consciously adds it.

### 5. CI

- [ ] Append `npm run test:integration` to the existing `pr-validator` job in `.github/workflows/check-pull-request.yml`, after `npm test`.
  No secrets, no Docker, no new job — and well clear of the heavyweight `integration-tests` job.
- [ ] Do **not** add it to the husky pre-commit hook; that stays `format:check` + `lint`.
- [ ] Confirm Sonar is unaffected — the integration config collects no coverage, so the existing report is unchanged.

### 6. Verify

- [ ] `npm run test:integration` passes locally from a clean `npm ci`
- [ ] `npm test` still passes and its coverage numbers are unchanged
- [ ] `npm run format:check` and `npm run lint` pass on the new files
- [ ] Deliberately break a route (e.g. change a status code) and confirm the suite fails — proves it is actually exercising the service

## Out of scope

- Testing the Docker image or real env-var injection — already covered by the compose-based `integration-tests` CI job
- Post-deploy smoke tests against CDP environments (would need secrets and network access)
- Changes to the cross-repo `digital-waste-tracking-uat` suite
- Making `http-client.js` retry delays configurable
