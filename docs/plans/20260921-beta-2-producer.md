# beta-2 slice: `producer` on `POST /beta-2/movements`

## Goal

A `beta-2` API slice whose payload validation is driven by **JSON Schema as the source of
truth**, starting with the `producer` resource on `POST /beta-2/movements`. The producer
schemas and tests move out of the `digital-waste-tracking-api-docs` POC into this repo, and
`beta-1` moves onto the same mechanism so the two versions are consistent.

`digital-waste-tracking-api-docs` is the sandbox; once a resource works there it moves here,
and that repo references it from here.

## Decisions

| Decision           | Detail                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source of truth    | JSON Schema, **2020-12** dialect. No Joi anywhere in beta-1 or beta-2                                                                                                                                                    |
| Runtime validation | AJV (`ajv/dist/2020.js`) behind a Hapi custom validation function                                                                                                                                                        |
| Format rules       | Inline `pattern`. No custom formats, no import from `waste-movement-utils`; divergence from Phase-1 rules is accepted                                                                                                    |
| `$id`              | **Equal to the file's path relative to `src/schemas/`** (e.g. `beta-2/common/producer/producer.schema.json`)                                                                                                             |
| Layout             | Schemas under `src/schemas/beta-2/`, **mirroring the docs repo's `common/` · `creation/` · `collection/` · `delivery/` · `receipt/` categories**. Shared AJV harness at `src/schemas/validate/`. Specs under `docs/api/` |
| Unit of work       | **A resource port is schemas + tests together.** A resource is not ported until its tests run green here                                                                                                                 |
| Slice scope        | `apiCode` + required `producer`. Persists `{movementId, orgId, createdAt}` — unchanged from beta-1                                                                                                                       |
| Docs               | hapi-swagger stays for legacy routes; beta routes carry no `movements` tag, so it never sees them. Beta specs are hand-authored OpenAPI 3.1                                                                              |

## Constraints

Facts about the codebase and its dependencies that the design rests on.

- **Hapi accepts a JSON Schema validator directly.** `lib/validation.js:23` returns a
  `function` rule as-is and calls it as the validator (`lib/validation.js:118`). Its return
  value replaces `request.payload`. No `server.validator()` registration needed.
- **hapi-swagger is documentation-only** — it validates nothing. A handler returning a shape
  that contradicts its declared response schema still returns that shape, unmodified.
  Request validation is Hapi core via `validate.payload`; response validation is Hapi core
  via `options.response.status` (used only by `health.js`).
- **hapi-swagger cannot express these schemas.** `OAS: Joi.string().valid('v2','v3.0')`
  (`lib/index.js:49`) caps it at 3.0.0; `lib/properties.js:67` discards anything that is not
  `Joi.isSchema()`; and 3.0.0 has no `const`, `propertyNames`, or boolean-`false`
  subschemas. Fed a non-Joi validator it emits a dangling
  `$ref: "#/components/schemas/Hidden%20Model"`.
- **`routeTag: 'movements'`** (`src/plugins/swagger.js`) filters the generated spec: a route
  without that tag does not appear in `/swagger.json`.
- **hapi-swagger is archived upstream** (`archived: true`, no npm release since 2024-12-10,
  and `17.3.2` is latest). It is retained only for the legacy endpoints — no new use.
- **OpenAPI 3.1 renders in both consumers**: `mkdocs-swagger-ui-tag` 0.8.1 bundles Swagger UI
  5.x, and `waste-tracking-service`'s vendored dist is also 5.x. No Terraform in the
  workspace and no CI workflow references `openapi`, so nothing imports a spec into API
  Gateway (which would require 3.0.x).
- **The POC's `validators.js` has drifted** from `waste-movement-utils` (`\/D\d{4}` vs
  `\/D\d{4,5}`), and utils has no phone validation at all. beta-2 owns its rules
  independently; the patterns in step 2 are authoritative.

## Non-goals

- Do **not** touch the legacy (non-`beta-`) endpoints. They keep Joi validation, their
  `movements` tag, and their `plugins['hapi-swagger']` blocks.
- Do not remove `hapi-swagger`, `@hapi/inert` or `@hapi/vision`.
- Do not persist `producer`.
- Do not implement the RFC9457 `errors` array — handled separately.

---

## Step 1 — AJV harness

`src/schemas/validate/` — **version-neutral, one registry for all beta versions.** It sits
above `beta-2/` rather than inside it because step 4 brings beta-1 onto the same mechanism;
both then share a single AJV instance. Path-based `$id`s are what make that safe.

- `index.js` — a directory-walk loader over `src/schemas/**` for `*.schema.json`, ported from
  the POC. Use `__dirname` rather than `import.meta.url`: `babel.config.cjs` enables
  `babel-plugin-transform-import-meta` only in the `test` env, and the loader must work under
  both. Import **`ajv/dist/2020.js`**, not the default draft-07 build. `addFormats` for
  `email` and `uuid` (`create-movement.schema.json`'s `apiCode` uses `format: "uuid"`); no
  custom format registration. Config `{ allErrors: true, strict: true }` — `allErrors`
  matches the server's `abortEarly: false` (`src/server.js:32`).

  On load, assert each schema's `$id` equals its path relative to `src/schemas/`, so a
  mismatch fails at import time rather than registering under an unexpected key.

- `hapi-validator.js` — the adapter:

  ```js
  export const jsonSchemaValidator = (schemaId) => (value) => {
    if (validate(schemaId, value)) return value
    throw Boom.badRequest('Payload validation failed')
  }
  ```

  Used as:

  ```js
  validate: {
    payload: jsonSchemaValidator('beta-2/creation/create-movement.schema.json')
  }
  ```

- `index.test.js` — registry loads, unknown `$id` throws, `$id`/path mismatch is caught.

**Dependencies:** `ajv@^8` + `ajv-formats@^3`, both **runtime** deps (`dependencies`, not
`devDependencies`) — validation happens at request time. Neither appears on the Defra radar,
but neither do most libraries; the radar governs platform technology, not npm packages.

> ⚠️ **Hoisting trap — `ajv@6` is already present.** `node_modules/ajv` resolves to
> **6.15.0**, pulled in transitively by `eslint`:
>
> ```
> └─┬ eslint@9.39.2
>   ├─┬ @eslint/eslintrc@3.3.7
>   │ └── ajv@6.15.0 deduped
>   └── ajv@6.15.0
> ```
>
> ajv 6 is **draft-07 only and has no `dist/2020.js`**, so
> `import Ajv2020 from 'ajv/dist/2020.js'` fails with `ERR_MODULE_NOT_FOUND` — which reads as
> "the path is wrong" rather than "the wrong ajv is installed". Add `ajv@^8` as an explicit
> direct dependency; npm then gives it the root slot and demotes eslint's copy to
> `node_modules/eslint/node_modules/ajv`. Confirm with
> `node -e "console.log(require('ajv/package.json').version)"` — it must report 8.x.

> **Why `ajv/dist/2020.js` and not the default build.** `ajv`'s default export is a
> **draft-07** validator; `ajv/dist/2020.js` is a **2020-12** one. They are mutually
> exclusive — each throws `no schema with key or ref "<other dialect>"` when fed the other's
> `$schema`. Because the loader compiles everything at import under `strict: true`, a
> mismatch fails at boot, not per request.
>
> 2020-12 is required because **OpenAPI 3.1's default dialect is 2020-12**, which is why 3.1
> was chosen (`const`, `propertyNames`, boolean subschemas). Matching dialects means the
> runtime validator and the published contract are the same artefact, with no reliance on
> consumers honouring a `jsonSchemaDialect` override. It also unlocks
> `unevaluatedProperties`, the natural future replacement for the hand-maintained
> `propertyNames: { enum: [...] }` lists.
>
> None of the keywords these schemas use differ between the dialects — the port is a pure
> `$schema` swap. The same holds for beta-1: its only array is
> `movementIds: { items: { type: 'string' } }`, the single-schema form, identical in both
> dialects (only the tuple form changed to `prefixItems`). `$ref` **sibling keywords** are
> ignored per the draft-07 spec but applied in 2020-12; ajv applies them in _both_ builds, so
> that difference does not bite here.

## Step 2 — Producer resource: schemas and tests

**Mirror the docs repo's directory structure** so resources move across unchanged. Its schema
tree holds `common/producer/`; its test tree shows the full category set — `common/`,
`collection/`, `creation/`, `delivery/`, `receipt/` — which is the shape to grow into.

```
src/schemas/
  validate/                          shared AJV harness (step 1)
    index.js
    hapi-validator.js
  beta-2/
    common/
      producer.test.js               test sits beside the dir, as in the docs repo
      producer/
        producer.schema.json         oneOf the three variants
        producer-base.schema.json    councilMovement
        producer-household.schema.json   forbids the other seven via propertyNames
        producer-commercial.schema.json  organisationName, sicCode, address required
        producer-municipal.schema.json   sicCode optional
    creation/
      create-movement.schema.json    apiCode (uuid) + $ref producer
      create-movement.test.js
```

Ported from `digital-waste-tracking-api-docs/docs/event-model/schema/common/producer/`.

`create-movement.schema.json` lives under `creation/`, not at the beta-2 root — the docs repo
treats create-movement as a creation concern (`creation/create-movement.test.js`).

### Changes from the POC originals

1. `"$schema"` → `https://json-schema.org/draft/2020-12/schema`
2. `"$id"` → the file's **path relative to `src/schemas/`**, e.g.
   `beta-2/common/producer/producer.schema.json`
3. **Every `$ref` stays byte-for-byte unchanged.** AJV resolves relative refs against the
   `$id` base, so `$ref: "producer-base.schema.json"` inside
   `beta-2/common/producer/producer.schema.json` resolves to
   `beta-2/common/producer/producer-base.schema.json` on its own. The same holds for the
   cross-directory ref `../common/producer/producer.schema.json` from `creation/`.
4. The three custom `format`s become `pattern` (below). `format: "email"` stays — it is
   standard and understood by every consumer.

> **Why path-based `$id`s.** The AJV registry is global and throws on duplicate `$id`s. Tying
> `$id` to the file path makes collisions impossible by construction, lets `beta-1/…` and
> `beta-2/…` share one registry once step 4 lands, and keeps every POC `$ref` untouched.

### Patterns

Equivalent to the POC's validator functions across 445 samples with no mismatches. Two
transformations were required: the `/i` flag expanded inline (`[A-Z]` → `[A-Za-z]`, literal
`G` → `[Gg]`), and `^\s*…\s*$` wrapping to reproduce the validators' `.trim()`.

```
sicCode
"^\\d{5}$"

phoneNumber
"^\\s*(?=(?:\\D*\\d){7,15}\\D*$)\\+?[0-9()\\-\\s]+$"

postcode
"^\\s*(?:(?:(([Gg][Ii][Rr] 0[Aa]{2})|((([A-Za-z]\\d{1,2})|(([A-Za-z][A-Ha-hJ-Yj-y]\\d{1,2})|(([A-Za-z]\\d[A-Za-z])|([A-Za-z][A-Ha-hJ-Yj-y]\\d?[A-Za-z])))) \\d[A-Za-z]{2})))|(?:(?:[Dd]6[Ww]|[AaC-Fc-fHhKkNnPpRrTtV-Yv-y]\\d{2}) ?[0-9AaC-Fc-fHhKkNnPpRrTtV-Yv-y]{4}))\\s*$"

authorisationNumber
"^\\s*(?:(?:[A-Za-z]{2}\\d{4}[A-Za-z]{2})|(?:[A-Za-z]{2}\\d{4}[A-Za-z]{2}\\/[Dd]\\d{4,5})|(?:[Ee][Pp][Rr]\\/[A-Za-z]{2}\\d{4}[A-Za-z]{2})|(?:[Ee][Pp][Rr]\\/[A-Za-z]{2}\\d{4}[A-Za-z]{2}\\/[Dd]\\d{4,5})|(?:[Ee][Aa][Ww][Mm][Ll]\\d{5,6})|(?:[Ww][Mm][Ll]\\d{5,6})|(?:[Pp][Pp][Cc]\\/[AaWwEeNn]\\/\\d{7})|(?:[Ww][Mm][Ll]\\/[LlWwEeNn]\\/\\d{7})|(?:[Ww][Mm][Ll]\\/[LlWwEeNn]\\/\\d{7}\\/\\d{2})|(?:[Pp][Pp][Cc]\\/[Aa]\\/[Ss][Ee][Pp][Aa]\\d{4}-\\d{4})|(?:[Ww][Mm][Ll]\\/[Ll]\\/[Ss][Ee][Pp][Aa]\\d{4}-\\d{4})|(?:[Ee][Aa][Ss]\\/[Pp]\\/\\d{6})|(?:[Pp]\\d{4}\\/\\d{2}[A-Za-z])|(?:[Pp]\\d{4}\\/\\d{2}[A-Za-z]\\/[Vv]\\d+)|(?:[Ww][Pp][Pp][Cc] \\d{2}\\/\\d{2})|(?:[Ww][Pp][Pp][Cc] \\d{2}\\/\\d{2}\\/[Vv]\\d+)|(?:[Ww][Mm][Ll] \\d{2}\\/\\d+(\\/[Tt])? [Ll][Nn]\\/\\d{2}\\/\\d+(\\/([MmTtCcNn]|[Vv]\\d+))*)|(?:[Ww][Mm][Ll] \\d{2}\\/\\d+ [Pp][Aa][Cc]\\/\\d{4}\\/[Ww][Cc][Ll]\\d{3}))\\s*$"
```

> The utils source has 20 authorisation branches, two being exact duplicates (Wales reuses
> England's `XX9999XX` and `EPR/XX9999XX`). The pattern above is deduplicated to 18, with
> identical behaviour.

### Tests

Port `digital-waste-tracking-api-docs/test/event-model/schema/common/producer.test.js`
→ `src/schemas/beta-2/common/producer.test.js` — the same `common/producer.test.js` path the
docs repo uses, beside the `producer/` directory rather than inside it. Picked up by the
existing `testMatch: ['**/src/**/*.test.js']`.

The POC file runs **36 tests across 11 describe blocks** (9 `Scenario:` + 2
`Additional coverage:`). All 36 must survive the port.

1. Delete the `validateJoi` helper and its `producerSchema` import from
   `docs/collections/data/creationJoi.js`. **No Joi in beta-2.**
2. Delete each `expect(validateJoi(...))` line, keeping the `validateAjv` line beside it.
   Every assertion is already paired, so this is a mechanical halving.
3. Repoint `validate`/`getErrors` at `src/schemas/validate/` and use the full id:

   ```js
   const validateAjv = (payload) => {
     const id = 'beta-2/common/producer/producer.schema.json'
     const valid = validate(id, payload)
     return { valid, errors: valid ? null : getErrors(id) }
   }
   ```

4. Keep the fixtures (`commercialProducer`, `municipalProducer`, `householdProducer`) and
   every describe/test name verbatim, so the two repos stay diffable while the docs repo
   remains the sandbox.

Add `src/schemas/beta-2/creation/create-movement.test.js` covering the wrapper: `apiCode` and
`producer` both required, a valid payload of each `wasteSource`, a malformed `apiCode`, and
`additionalProperties` rejection.

**Done when** `npm test` is green with the producer suite reporting 36 passing tests.

## Step 3 — beta-2 route

`src/routes/beta-2/create-movement.js`, modelled on `src/routes/beta-1/create-movement.js`:

- `POST /movements`, mounted under the `/beta-2` prefix
- **No `tags: ['movements']`** — keeps it out of `/swagger.json`
- **No `plugins['hapi-swagger']` block** — responses are described in the authored spec
- `validate: { payload: jsonSchemaValidator('beta-2/creation/create-movement.schema.json') }`
- Handler mirrors beta-1: `getOrgIdForApiCode` → `createMovementId()` → `backOff(() =>
createMovementRecord(request.db, { movementId, orgId }))`. **`producer` is validated but
  not persisted.** `createMovementRecord` is unchanged.
- Register by adding one entry to the existing `versionedRouteGroups` array
  (`src/plugins/router.js:44`) with `prefix: '/beta-2'`.

The RFC9457 formatter keys off `request.path.startsWith('/beta-')`, so `/beta-2` is covered
with no change to `waste-movement-utils`.

Plus `create-movement.test.js`, mirroring the beta-1 route test.

## Step 4 — Convert beta-1 to the same mechanism

- Replace `src/schemas/beta-1.js` with `src/schemas/beta-1/` JSON Schemas covering the six
  existing shapes (`createMovement`, `createCollection`, `recordDelivery`, `recordReceipt`,
  `recordReceiptWithoutDelivery`, `deliveryIdParams`). All are trivial — `apiCode` uuid, a
  `movementIds` array, a `reason` string — with no conditional or cross-field logic. Same
  `$id`-equals-path rule, so they register as `beta-1/…` alongside `beta-2/…`.
- Switch all five routes in `src/routes/beta-1/` to `jsonSchemaValidator`.
- **Remove their `tags: ['movements']`.**
- Update the five existing route tests.

**Untagging is not optional.** With the `plugins['hapi-swagger']` blocks gone but the tag
still present, the five beta-1 routes remain in `/swagger.json` advertising a fabricated
response:

```json
"responses": {
  "default": { "schema": { "type": "string" }, "description": "Successful" }
}
```

The generated spec would claim these endpoints return a string. Dropping the tag (one line
per file) removes them from the generated spec entirely and leaves `openapi-beta-1.yaml` as
their sole description. This does not depend on the rest of step 4 and can land on its own.

**Behaviour change:** beta-1 validation error _messages_ come from AJV rather than Joi. Status
codes and the RFC9457 envelope are unaffected. Existing tests asserting on Joi message text
need updating.

## Step 5 — OpenAPI specs

`docs/api/`:

- `openapi-beta-1.yaml` — from `digital-waste-tracking-api-docs/docs/api/openapi-beta-1.yaml`
  (497 lines, 5 paths), converted 3.0.3 → 3.1. Near-mechanical: the only 3.0-only construct
  is a single `nullable: true` (line 216), which becomes `type: [x, 'null']`.
- `openapi-beta-2.yaml` — 3.1, `$ref`ing the schema files. Roughly 100 lines: info, servers,
  security (Basic), the one path, and 201/400/401 responses.

Leaves the docs repo: `openapi-beta-1.yaml`, `openapi-beta-1.md`,
`docs/event-model/schema/common/producer/`, `test/event-model/schema/common/producer.test.js`.
Its `openapi.yaml` (2869 lines, `0.3-alpha`) is a separate artefact and is untouched.

**Open:** how the docs repo gets a ref-resolvable copy — colocate the schemas under
`docs/api/` so refs are local and one directory copies cleanly, or add a bundle step. Settle
when the docs repo is wired up; it does not block this work.

---

## Verification

- `npm test` — producer suite (36), harness tests, beta-1 and beta-2 route tests
- `npm run lint` and `npm run format:check` — both run in the husky pre-commit hook
- `GET /swagger.json` contains **only** legacy routes
- `POST /beta-2/movements` returns 201 for a valid producer of each `wasteSource`, and 400
  for each rejection scenario in the ported test

## Risks

| Risk                                                   | Mitigation                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| beta-1 error messages change (step 4)                  | Contained to beta-1; update the five route tests. Status codes and envelope unchanged              |
| Patterns diverge from `waste-movement-utils` over time | Accepted — beta-2 owns its rules, and the two are already divergent                                |
| `strict: true` rejects a ported schema                 | Surfaces at import time, not at request time                                                       |
| Wrong `ajv` version resolves                           | Explicit `ajv@^8` direct dependency; confirm the resolved version after install                    |
| Jest suites share one in-memory MongoDB                | Run with `--runInBand`, as `npm test` already does; ad-hoc parallel runs produce spurious failures |
