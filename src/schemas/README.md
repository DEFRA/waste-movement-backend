# Schemas

Every `beta-` request payload is defined **once**, as a [JSON Schema](https://json-schema.org/)
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

**OpenAPI 3.0 can't express what these schemas need.** `const`, `propertyNames` and
boolean-`false` subschemas are what encode rules like "Household forbids these fields" and
"exactly one of `authorisationNumber` / `reasonForNoAuthorisationNumber`". A 3.0 spec would
describe a looser contract than the one actually enforced. 3.1 is required, not preferred.

`hapi-swagger` is not part of this — it can't consume JSON Schema and can't emit 3.1. It serves
the legacy routes only, and finds them by a route tag, so **beta routes carry no `tags`**.

### `$id` equals the file's path relative to `src/schemas/`

```json
"$id": "beta-2/common/producer/producer.schema.json"
```

Schemas are registered in one shared namespace, which rejects duplicate `$id`s. Deriving `$id`
from the file path does three things at once:

1. **Collisions become impossible** — two files can't share a path.
2. **Both versions share one registry**, so `validate/` sits above `beta-1/` and `beta-2/`
   rather than being duplicated per version.
3. **Relative `$ref`s just work**, because they resolve against the `$id` base — within a folder
   (`producer-base.schema.json`) and across one (`../common/producer/producer.schema.json`). A
   schema can be copied to another repo with its refs untouched.

This is checked when schemas are loaded, so a mismatch fails at startup rather than surfacing as
a confusing 404 later.

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

## Layout

```
src/schemas/
  validate/          loads every *.schema.json and adapts it to a Hapi route validator
  beta-1/            one flat file per request shape (tests in beta-1.test.js)
  beta-2/
    common/          shared resources — address, contact-details, producer/
    creation/        whole request payloads, $ref-ing the resources above
```

`beta-2`'s categories (`common/`, `creation/`, and later `collection/`, `delivery/`, `receipt/`)
mirror `digital-waste-tracking-api-docs`, which is the sandbox these resources are prototyped in.
Keeping the trees identical is what lets a resource move across unchanged.

**`beta-1` vs `beta-2`**: same mechanism, different shape. beta-1's payloads are trivial (an
`apiCode`, a list of ids, a `reason`) so they stay flat, with one file per request shape; it was
converted off Joi so both versions run one mechanism, not because it's where modelling happens.
**New work goes in `beta-2`.**

## Making a change

**Changing a rule** — edit the `.schema.json`, update or add the named case in its `.test.js`.
If the rule is about one field, it belongs in the schema. If it spans two resources or two
endpoints, it doesn't — that stays in service code. A schema describes one resource.

**Adding a resource** — create `beta-2/<category>/<name>.schema.json` with the 2020-12 `$schema`,
an `$id` equal to its path relative to `src/schemas/`, a `title` and `description`, a
`description` on every property, and `"additionalProperties": false` if it's a whole payload.
Add `<name>.test.js` beside it. There's no registration step — the loader walks the directory.

**Adding a request shape** — schema under the right category, then point the route's
`validate.payload` at it the way the existing beta routes do. No `tags`, no `hapi-swagger` block.

Run the full `npm test` rather than an ad-hoc Jest invocation — the suites share one in-memory
MongoDB and need the flags `npm test` already passes.
