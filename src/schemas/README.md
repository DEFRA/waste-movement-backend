# Schemas

Every `beta-` request payload, and every `beta-` 201 response body, is defined **once**, as a [JSON Schema](https://json-schema.org/)
file. That file is the source of truth: the running service validates against it directly, and
everything else about the payload — the OpenAPI spec, the developer documentation, eventually
the business-rules list we share with regulators — is generated from it rather than written out
again by hand.

This document is for people changing these schemas: why the conventions are what they are, and
what to do when you add or change one. For how the wiring actually works, read `validate/` — it
is two short files.

## The conventions, and why

### JSON Schema, not Joi

Legacy (non-`beta-`) routes still use Joi and aren't being changed. For the beta versions the
point is that **the rules stop being tied to a library**. With Joi the rules _are_ the library —
expressed in one vendor's chained-call API, readable only with the code open, and un-portable.
As JSON Schema they are an open standard: a file you can hand to another repo, a regulator, or a
code generator, with the validator as a swappable implementation detail.

Don't import Joi into anything under `beta-1/` or `beta-2/`.

### 2020-12 dialect, and therefore OpenAPI 3.1

Every schema declares `"$schema": "https://json-schema.org/draft/2020-12/schema"`.

**OpenAPI 3.1's default schema dialect is 2020-12.** Authoring in 2020-12 means the spec can
`$ref` these exact files, so the published contract is the same artefact the validator runs — no
conversion step in between.

**OpenAPI 3.0 can't express what these schemas need.** `const` and `propertyNames` are what
encode rules like "Household forbids these fields" and "exactly one of `authorisationNumber` /
`reasonForNoAuthorisationNumber`" (with the `oneOf` branches described under
[No boolean subschemas](#no-boolean-subschemas)). A 3.0 spec would
describe a looser contract than the one actually enforced. 3.1 is required, not preferred.

`hapi-swagger` is not part of this — it can't consume JSON Schema and can't emit 3.1. It serves
the legacy routes only, and finds them by a route tag, so **beta routes carry no `tags`**.

### The file's path is its identity

A schema file declares no `$id`. The loader registers each one under its path relative to
`src/schemas/`, and ajv treats that key as the schema's base URI:

```js
ajv.addSchema(schema, 'beta-2/common/producer/producer.schema.json')
```

So the path is the identity, rather than being restated inside the file and checked against it:

1. **Collisions are impossible** — two files can't share a path.
2. **Both versions share one registry**, so `validate/` sits above `beta-1/` and `beta-2/`
   rather than being duplicated per version.
3. **Relative `$ref`s just work**, because they resolve against that base — within a folder
   (`producer-base.schema.json`) and across one (`../common/producer/producer.schema.json`). A
   schema can be copied to another repo with its refs untouched.

### Self-contained: rules inline, nothing imported

All validation lives inside the file — `pattern`, `enum`, `const`, `required`,
`propertyNames`. No custom formats, no helper functions, no import from `waste-movement-utils`.
Only the standard `email` and `uuid` formats are used, because every JSON Schema consumer
already understands them.

This is what makes a schema shareable: a file with a custom `format: "postcode"` in it is
meaningless to anyone who doesn't also have our validator wired up. So postcode, phone number,
SIC code and authorisation number are all long inline `pattern`s.

The consequence to know: **these patterns are owned here and have already diverged from
`waste-movement-utils`' Phase-1 validators.** That divergence is accepted, not a bug to fix by
reaching back into utils.

### No boolean subschemas

To forbid a field in one branch of a `oneOf` — "exactly one of `authorisationNumber` /
`reasonForNoAuthorisationNumber`", "no `items` when `isPresent` is false" — write an explicit
never-matching schema with a description saying why, not a bare `false`:

```json
"reasonForNoAuthorisationNumber": {
  "not": {},
  "description": "Not allowed when authorisationNumber is provided."
}
```

`"field": false` means the same thing and is valid 2020-12 and OpenAPI 3.1, but tools built on
[OpenAPIKit](https://github.com/mattpolzin/OpenAPIKit) — Apple's `swift-openapi-generator`,
OpenAPI Viewer for macOS — can't decode a boolean where they expect a schema object, and reject
the **whole** published spec, since it `$ref`s these files. `{ "not": {} }` validates
identically, so no payload is accepted or rejected differently, and `validate/hapi-validator.js`
maps its `not` error to `NotAllowed` with the field's pointer, as callers already get.

`"additionalProperties": false` is the exception and stays: it's how a whole payload is closed,
and those tools accept a boolean there. `conventions.test.js` fails on any other boolean
subschema.

### Granular: one small file per resource

A resource is a thing the model talks about — a producer, an address, contact details. Each gets
its own file; a resource with variants gets a file per variant, tied together with `$ref`:

```
producer.schema.json             the choice between the three variants
producer-base.schema.json        fields all three share
producer-household.schema.json
producer-commercial.schema.json
producer-municipal.schema.json
```

Small files mean a resource can be reused wherever it's needed (`address` already is), read on
its own without wading through unrelated rules, and changed by two people at once without
touching the same lines. The alternative — one 2,900-line `openapi.yaml` — is what this is
deliberately moving away from.

Give every schema and every property a `description`. It's prose next to the rule it describes,
and it's what generated documentation is built from.

### Examples: named, beside the body they illustrate

Every beta-2 request and response body has a `<route>-request.examples.json` /
`<route>-response.examples.json` beside its schema — a map of named
[OpenAPI Example Objects](https://spec.openapis.org/oas/v3.1.0#example-object):

```json
{
  "commercial": {
    "summary": "Commercial producer, with …",
    "value": { "producer": { … } }
  },
  "household": {
    "summary": "Household producer, minimal",
    "value": { "producer": { … } }
  }
}
```

They're a separate file because JSON Schema's own `examples` keyword is an unnamed list, and
tools only offer a choice between _named_ examples: `beta-2/openapi.json` puts these under the
media type's `examples` (`$ref`-ing each one by name), which gives a picker in Swagger UI and one
saved example per entry when the spec is imported into Bruno or Postman. Referring to them by
name rather than by position also means reordering can't silently swap which payload a name shows.

- **Payloads live here, once.** The spec only points at them; don't copy one into it.
- **A response's names match its request's.** API clients pair the request and response examples
  that share a name, and produce every combination of the two when they don't.
- **Every `value` must be valid.** ajv never checks examples, so `conventions.test.js` validates
  each one against the schema beside it; a rule change that breaks an example fails there.

Path params (`-params`) and shared resources have no body of their own, so they keep a root-level
`examples` array, which `conventions.test.js` also checks. Swagger UI renders only its first entry,
so put the fullest example first.

### Whole bodies are named after their route

A schema for a whole request or response body is named after the route file it belongs to, with
a `-request` or `-response` suffix — `routes/beta-2/create-collection.js` validates against
`collection/create-collection-request.schema.json` and
`collection/create-collection-response.schema.json`. Every route has exactly one pair, so a
route's whole contract can be found from its file name. Two routes that return the same shape
still get a file each; the second is a `title`, a `description` and a `$ref` to the first
(`record-receipt-without-delivery-response` → `record-receipt-response`).

Only whole bodies get a suffix. Resources they're built from keep resource names (`producer`,
`delivery-item`, `movement-id`), and path params are `-params` (`delivery-id-params`).

### Schema + test is one unit

A schema never ships alone. The test beside it pins _why_ the rules are what they are, one case
per business rule, named after the scenario rather than the code:

```
Feature: Producer payload validation for the create endpoint
  Scenario: Household producer includes a forbidden field
    the Movement is rejected when organisationName is provided
```

This is where a requirement lands: a ticket says what should happen, the test says it in one
line, the schema is changed until the test passes. A rule that has been agreed stays agreed,
because removing it breaks a named test. **Don't add a schema without a test, and don't change a
schema's rules without touching its test.**

### Response schemas: 201 only, `data` only

Each beta route also validates its **201** body, via Hapi's `options.response.status[201]`
pointed at the route's `<route>-response.schema.json` (`jsonSchemaResponseValidatorFor` in `validate/`). As with
requests, these files are the source of truth: `beta-2/openapi.json` `$refs` them rather than
defining responses itself, so the published contract and the runtime check are the same file.

- **`data` only.** beta-2 success bodies have no `validation` envelope: a `201` means accepted
  with nothing outstanding, and soft data-quality issues are rejected with `422`
  `confirmation-required` instead of being returned as warnings (D-046 in the API docs). beta-1
  routes still return `validation: { warnings: [] }`. Don't add a `validation` member back to a
  beta-2 response schema.
- **201 only.** Error responses are Boom errors, which Hapi doesn't validate, and they are
  problem details, not a modelled body.
- **A mismatch is a 500**, with the generic internal-server-error problem details — no ajv
  internals reach the client. The validator logs `{ schemaId, errors }` at error level first, so
  the failure is alertable. The write has already happened by then: a mismatch is a contract
  bug for tests to catch, not a normal path.
- **No `additionalProperties`.** Response objects are left open: extra fields pass, missing /
  wrongly-typed / out-of-enum fields fail. Unlike request payloads, don't add
  `"additionalProperties": false` to a response schema — closing one means any field the service
  adds becomes a 500 until the schema catches up.
- **beta-1 is self-contained.** Its response files inline the ids, `wasteType` and
  `deliveryItem` as `$defs` rather than `$ref`-ing `beta-2/common/`, so changing beta-2 can't
  change beta-1's contract.
- **Legacy routes are untouched.** Response validation is declared per beta route; there is no
  server-wide default. `server.test.js` fails if a beta route ships without a 201 schema.

### The OpenAPI spec lives here too

Each version's spec is `beta-N/openapi.json`, at the root of its version folder, `$ref`-ing the
schemas and named examples beside it by relative path. It's owned here, not in
`digital-waste-tracking-api-docs`: that repo copies `beta-*/` (spec, schemas and examples) and
renders it on GitHub Pages, nothing more. So a schema change and the spec change it needs land in
the same PR.

`openapi.test.js` resolves every `$ref` in each spec — schema files, refs between schemas,
example names — and checks the result is a valid OpenAPI 3.1 document. A renamed schema file or a
mistyped example name fails there rather than on the published page.

## Layout

```
src/schemas/
  validate/          loads every *.schema.json and adapts it to a Hapi route validator
  openapi.test.js    resolves every beta-*/openapi.json and validates it as OpenAPI 3.1
  beta-1/            flat: a <route>-request / <route>-response pair per route, plus
                     delivery-id-params (tests in beta-1.test.js), and openapi.json
  beta-2/
    openapi.json     the published spec — $refs everything below
    common/          shared resources — address, contact-details, producer/, broker-or-dealer/,
                     and the ids and wasteType that responses are built from
    creation/        create-movement-request / -response (each with its .examples.json)
    collection/      create-collection-request / -response, and the movementId path params
    delivery/        record-delivery-request / -response, and delivery-item
    receipt/         record-receipt-request / -response,
                     record-receipt-without-delivery-request / -response,
                     and the deliveryId path params
```

`digital-waste-tracking-api-docs` copies each `beta-*/` folder as-is, so a file's path from
`src/schemas/` is its path there too, and the specs' relative `$ref`s resolve unchanged.

**`beta-1` vs `beta-2`**: same mechanism, different shape. beta-1's payloads are trivial (an
`apiCode`, a list of ids, a `reason`) so they stay flat, with one file per body; it was
converted off Joi so both versions run one mechanism, not because it's where modelling happens.
**New work goes in `beta-2`.**

## Making a change

**Changing a rule** — edit the `.schema.json`, update or add the named case in its `.test.js`.
If the rule is about one field, it belongs in the schema. If it spans two resources or two
endpoints, it doesn't — that stays in service code. A schema describes one resource.

**Adding a resource** — create `beta-2/<category>/<name>.schema.json` with the 2020-12 `$schema`,
no `$id`, a `title` and `description`, a `description` on every property, and
`"additionalProperties": false` if it's a whole payload. Add `<name>.test.js` beside it. There's
no registration step — the loader walks the directory, and the file's path becomes the key routes
validate against.

**Adding a route** — add `<category>/<route>-request.schema.json` and
`<category>/<route>-response.schema.json`, named after the new route file, each with its test
and a matching `.examples.json` (same example names in both). Point the route's `validate.payload` and `response.status[201]` at them the way the existing beta
routes do. No `tags`, no `hapi-swagger` block. Add the path to `beta-2/openapi.json`, `$ref`-ing
both schemas and their named examples.

**Adding or changing a response** — the change starts here, exactly like a request: edit or
create `<category>/<route>-response.schema.json` (property-level examples go in `examples: [...]`,
not OpenAPI's `example`, which ajv's strict mode rejects; whole-body ones go in its
`.examples.json`), update its test, point the route's `response.status[201]` at
it, and add a route test that makes the handler return a non-conforming body and expects a 500.
`beta-2/openapi.json` picks it up by `$ref` — point the operation's 201 at the file (and its
named examples) if it doesn't already; don't redefine the response in the spec.

Run the full `npm test` rather than an ad-hoc Jest invocation — the suites share one in-memory
MongoDB and need the flags `npm test` already passes.
