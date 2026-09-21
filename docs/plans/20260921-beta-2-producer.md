# beta-2 slice: `producer` on `POST /beta-2/movements`

**Date:** 2026-09-21
**Branch:** DWTC-192

## Goal

Introduce a `beta-2` API slice whose payload validation is driven by **JSON Schema as the
source of truth**, starting with the `producer` resource on `POST /beta-2/movements`.
Port the producer schemas and tests out of the `digital-waste-tracking-api-docs` POC into
this repo, and bring `beta-1` onto the same mechanism so the two versions are consistent.

`digital-waste-tracking-api-docs` remains the sandbox/POC; once a resource works there it
moves here, and that repo references it from here.

## Decisions

| Decision           | Detail                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Source of truth    | JSON Schema, **2020-12** dialect. No Joi anywhere in beta-1 or beta-2                                                              |
| Runtime validation | AJV (`ajv/dist/2020.js`) behind a Hapi custom validation function                                                                  |
| Format rules       | Converted to inline `pattern`. No custom formats, no import from `waste-movement-utils`; divergence from Phase-1 rules is accepted |
| `$id`              | Namespaced (`beta-2/producer.schema.json`) — the AJV registry is global and throws on duplicates                                   |
| Layout             | Schemas under `src/schemas/beta-2/`, specs under `docs/api/`                                                                       |
| Slice scope        | `apiCode` + required `producer`. Persists `{movementId, orgId, createdAt}` — unchanged from beta-1                                 |
| Docs               | hapi-swagger **stays** for legacy routes; beta routes are untagged so it never sees them. Beta specs are hand-authored OpenAPI 3.1 |
| Out of scope       | RFC9457 `errors` array formatting (handled separately); persisting `producer`                                                      |

### Verified findings behind these decisions

Each of these was confirmed by probing the real code, not inferred:

- **Hapi accepts a JSON Schema validator directly.** `lib/validation.js:23` returns a
  `function` rule as-is and calls it as the validator (`lib/validation.js:118`). Its return
  value replaces `request.payload`. No `server.validator()` registration needed.
- **hapi-swagger validates nothing** — it is documentation-only. A handler returning
  `{totallyDifferent:123}` against a declared 201 schema requiring `mustHave` returned
  **201, unmodified**. Request validation is Hapi core via `validate.payload`; response
  validation is Hapi core via `options.response.status` (used only by `health.js`).
- **hapi-swagger cannot produce our spec.** Three independent blockers:
  `OAS: Joi.string().valid('v2','v3.0')` (`lib/index.js:49`) caps it at 3.0.0;
  `lib/properties.js:67` discards anything that isn't `Joi.isSchema()`; and 3.0.0 cannot
  express `const`, `propertyNames`, or boolean-`false` subschemas. Fed a non-Joi validator
  it emits a dangling `$ref: "#/components/schemas/Hidden%20Model"`.
- **Untagging removes a route from the generated spec.** With `routeTag: 'movements'`
  (`src/plugins/swagger.js`), a route without that tag is absent from `/swagger.json`.
- **hapi-swagger is archived** (`archived: true`, last push 2025-06-02, 97 open issues; no
  npm release since 2024-12-10, and we are on latest `17.3.2`). It is retained only because
  the legacy endpoints still use it — no new use.
- **OpenAPI 3.1 renders fine** in both consumers: `mkdocs-swagger-ui-tag` 0.8.1 bundles
  Swagger UI 5.x, and `waste-tracking-service`'s vendored dist is also 5.x. No Terraform in
  the workspace and no CI workflow references `openapi`, so nothing imports a spec into API
  Gateway (which would have required 3.0.x).
- **The POC's `validators.js` has already drifted** from `waste-movement-utils`
  (`\/D\d{4}` vs `\/D\d{4,5}`), and utils has **no** phone validation at all. Since beta-2
  owns its rules independently, the generated patterns are authoritative here.

## Non-goals

- Do **not** touch the legacy (non-`beta-`) endpoints. They keep Joi validation, their
  `movements` tag, and their `plugins['hapi-swagger']` blocks.
- Do not remove `hapi-swagger`, `@hapi/inert` or `@hapi/vision`.
- Do not persist `producer` yet.
- Do not implement the RFC9457 `errors` array.

---

## Step 1 — Producer schemas

Create `src/schemas/beta-2/producer/`, porting from
`digital-waste-tracking-api-docs/docs/event-model/schema/common/producer/`:

- `producer.schema.json` — `oneOf` the three variants
- `producer-base.schema.json` — `councilMovement`
- `producer-household.schema.json` — forbids the other seven fields via `propertyNames`
- `producer-commercial.schema.json` — `organisationName`, `sicCode`, `address` required
- `producer-municipal.schema.json` — `sicCode` optional

Changes from the POC originals:

1. `"$schema"` → `https://json-schema.org/draft/2020-12/schema`
2. `"$id"` and every `$ref` namespaced with `beta-2/`
3. The three custom `format`s replaced by `pattern` (below). `format: "email"` stays —
   it is standard and understood by every consumer.

Also add `src/schemas/beta-2/create-movement.schema.json`:
`apiCode` (uuid) + `$ref` producer, `required: [apiCode, producer]`.

### Generated patterns

Verified equivalent to the original validator functions across **445 samples, 0
mismatches**. Two transformations were needed: the `/i` flag expanded inline (`[A-Z]` →
`[A-Za-z]`, literal `G` → `[Gg]`), and `^\s*…\s*$` wrapping to reproduce the validators'
`.trim()`.

```
sicCode
"^\\d{5}$"

phoneNumber
"^\\s*(?=(?:\\D*\\d){7,15}\\D*$)\\+?[0-9()\\-\\s]+$"

postcode
"^\\s*(?:(?:(([Gg][Ii][Rr] 0[Aa]{2})|((([A-Za-z]\\d{1,2})|(([A-Za-z][A-Ha-hJ-Yj-y]\\d{1,2})|(([A-Za-z]\\d[A-Za-z])|([A-Za-z][A-Ha-hJ-Yj-y]\\d?[A-Za-z])))) \\d[A-Za-z]{2})))|(?:(?:[Dd]6[Ww]|[AaC-Fc-fHhKkNnPpRrTtV-Yv-y]\\d{2}) ?[0-9AaC-Fc-fHhKkNnPpRrTtV-Yv-y]{4}))\\s*$"

authorisationNumber  (see note on duplicates)
"^\\s*(?:(?:[A-Za-z]{2}\\d{4}[A-Za-z]{2})|(?:[A-Za-z]{2}\\d{4}[A-Za-z]{2}\\/[Dd]\\d{4,5})|(?:[Ee][Pp][Rr]\\/[A-Za-z]{2}\\d{4}[A-Za-z]{2})|(?:[Ee][Pp][Rr]\\/[A-Za-z]{2}\\d{4}[A-Za-z]{2}\\/[Dd]\\d{4,5})|(?:[Ee][Aa][Ww][Mm][Ll]\\d{5,6})|(?:[Ww][Mm][Ll]\\d{5,6})|(?:[Pp][Pp][Cc]\\/[AaWwEeNn]\\/\\d{7})|(?:[Ww][Mm][Ll]\\/[LlWwEeNn]\\/\\d{7})|(?:[Ww][Mm][Ll]\\/[LlWwEeNn]\\/\\d{7}\\/\\d{2})|(?:[Pp][Pp][Cc]\\/[Aa]\\/[Ss][Ee][Pp][Aa]\\d{4}-\\d{4})|(?:[Ww][Mm][Ll]\\/[Ll]\\/[Ss][Ee][Pp][Aa]\\d{4}-\\d{4})|(?:[Ee][Aa][Ss]\\/[Pp]\\/\\d{6})|(?:[Pp]\\d{4}\\/\\d{2}[A-Za-z])|(?:[Pp]\\d{4}\\/\\d{2}[A-Za-z]\\/[Vv]\\d+)|(?:[Ww][Pp][Pp][Cc] \\d{2}\\/\\d{2})|(?:[Ww][Pp][Pp][Cc] \\d{2}\\/\\d{2}\\/[Vv]\\d+)|(?:[Ww][Mm][Ll] \\d{2}\\/\\d+(\\/[Tt])? [Ll][Nn]\\/\\d{2}\\/\\d+(\\/([MmTtCcNn]|[Vv]\\d+))*)|(?:[Ww][Mm][Ll] \\d{2}\\/\\d+ [Pp][Aa][Cc]\\/\\d{4}\\/[Ww][Cc][Ll]\\d{3}))\\s*$"
```

> The raw utils source has 20 branches, two of which are exact duplicates (Wales reuses
> England's `XX9999XX` and `EPR/XX9999XX`). The pattern above is **already deduplicated to
> 18**. Behaviour is identical.

The converter used to generate these (`deflag` / `trimTolerant`) is ~25 lines and is kept
only as a one-off; it is **not** shipped, since beta-2 owns these rules from here on.

## Step 2 — AJV harness

`src/schemas/beta-2/validate/`:

- `index.js` — ports the POC's directory-walk loader. Keep its `__dirname` approach rather
  than `import.meta.url`: `babel.config.cjs` enables `babel-plugin-transform-import-meta`
  only in the `test` env, and the loader must work under both. Import **`ajv/dist/2020.js`**
  (not the default draft-07 build). Keep `addFormats` for `email`; drop `registerFormats`
  entirely. Config stays `{ allErrors: true, strict: true }` — `allErrors` matches the
  server's existing `abortEarly: false` (`src/server.js:32`).
- `hapi-validator.js` — the adapter:

  ```js
  export const jsonSchemaValidator = (schemaId) => (value) => {
    if (validate(schemaId, value)) return value
    throw Boom.badRequest('Payload validation failed')
  }
  ```

  Used as `validate: { payload: jsonSchemaValidator('beta-2/create-movement.schema.json') }`.

- `index.test.js` — registry loads, unknown `$id` throws, duplicate `$id` detection.

**New dependency:** `ajv` + `ajv-formats` (both runtime deps — validation happens at request
time). Neither appears on the Defra radar, but neither do most libraries; the radar governs
platform technology, not npm packages.

## Step 3 — beta-2 route

`src/routes/beta-2/create-movement.js`, modelled on `src/routes/beta-1/create-movement.js`:

- `POST /movements`, mounted under the `/beta-2` prefix
- **No `tags: ['movements']`** — keeps it out of `/swagger.json`
- **No `plugins['hapi-swagger']` block** — it never validated anything; responses are
  described in the authored spec instead
- `validate: { payload: jsonSchemaValidator(...) }`
- Handler mirrors beta-1: `getOrgIdForApiCode` → `createMovementId()` → `backOff(() =>
createMovementRecord(request.db, { movementId, orgId }))`. **`producer` is validated but
  not persisted.** `createMovementRecord` is unchanged.
- Register by adding one entry to the existing `versionedRouteGroups` array
  (`src/plugins/router.js:44`) with `prefix: '/beta-2'`.

The RFC9457 formatter already keys off `request.path.startsWith('/beta-')`, so `/beta-2` is
covered with no change to `waste-movement-utils`.

Plus `create-movement.test.js`, mirroring the beta-1 route test.

## Step 4 — Convert beta-1 to the same mechanism

For consistency, beta-1 moves off Joi:

- Replace `src/schemas/beta-1.js` with `src/schemas/beta-1/` JSON Schemas covering the six
  existing shapes (`createMovement`, `createCollection`, `recordDelivery`, `recordReceipt`,
  `recordReceiptWithoutDelivery`, `deliveryIdParams`). All are trivial — `apiCode` uuid, a
  `movementIds` array, a `reason` string — with no conditional or cross-field logic.
- Switch all five routes in `src/routes/beta-1/` to `jsonSchemaValidator`.
- Remove their `tags: ['movements']` and their `plugins['hapi-swagger']` blocks.
- Update the five existing route tests.

**Behaviour change:** beta-1 validation error _messages_ will come from AJV rather than Joi.
Status codes and the RFC9457 envelope are unaffected. Existing tests asserting on Joi
message text will need updating.

## Step 5 — Port the producer test

`digital-waste-tracking-api-docs/test/event-model/schema/common/producer.test.js`
→ `src/schemas/beta-2/producer/producer.test.js` (picked up by the existing
`testMatch: ['**/src/**/*.test.js']`).

- Delete `validateJoi` and the `producerSchema` import; keep `validateAjv`.
- Delete each `expect(validateJoi(...))` line, keep the AJV line beside it.
- Keep all 9 `Scenario:` blocks and both `Additional coverage:` blocks — 11 in total.
- Point `validate`/`getErrors` at the local harness and use the namespaced
  `beta-2/producer.schema.json` id.

## Step 6 — OpenAPI specs

`docs/api/` (new directory in this repo):

- `openapi-beta-1.yaml` — moved from
  `digital-waste-tracking-api-docs/docs/api/openapi-beta-1.yaml` (497 lines, 5 paths) and
  converted 3.0.3 → 3.1. Near-mechanical: the only 3.0-only construct is a single
  `nullable: true` (line 216), which becomes `type: [x, 'null']`.
- `openapi-beta-2.yaml` — new, 3.1, `$ref`ing the schema files. Roughly 100 lines: info,
  servers, security (Basic), the one path, and 201/400/401 responses.

Leaves the docs repo: `openapi-beta-1.yaml`, `openapi-beta-1.md`,
`docs/event-model/schema/common/producer/`, `test/event-model/schema/common/producer.test.js`.
Its `openapi.yaml` (2869 lines, `0.3-alpha`) is a separate artefact and is untouched.

**Still open:** how the docs repo gets a ref-resolvable copy. Options are to colocate the
schemas under `docs/api/` so refs are local and one directory copies cleanly, or to add a
bundle step. Deferred until the docs repo is actually wired up — it does not block this work.

---

## Verification

- `npm test` — ported producer tests, harness tests, beta-1 and beta-2 route tests
- `npm run lint` and `npm run format:check` — both run in the husky pre-commit hook
- `GET /swagger.json` contains **only** legacy routes once step 4 lands
- `POST /beta-2/movements` returns 201 for a valid producer of each `wasteSource`, and 400
  for each rejection scenario in the ported test

## Risks

| Risk                                                   | Mitigation                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| beta-1 error messages change (step 4)                  | Contained to beta-1; update the five route tests. Status codes and envelope unchanged            |
| Patterns diverge from `waste-movement-utils` over time | Accepted by decision — beta-2 owns its rules. The two are already divergent                      |
| `strict: true` rejects a ported schema                 | Surfaces immediately at import time, not at request time                                         |
| AJV 2020 build vs draft-07 `$ref` resolution           | All refs are local filenames; semantics of every keyword used are identical across both dialects |
