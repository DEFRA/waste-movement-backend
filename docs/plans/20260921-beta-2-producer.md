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

| Decision           | Detail                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source of truth    | JSON Schema, **2020-12** dialect. No Joi anywhere in beta-1 or beta-2                                                                                                                                                    |
| Runtime validation | AJV (`ajv/dist/2020.js`) behind a Hapi custom validation function                                                                                                                                                        |
| Format rules       | Converted to inline `pattern`. No custom formats, no import from `waste-movement-utils`; divergence from Phase-1 rules is accepted                                                                                       |
| `$id`              | **Equal to the file's path relative to `src/schemas/`** (e.g. `beta-2/common/producer/producer.schema.json`). Makes duplicates impossible by construction and leaves every POC `$ref` untouched                          |
| Layout             | Schemas under `src/schemas/beta-2/`, **mirroring the docs repo's `common/` · `creation/` · `collection/` · `delivery/` · `receipt/` categories**. Shared AJV harness at `src/schemas/validate/`. Specs under `docs/api/` |
| Slice scope        | `apiCode` + required `producer`. Persists `{movementId, orgId, createdAt}` — unchanged from beta-1                                                                                                                       |
| Docs               | hapi-swagger **stays** for legacy routes; beta routes are untagged so it never sees them. Beta specs are hand-authored OpenAPI 3.1                                                                                       |
| Out of scope       | RFC9457 `errors` array formatting (handled separately); persisting `producer`                                                                                                                                            |

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

## Status

| Step                 | State                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Producer schemas   | **done** — `src/schemas/beta-2/common/producer/` (5 files) + `src/schemas/beta-2/creation/create-movement.schema.json`, verified to load and validate under `ajv/dist/2020.js` |
| 2 AJV harness        | not started                                                                                                                                    |
| 3 beta-2 route       | not started                                                                                                                                    |
| 4 beta-1 conversion  | **partially done** — `plugins['hapi-swagger']` blocks removed (`5cb0fe2`, #170). Joi→JSON Schema, AJV switch and **untagging** still to do     |
| 5 Producer test port | not started                                                                                                                                    |
| 6 OpenAPI specs      | **partially done** — `docs/api/openapi-beta-1.yaml` copied but untracked and still 3.0.3. 3.1 conversion and `openapi-beta-2.yaml` still to do |

## Non-goals

- Do **not** touch the legacy (non-`beta-`) endpoints. They keep Joi validation, their
  `movements` tag, and their `plugins['hapi-swagger']` blocks.
- Do not remove `hapi-swagger`, `@hapi/inert` or `@hapi/vision`.
- Do not persist `producer` yet.
- Do not implement the RFC9457 `errors` array.

---

## Step 1 — Producer schemas

**Mirror the docs repo's directory structure** so resources move across unchanged. Its
schema tree currently holds only `common/producer/` (producer is the one resource ported to
JSON Schema so far), but its test tree shows the full category set — `common/`,
`collection/`, `creation/`, `delivery/`, `receipt/` — which is the shape to grow into.

```
src/schemas/
  validate/                          shared AJV harness (step 2)
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

`create-movement.schema.json` lives under `creation/`, not at the beta-2 root — the docs
repo treats create-movement as a creation concern (`creation/create-movement.test.js`).

### Changes from the POC originals

1. `"$schema"` → `https://json-schema.org/draft/2020-12/schema`
2. `"$id"` → the file's **path relative to `src/schemas/`**, e.g.
   `beta-2/common/producer/producer.schema.json`
3. **Every `$ref` stays byte-for-byte unchanged.** AJV resolves relative refs against the
   `$id` base, so `$ref: "producer-base.schema.json"` inside
   `beta-2/common/producer/producer.schema.json` resolves to
   `beta-2/common/producer/producer-base.schema.json` on its own. Verified against
   `ajv/dist/2020.js`, including the cross-directory ref
   `../common/producer/producer.schema.json` from `creation/`.
4. The three custom `format`s replaced by `pattern` (below). `format: "email"` stays — it is
   standard and understood by every consumer.

> **Why path-based `$id`s.** The AJV registry is global and throws on duplicate `$id`s. Tying
> `$id` to the file path makes collisions impossible by construction, lets `beta-1/…` and
> `beta-2/…` share one registry once step 4 lands, and keeps every POC `$ref` untouched. The
> loader asserts `$id` equals the file's actual relative path, so a typo fails at import
> time rather than silently registering under the wrong key.

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

`src/schemas/validate/` — **version-neutral, one registry for all beta versions.** It sits
above `beta-2/` rather than inside it because step 4 brings beta-1 onto the same mechanism;
both then share a single AJV instance. Path-based `$id`s are what make that safe.

- `index.js` — ports the POC's directory-walk loader, walking `src/schemas/**` for
  `*.schema.json`. Keep its `__dirname` approach rather than `import.meta.url`:
  `babel.config.cjs` enables `babel-plugin-transform-import-meta` only in the `test` env, and
  the loader must work under both. Import **`ajv/dist/2020.js`** (not the default draft-07
  build). Keep `addFormats` for `email` and `uuid` (`create-movement.schema.json`'s `apiCode`
  uses `format: "uuid"`); drop `registerFormats` entirely. Config stays
  `{ allErrors: true, strict: true }` — `allErrors` matches the server's existing
  `abortEarly: false` (`src/server.js:32`).

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

**New dependency:** `ajv` + `ajv-formats` (both runtime deps — validation happens at request
time). Neither appears on the Defra radar, but neither do most libraries; the radar governs
platform technology, not npm packages.

## Step 3 — beta-2 route

`src/routes/beta-2/create-movement.js`, modelled on `src/routes/beta-1/create-movement.js`:

- `POST /movements`, mounted under the `/beta-2` prefix
- **No `tags: ['movements']`** — keeps it out of `/swagger.json`
- **No `plugins['hapi-swagger']` block** — it never validated anything; responses are
  described in the authored spec instead
- `validate: { payload: jsonSchemaValidator('beta-2/creation/create-movement.schema.json') }`
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
  `movementIds` array, a `reason` string — with no conditional or cross-field logic. Same
  `$id`-equals-path rule, so they register as `beta-1/…` alongside `beta-2/…`.
- Switch all five routes in `src/routes/beta-1/` to `jsonSchemaValidator`.
- **Remove their `tags: ['movements']`** — see the open item below.
- Update the five existing route tests.

> ~~Remove their `plugins['hapi-swagger']` blocks~~ — **done**, committed as `5cb0fe2` > _"chore: remove hapi-swagger from beta-1 apis (#170)"_.

**Open item — beta-1 is still tagged.** The blocks are gone but `tags: ['movements']`
remains, so the five beta-1 routes are still in `/swagger.json` and now advertise a
fabricated response:

```json
"responses": {
  "default": { "schema": { "type": "string" }, "description": "Successful" }
}
```

That is worse than before the blocks were removed — the generated spec now claims these
endpoints return a string. Dropping the tag (one line per file) removes them from the
generated spec entirely and leaves `openapi-beta-1.yaml` as their sole description. This
does not depend on the rest of step 4 and can land on its own.

**Behaviour change:** beta-1 validation error _messages_ will come from AJV rather than Joi.
Status codes and the RFC9457 envelope are unaffected. Existing tests asserting on Joi
message text will need updating.

## Step 5 — Port the producer test

`digital-waste-tracking-api-docs/test/event-model/schema/common/producer.test.js`
→ `src/schemas/beta-2/common/producer.test.js` — the same `common/producer.test.js` path the
docs repo uses, beside the `producer/` directory rather than inside it. Picked up by the
existing `testMatch: ['**/src/**/*.test.js']`.

- Delete `validateJoi` and the `producerSchema` import; keep `validateAjv`.
- Delete each `expect(validateJoi(...))` line, keep the AJV line beside it.
- Keep all 9 `Scenario:` blocks and both `Additional coverage:` blocks — 11 in total.
- Point `validate`/`getErrors` at `src/schemas/validate/` and use the full
  `beta-2/common/producer/producer.schema.json` id.

## Step 6 — OpenAPI specs

`docs/api/` (new directory in this repo):

- `openapi-beta-1.yaml` — **copied already** from
  `digital-waste-tracking-api-docs/docs/api/openapi-beta-1.yaml` (497 lines, 5 paths), but
  still **untracked and unmodified at 3.0.3**. Remaining work is the 3.0.3 → 3.1 conversion,
  which is near-mechanical: the only 3.0-only construct is a single `nullable: true`
  (line 216), which becomes `type: [x, 'null']`.
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
