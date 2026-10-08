# Schemathesis contract tests (beta-2)

[Schemathesis](https://schemathesis.readthedocs.io/) generates requests from
`src/schemas/beta-2/openapi.json` and checks this service's responses against
it: no 5xx, documented status codes and content types, response bodies that
match their schemas, invalid input rejected and valid input accepted.

Everything runs in Docker (`compose.schemathesis.yml`), so you need neither
Python nor secrets. The stack has MongoDB, `waste-tracking-id-backend`, this
service built from the `production` Dockerfile target, and a pinned
Schemathesis image.

## Running locally

```bash
npm run test:schemathesis
```

This builds and starts the stack, runs Schemathesis, then tears the stack down.
The exit code is non-zero if any check fails. Reports go to
`test/schemathesis/out/reports/` (gitignored):

- `junit.xml`
- `schema-coverage.html`: which parameters, keywords and status codes were
  exercised.

Arguments after `--` are passed to `schemathesis run`:

```bash
npm run test:schemathesis -- -n 200                        # more examples per operation
npm run test:schemathesis -- --include-operation-id recordDelivery
npm run test:schemathesis -- --phases fuzzing --seed 123
```

To keep the stack up between runs, set `KEEP_STACK=1`. The backend is then also
on `localhost:3012`. To re-run only the tests:

```bash
docker compose -f compose.schemathesis.yml run --rm schemathesis
```

## How it's wired

- **The spec is bundled first.** The one-shot `bundle` service runs
  `scripts/bundle-openapi.js`, which dereferences `openapi.json` and every file
  it `$ref`s into `test/schemathesis/out/spec/openapi.json`. This is the same
  approach as `digital-waste-tracking-api-docs`' `bundle-specs.js`. Schemathesis
  tests that bundled file, because the coverage report (TraceCov) doesn't
  follow `$ref`s into other files: against the split spec it only saw the two
  path parameters.
- **Auth.** The spec describes the external API's auth: a Cognito bearer token
  plus `x-api-code`. This service sits behind the external API, so
  `schemathesis.toml` instead sends Basic Auth and the `x-dwt-organisation-id`
  header that the external API would forward. It also turns off generation of
  the spec's security parameters.
- **`x-cdp-request-id`.** This is sent on every request, as the external API
  does. Problem+json responses take their required `requestId` from it, and
  their `x-request-id` header, which the spec marks as required on every
  response. Without it, error responses carry neither, and Schemathesis fails
  them.
- **Example data is seeded.** Before the run, the `seed` service
  (`seed.js`) reads the create-movement and record-delivery _response_ examples
  and inserts the records they describe (movements `25HRA0B2`/`25HRA0B3`,
  delivery `25KMT4Z9`). The spec gives the same IDs as the `example` of the
  `{movementId}` and `{deliveryId}` path parameters, and Schemathesis uses them
  for most requests, so collection and receipt reach the real logic. Other
  generated IDs still exercise the 404 responses. If you change an example ID,
  change the parameter `example` in `openapi.json` to match.
- **Relaxed checks.** Each one has a comment in `schemathesis.toml`:
  - `unsupported_method`: Hapi answers unrouted methods with 404, not 405.
  - `recordDelivery` allows 400 for schema-valid requests, because generated
    `movementIds` don't exist.
- **Random seed.** The random seed is fixed (`seed = 42`) so CI runs are reproducible. Pass
  `--seed` to explore further.

## CI

The `schemathesis` job in `.github/workflows/check-pull-request.yml` runs the
same script. On each pull request it:

- posts a single PR comment and updates it on every push. The comment shows
  the pass/fail status, a link to the workflow run and reports, the
  Schemathesis output (failures, warnings and summary, collapsed), and the
  schema-coverage table.
- publishes the coverage table to the job summary.
- uploads `test/schemathesis/out/reports/`, including the full
  `schemathesis.log`, as the `schemathesis-report` artifact.

On PRs from forks the token is read-only, so the comment can't be posted. That
step is marked `continue-on-error`, so the job still passes or fails on the
test results alone.

## Stateful testing

The spec's OpenAPI `links` describe how IDs flow between operations:

- `createMovement` links to `recordCollection` and `recordDelivery`.
- `recordDelivery` links to `recordReceipt`.

In the stateful phase, Schemathesis follows these links. It chains real calls,
for example create a movement, record a delivery for it, then record the
receipt. Every step uses IDs the server just created.

## Known gaps

The coverage report under-counts `POST /movements`. TraceCov prints
"Matched value does not exist in `enum`" errors and drops some batches of
results for that operation, so the recorded traffic (`--report har`) shows
more 201s than the report does.

The report's "Examples" column only counts an `example` inside a
parameter's `schema`. Named body examples and our parameter examples are sent
(you can see them in the HAR), but they aren't counted.

`POST /deliveries` takes its movement IDs in the request body, so the
parameter examples don't help it. Outside the stateful phase, generated
requests use random IDs and get a 400. That's why `recordDelivery` keeps its exception
in `schemathesis.toml`, and why Schemathesis reports a "schema validation
mismatch" warning for it.
