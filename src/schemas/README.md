# Schemas

Every `beta-` request payload, and every `beta-` 201 response body, is defined **once**, as a [JSON Schema](https://json-schema.org/)
file. That file is the source of truth: the running service validates against it directly, and
everything else about the payload — the OpenAPI spec, the developer documentation, eventually
the business-rules list we share with regulators — is generated from it rather than written out
again by hand.

This document is for people changing these schemas: why the conventions are what they are, and
what to do when you add or change one. For how the wiring actually works, read `validate/`.

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
`reasonForNoAuthorisationNumber`" (with the `if`/`then`/`else` described under
[Conditional rules](#conditional-rules-ifthenelse-not-oneof-or-anyof)). A 3.0 spec would
describe a looser contract than the one actually enforced. 3.1 is required, not preferred.

The legacy (unversioned) routes are described separately, by `openapi.json` at the root of this
folder: a Swagger 2.0 snapshot of what `hapi-swagger` served before it was removed. Nothing
generates it any more, so a change to a legacy route's Joi schema or responses needs a matching
hand edit there. `openapi.test.js` catches the request side drifting: it compares the
spec with each route's Joi `describe()` — routes, parameters, property names, types,
unconditional `required`, enums and array limits — and names every field path that differs.
Most of those request bodies come from `@defra/waste-movement-utils`, so bumping it can fail
this test with no local schema change. Patterns, descriptions, examples and responses aren't
checked.

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
Only standard formats are used, because every JSON Schema consumer already understands them:
`email` and `date-time` in beta-2, `uuid` in beta-1.

This is what makes a schema shareable: a file with a custom `format: "postcode"` in it is
meaningless to anyone who doesn't also have our validator wired up. So postcode, phone number,
SIC code and authorisation number are all long inline `pattern`s.

The consequence to know: **these patterns are owned here and have already diverged from
`waste-movement-utils`' Phase-1 validators.** That divergence is accepted, not a bug to fix by
reaching back into utils.

### No boolean subschemas

To forbid a field under a condition — "no `reasonForNoAuthorisationNumber` alongside an
`authorisationNumber`", "no `items` when `isPresent` is false" — write an explicit
never-matching schema with a description saying why, not a bare `false`:

```json
"reasonForNoAuthorisationNumber": {
  "not": {},
  "description": "Not allowed when 'authorisationNumber' is provided"
}
```

`"field": false` means the same thing and is valid 2020-12 and OpenAPI 3.1, but tools built on
[OpenAPIKit](https://github.com/mattpolzin/OpenAPIKit) — Apple's `swift-openapi-generator`,
OpenAPI Viewer for macOS — can't decode a boolean where they expect a schema object, and reject
the **whole** published spec, since it `$ref`s these files. `{ "not": {} }` validates
identically, so no payload is accepted or rejected differently, and `validate/hapi-validator.js`
maps its `not` error to `NotAllowed` with the field's pointer, as callers already get. Its
description is the error message — see [Conditional rules](#conditional-rules-ifthenelse-not-oneof-or-anyof).

`"additionalProperties": false` is the exception and stays: it's how an object is closed, and
those tools accept a boolean there. `conventions.test.js` fails on any other boolean
subschema.

### Optional means left out, not `null` or `""`

An optional field has one type, and a caller who has no value leaves it out. Don't widen it to
also accept `null` or `""` as "not provided": a field with no single `type` (an
`if`/`then`/`else` on its type, or a `type` list) reads as a string or untyped in generated docs
and code, which is confusing for what is really an optional number.

`pop-component.schema.json`'s `amount` is the case that settled this. ROW's `concentration`
accepted `null` and `""` as not provided, and beta-2 dropped that: `amount` is a plain
`"type": "number"`, and `null`, `""` or `"0.5"` is rejected with `must be number`.

This is about optional fields. A response with nothing to return sends `"data": null`, and its
schema says so with `"type": "null"` (Collection, which mints no ID), not a `["object", "null"]`
list.

### Enum values are `SCREAMING_SNAKE`

Every value in an `enum`, or in a `const` that picks one of them, is upper case with words
separated by `_`: `ROAD`, `INLAND_WATERWAY`, `COMMERCIAL`, `PO_NUMBER`, `MG_PER_KG`. Upper-case
codes fit the same pattern unchanged (`DRU`, `LOO`, `HP_1`, `R13`).

One casing means a caller never has to guess whether a value is `Road`, `road` or `ROAD`, and
the values read as identifiers rather than display text. Title-case values with spaces
(`Inland Waterway`, `PO Number`) look like labels for a screen, and invite callers to send the
label they show their users. Turning a value into display text is the client's job.

This also applies to discriminators: `wasteSource` picks the producer variant, so each variant's
`const` is `HOUSEHOLD`, `COMMERCIAL` or `MUNICIPAL`.

A description or error message that names a value uses the value as it is sent: "Required when
'meansOfTransport' is 'ROAD'", not "… is Road".

Two kinds of value are exempt:

- **`propertyNames` enums** list field names, which are camelCase.
- **`common/issue.schema.json`'s `errorType`** (`NotProvided`, `BusinessRuleViolation`, …). These
  are `waste-movement-utils`' validation error categories, which the legacy routes also return.

`conventions.test.js` fails on any other beta-2 `enum` or `const` string that isn't
`SCREAMING_SNAKE`. beta-1 isn't checked, but already follows it (`HAZARDOUS`, `NON_HAZARDOUS`),
apart from its own copy of `errorType`.

### Field names

Field names are camelCase, and follow four rules so the same kind of field reads the same way
everywhere:

- **Noun first for siblings.** When fields beside each other qualify the same noun, the noun
  comes first, so they sort together: `<noun>`, `<noun>Source`, `<noun>Description`. This only
  applies to siblings; a lone `totalWeight` stays as it is. The `reasonForNo<Identifier>` and
  `other<Field>` fields are the exceptions: see
  [below](#a-number-or-why-there-isnt-one-reasonfornoidentifier) and
  [below](#none-of-the-above-otherfield).
- **Event times are `<event>DateTime`.** The event already says it happened, so there's no
  `actual` prefix. A time that hasn't happened yet keeps its qualifier:
  `planned<Event>DateTime`.
- **True/false fields start with `is`**: `isPresent`, `isEstimate`, `is<Condition>`.
  `conventions.test.js` fails on any beta-2 boolean property that doesn't.
- **Singular or plural matches the data.** An array has a plural name; an object or a single
  value has a singular one. "Details" is a collective noun, so an object can be `<noun>Details`.

### Conditional rules: `if`/`then`/`else`, not `oneOf` or `anyOf`

A rule that depends on another field — "exactly one of `registrationNumber` /
`reasonForNoRegistrationNumber`", "`items` only when `isPresent` is true" — is an
`if`/`then`/`else`, not a `oneOf` of the allowed shapes:

```json
"if": {
  "properties": { "registrationNumber": {} },
  "required": ["registrationNumber"]
},
"then": {
  "properties": {
    "reasonForNoRegistrationNumber": {
      "not": {},
      "description": "Not allowed when 'registrationNumber' is provided"
    }
  }
},
"else": {
  "properties": { "reasonForNoRegistrationNumber": {} },
  "required": ["reasonForNoRegistrationNumber"],
  "description": "Required when 'registrationNumber' is not provided"
}
```

When a `oneOf` fails, ajv reports every branch's errors, including ones from branches the
caller never meant ("must be equal to constant" on an `isPresent: true` that's perfectly
fine). An `if` only ever evaluates the branch that applies, so the caller gets one error about
what they actually sent.

`anyOf` has the same problem. "At least one of `emailAddress` / `phoneNumber`" written as an
`anyOf` of two `required`s reports both as required when neither is sent, which reads as "both
are required". Write it as an `if` on the first field, with the second required in the `else`:

```json
"if": {
  "properties": { "emailAddress": {} },
  "required": ["emailAddress"]
},
"else": {
  "properties": { "phoneNumber": {} },
  "required": ["phoneNumber"],
  "description": "Required when 'emailAddress' is not provided"
}
```

**The description of a `then`, an `else` or a `not` is the error message**, word for word, and
the error's `pointer` names the field — so write it as the condition: "Required when …",
"Not allowed when …". `validate/hapi-validator.js` uses it for any error raised directly by
that subschema; `conventions.test.js` fails if one that can reject has no description (a
`then`/`else` holding only `properties` raises nothing itself, so it's exempt).

That applies only to an error the `then`, `else` or `not` raises itself. A value rule on a field
inside a branch, such as `physical-details`' `containerCount` (`const: 0` when `containerType`
is `'LOO'`, `minimum: 1` otherwise), is reported with the validator's own message
(`must be equal to constant`, `must be >= 1`). A description there documents the rule but never
reaches the caller.

Word it like the validator's own messages (`'receiver' is required`, `must be one of: 'ROAD',
'RAIL'`): **field names and literal values in single quotes, no closing full stop** — "Required
when 'meansOfTransport' is 'ROAD'". JSON literals (`true`, `false`) stay bare. The validator
joins several messages with ". " for the top-level message, so a full stop of their own would
double up. `conventions.test.js` fails on a trailing full stop or a double quote.

The empty `"registrationNumber": {}` declarations are for ajv's strict mode, which rejects a
`required` naming a property the same subschema doesn't declare.

`oneOf` is still right for a genuine choice between variants — `producer.schema.json`'s
Household / Commercial / Municipal — where code generators turn it into a union type. `anyOf`
has no such use here, and `conventions.test.js` fails on any `anyOf`.

### "Is there one?": an `isPresent` object

When a payload says whether something applies, it's an object with a boolean `isPresent`. Its
other fields are required or allowed only when `isPresent` is `true`, and each is
`{ "not": {} }` otherwise:

```json
{ "isPresent": false }

{ "isPresent": true, "…": "the details" }
```

An `if` on `isPresent` with a `then` and an `else` expresses this, as under
[Conditional rules](#conditional-rules-ifthenelse-not-oneof-or-anyof).

Making the object and its `isPresent` required means the caller always answers, and
`{ "isPresent": false }` records "checked, none". Leaving them optional means a caller who sends
nothing is read as "none".

### "A number, or why there isn't one": `reasonForNo<Identifier>`

When a caller may not have an identifier, the schema has the identifier and a
`reasonForNo<Identifier>` beside it, and exactly one of the two is required. It's the
`if`/`then`/`else` under [Conditional rules](#conditional-rules-ifthenelse-not-oneof-or-anyof):
the `then` forbids the reason when the identifier is given, and the `else` requires it when the
identifier isn't.

Both properties' descriptions end with the same sentence: "Exactly one of '<identifier>' or
'reasonForNo<Identifier>' is required."

When "exactly one" depends on another resource, the schema enforces only "not both", and a
[payload check](#rules-a-schema-cant-say-payload-checks) enforces the rest.

### "None of the above": `other<Field>`

When an enum can't list every value a caller might need, it ends with `OTHER`, and the schema
has an `other<Field>` beside it for the caller to say what it is, in free text. The field is
required when the enum is `OTHER` and not allowed otherwise. It's the `if`/`then`/`else` under
[Conditional rules](#conditional-rules-ifthenelse-not-oneof-or-anyof), with the `if` on the
enum's value:

```json
"if": {
  "properties": { "meansOfTransport": { "const": "OTHER" } },
  "required": ["meansOfTransport"]
},
"then": {
  "properties": { "otherMeansOfTransport": {} },
  "required": ["otherMeansOfTransport"],
  "description": "Required when 'meansOfTransport' is 'OTHER'"
},
"else": {
  "properties": {
    "otherMeansOfTransport": {
      "not": {},
      "description": "Not allowed unless 'meansOfTransport' is 'OTHER'"
    }
  }
}
```

`<Field>` is the enum field's name, so the pair reads together: `meansOfTransport` /
`otherMeansOfTransport`. Every enum with an `OTHER` value has one; an `OTHER` with nowhere to
say what it is records nothing.

### Rules a schema can't say: payload checks

Some rules can't be written in a JSON Schema: they need reference data too long to inline (the
EWC and POP code lists in `waste-movement-utils`), or they span resources (a consignment note is
required when any waste item is hazardous). These are **payload checks**: functions
`(payload, details) => details` that a route passes to `withPayloadChecks`
(`validate/payload-checks.js`) along with its schema validator. They run after the schema,
whether or not it passed, and add their errors in the same detail shape to the same 400, so the
caller sees every problem at once.

The schema still checks what it can (an EWC code is six digits); a check adds only what the
schema can't. Checks live with the service code, not in this folder, since they aren't schemas:
the route file's `withPayloadChecks` call names the checks that route runs.

### Granular: one small file per resource

A resource is a thing the model talks about — a producer, an address, contact details. Each gets
its own file; a resource with variants gets a file per variant, tied together with `$ref`:

```
producer.schema.json             the choice between the three variants
producer-base.schema.json        fields all three share (none yet)
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

### Closing a schema built from others

`"additionalProperties": false` rejects any field not listed in the `properties` right beside
it. It doesn't see fields listed inside an `allOf` branch or a `$ref`, so two shapes are closed
differently:

- **A schema built with `allOf`** — the producer variants, which combine `producer-base` with
  their own fields — lists its allowed field names in `"propertyNames": { "enum": [...] }` at its
  root instead. `additionalProperties: false` there would see no fields at all and reject a
  valid producer.
- **An overlay** — a `$ref` to a shared resource plus an extra rule for one endpoint — isn't
  closed at all, because the resource it refers to already is. Creation's `wasteItems` refers to
  `waste-items.schema.json` and adds `treatments: { "not": {} }`, since a movement can't record
  treatments yet. Closing the overlay would reject every other waste item field.

Prefer an overlay to copying a shared resource just to change one rule: the rule stays in one
place, and the endpoint's difference is visible where it's used.

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
so put the fullest example first. The one exception is a base schema with no fields of its own
(`producer-base`), which has nothing to show.

### Field names: same concept, same name

A concept has one field name in every schema and on every endpoint. A party's name is
`organisationName` and its location is `address`, wherever they appear. When the same thing turns up
under a second name, rename one of them so they match. Don't add an alias.

**Sibling fields that qualify the same noun start with that noun**, so related fields sort and
group together:

| Noun         | Fields                            |
| ------------ | --------------------------------- |
| `components` | `components`, `componentsSource`  |
| `container`  | `containerType`, `containerCount` |

The rule only covers siblings. A field with no sibling to group with keeps its natural name, as
`totalWeight` and `intendedCarriers` do.

**An event's time is `<event>DateTime`**: `collectionDateTime`, `receiptDateTime`. The name
doesn't say whether the time is planned or actual; the field's description does. Creating a
movement gives the planned collection time, and recording the Collection gives the actual one,
both as `collectionDateTime`, and each description says which it is and where the other is given.

Known exceptions, kept on purpose or pending a decision (see
`docs/beta-2-spec-consistency-review.md`):

- `receiver.siteName`, not `organisationName`, because a receiver is identified as a site.
- `receiver.receiptAddress`, not `address`, until site naming is decided.
- `carrier.otherMeansOfTransport`, not `meansOfTransportDescription`, because it describes the
  `OTHER` means of transport rather than qualifying `meansOfTransport` in general.
- The `reasonForNoX` family (`reasonForNoRegistrationNumber`, `reasonForNoAuthorisationNumber`,
  `reasonForNoCode`, `reasonForNoDeliveryId`) puts the noun last. These fields are consistent with
  each other, so they get renamed all together or not at all.

### Whole bodies are named after their route

A schema for a whole request or response body is named after the route file it belongs to, with
a `-request` or `-response` suffix — `routes/beta-2/create-collection.js` validates against
`collection/create-collection-request.schema.json` and
`collection/create-collection-response.schema.json`. Every route has exactly one pair, so a
route's whole contract can be found from its file name. Two routes that return the same shape
still get a file each; the second is a `title`, a `description` and a `$ref` to the first
(`record-receipt-undocumented-response` → `record-receipt-response`).

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

The test sits beside the schema, as `<name>.test.js`. A resource split across files in its own
folder (`producer/`, `broker-or-dealer/`) is tested as a whole: one `<folder>.test.js` in that
folder covers the variants and entries, through the schema that ties them together.

### Response schemas

Each beta route also validates its **201** body, via Hapi's `options.response.status[201]`
pointed at the route's `<route>-response.schema.json` (`jsonSchemaResponseValidatorFor` in `validate/`). As with
requests, these files are the source of truth: `beta-2/openapi.json` `$refs` them rather than
defining responses itself, so the published contract and the runtime check are the same file.

- **`data` and `validation`.** Both are required. `validation` is
  `common/validation.schema.json`: a `warnings` list of `issue`s, empty when there are none.
- **201 only.** Error responses are Boom errors, which Hapi doesn't validate, and they are
  problem details, not a modelled body.
- **A mismatch is a 500**, with the generic internal-server-error problem details — no ajv
  internals reach the client. The validator logs `{ schemaId, errors }` at error level first, so
  the failure is alertable. The write has already happened by then: a mismatch is a contract
  bug for tests to catch, not a normal path.
- **Closed, like requests.** Every beta-2 object, in a response or a request, has
  `"additionalProperties": false`. A field the service starts returning has to be added to the
  schema in the same change, or the route returns a 500. That's deliberate: the published
  contract can't drift from the response. beta-1's responses are still open.
- **beta-1 is self-contained.** Its response files inline the ids, `wasteType` and
  `deliveryItem` as `$defs` rather than `$ref`-ing `beta-2/common/`, so changing beta-2 can't
  change beta-1's contract.
- **Legacy routes are untouched.** Response validation is declared per beta route; there is no
  server-wide default. `server.test.js` fails if a beta route ships without a 201 schema.

### The OpenAPI spec lives here too

Each version's spec is `beta-N/openapi.json`, at the root of its version folder, `$ref`-ing the
schemas and named examples beside it by relative path. It's owned here, not in
`digital-waste-tracking-api-site`: that repo copies `beta-*/` (spec, schemas and examples) and
renders it on GitHub Pages, nothing more. So a schema change and the spec change it needs land in
the same PR.

`openapi-betas.test.js` resolves every `$ref` in each spec — schema files, refs between schemas,
example names — and checks the result is a valid OpenAPI 3.1 document. A renamed schema file or a
mistyped example name fails there rather than on the published page.

## Layout

```
src/schemas/
  validate/          loads every *.schema.json, adapts it to a Hapi route validator, and runs
                     payload checks after it
  openapi.json       hand-maintained Swagger 2.0 spec for the legacy (unversioned) routes
  openapi.test.js    checks openapi.json against the legacy routes' Joi validation
  openapi-betas.test.js  resolves every beta-*/openapi.json and validates it as OpenAPI 3.1
  beta-1/            flat: a <route>-request / <route>-response pair per route, plus
                     delivery-id-params (tests in beta-1.test.js), and openapi.json
  beta-2/
    openapi.json     the published spec — $refs everything below
    common/          resources used by more than one endpoint
    creation/        create-movement-request / -response (each with its .examples.json)
    collection/      create-collection-request / -response, and the movementId path params
    delivery/        record-delivery-request / -response, and delivery-item
    receipt/         record-receipt-request / -response,
                     record-receipt-undocumented-request / -response,
                     and the deliveryId path params
```

`digital-waste-tracking-api-site` copies each `beta-*/` folder as-is, so a file's path from
`src/schemas/` is its path there too, and the specs' relative `$ref`s resolve unchanged.

**`beta-1` vs `beta-2`**: same mechanism, different shape. beta-1's payloads are trivial (an
`apiCode`, a list of ids, a `reason`) so they stay flat, with one file per body; it was
converted off Joi so both versions run one mechanism, not because it's where modelling happens.
**New work goes in `beta-2`.**

## Making a change

**Changing a rule** — edit the `.schema.json`, update or add the named case in its `.test.js`.
If the rule is about one resource, it belongs in the schema. If it needs reference data or spans
resources, it's a [payload check](#rules-a-schema-cant-say-payload-checks). If it needs stored
data (the movement exists, its current state), it stays in service code.

**Adding a resource** — create `beta-2/<category>/<name>.schema.json` with the 2020-12 `$schema`,
no `$id`, a `title` and `description`, a `description` on every property, and
`"additionalProperties": false` on every object (see
[Closing a schema built from others](#closing-a-schema-built-from-others) for the exceptions).
Add `<name>.test.js` beside it. There's no registration step — the loader walks the directory,
and the file's path becomes the key routes validate against.

**Adding a route** — add `<category>/<route>-request.schema.json` and
`<category>/<route>-response.schema.json`, named after the new route file, each with its test
and a matching `.examples.json` (same example names in both). Point the route's `validate.payload` and `response.status[201]` at them the way the existing beta
routes do. Add the path to `beta-2/openapi.json`, `$ref`-ing
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
