# Clearer beta-2 validation error messages

Branch: `DWTC-220`

## Problem

Review feedback on four beta-2 collection rejections:

1. A broker/dealer entry with both `registrationNumber` and `reasonForNoRegistrationNumber` gets two `must NOT be valid` errors.
2. `brokerOrDealer: { isPresent: true }` with no `items` gets `"items" is required` **and** a spurious `must be equal to constant` on `isPresent` (from the `oneOf` branch the caller didn't pick).
3. An unrecognised `supportingReferences[].label` gets `must be equal to one of the allowed values` without the values.
4. A carrier with neither `registrationNumber` nor `reasonForNoRegistrationNumber` gets both reported as separately required.

Causes: `oneOf` reports every failing branch (2, 4), and Ajv's default wording for `not` / `enum` (1, 3).

## Approach

Fix the cause, not the output:

- Replace these `oneOf`s with `if/then/else`. Ajv evaluates only the branch that applies, so no other-branch errors are reported.
- A `then`/`else` branch or a `{ "not": {} }` exists only to state a condition. Its `description` is written as the error message ("Required when …" / "Not allowed when …") and used verbatim. The `pointer` already names the field, so no string assembly is needed.
- `enum` errors list the allowed values.

The earlier attempt (verbose `parentSchema` branch attribution across `$ref`s, pair merging) was rejected as too complicated. This one adds about 10 lines to the validator.

Out of scope: `producer.schema.json`'s `wasteSource` `oneOf`. It is a real choice between variants, and code generators turn it into a union type.

## Expected results

| Case | pointer                                                 | message                                                                                                 |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1    | `/brokerOrDealer/items/0/reasonForNoRegistrationNumber` | `Not allowed when registrationNumber is provided.`                                                      |
| 2    | `/brokerOrDealer/items`                                 | `Required when isPresent is true.`                                                                      |
| 3    | `/supportingReferences/0/label`                         | `must be one of: Weighbridge Number, PO Number, Job Number, Invoice Number, Waste Ticket Number, Other` |
| 4    | `/carrier/reasonForNoRegistrationNumber`                | `Required when registrationNumber is not provided.`                                                     |

Each produces exactly one error. Error types are unchanged.

## Steps

### 0. Precondition

- [ ] Revert the rejected first attempt to `HEAD`: `src/routes/beta-2/create-collection.test.js`, `src/schemas/conventions.test.js`, `src/schemas/validate/hapi-validator.js`, `src/schemas/validate/hapi-validator.test.js`, `src/schemas/validate/index.js`.

### 1. Schemas: `oneOf` → `if/then/else`

Pair pattern (shown for the registration pair):

```json
"if": { "required": ["registrationNumber"] },
"then": {
  "properties": {
    "reasonForNoRegistrationNumber": {
      "not": {},
      "description": "Not allowed when registrationNumber is provided."
    }
  }
},
"else": {
  "required": ["reasonForNoRegistrationNumber"],
  "description": "Required when registrationNumber is not provided."
}
```

- [ ] `src/schemas/beta-2/common/carrier.schema.json`: registration pair. It already uses `allOf` for the transport `if/then/else`s, so add the pair as another `allOf` entry. Add `then.description` to the existing `vehicleRegistration` ("Required when meansOfTransport is Road.") and `otherMeansOfTransport` ("Required when meansOfTransport is Other.") branches.
- [ ] `src/schemas/beta-2/common/broker-or-dealer/broker-or-dealer-entry.schema.json`: registration pair.
- [ ] `src/schemas/beta-2/common/broker-or-dealer/broker-or-dealer.schema.json`:
  ```json
  "if": { "properties": { "isPresent": { "const": true } }, "required": ["isPresent"] },
  "then": { "required": ["items"], "description": "Required when isPresent is true." },
  "else": {
    "properties": {
      "items": { "not": {}, "description": "Not allowed when isPresent is false or absent." }
    }
  }
  ```
  Move `minItems: 1` onto the top-level `items` property.
- [ ] `src/schemas/beta-2/common/producer/producer-commercial.schema.json` and `producer-municipal.schema.json`: the `authorisationNumber` / `reasonForNoAuthorisationNumber` pair (inside `allOf/1`), same pattern.
- [ ] Update the schema-level `description`s that mention the rule, if their wording assumes `oneOf`.
- [ ] `src/schemas/README.md`: update "No boolean subschemas" (it describes the `oneOf` forbid-pattern) and note that `then`/`else`/`not` descriptions are the error messages.

### 2. Validator

- [ ] `src/schemas/validate/index.js`: add `verbose: true` to the Ajv options, with a comment that it provides `parentSchema` (and also `data`, which must stay out of logs).
- [ ] `src/schemas/validate/hapi-validator.js`:

  ```js
  // A then/else branch or a `{ "not": {} }` only exists to state a condition,
  // and its description says it ("Required when …", "Not allowed when …").
  const isCondition = ({ keyword, schemaPath }) =>
    keyword === 'not' || /\/(then|else)\/[^/]+$/.test(schemaPath)

  function toMessage(error) {
    if (isCondition(error)) {
      return error.parentSchema.description
    }
    switch (error.keyword) {
      case 'required':
        return `"${error.params.missingProperty}" is required`
      case 'enum':
        return `must be one of: ${error.params.allowedValues.join(', ')}`
      default:
        return error.message
    }
  }
  ```

  Update the `'not'` comment in `toErrorType` (it still mentions the `oneOf` branches).

- [ ] `jsonSchemaResponseValidator`: strip `data`, `schema` and `parentSchema` from errors before `logger.error`.

### 3. Tests

- [ ] `src/schemas/conventions.test.js`: every `then`, `else` and `not` subschema has a `description`. This is why `isCondition` needs no fallback.
- [ ] `src/schemas/validate/hapi-validator.test.js`:
  - update the `if/else` expectation (`not` message is now the description) and the `oneOf` carrier case (now one error at `reasonForNoRegistrationNumber`);
  - add a `test.each` for the four reviewer cases, asserting the exact `details` (one entry each);
  - add a test that the response-validation log has no `data` / `schema` / `parentSchema`.
- [ ] `src/routes/beta-2/create-collection.test.js`: change the brokerOrDealer (`isPresent: true` without items; `isPresent: false` with items) and unrecognised-label tests from `toContainEqual` to exact `toEqual` on `result.errors`, including `message`.
- [ ] Existing schema suites (`carrier.test.js`, `broker-or-dealer.test.js`, producer tests, `conventions.test.js` example checks) pass **unchanged**. This proves the rewrite preserved meaning, so if one fails, fix the schema, not the test.

### 4. Verify

- [ ] `npm run lint` and `npm run format:check`.
- [ ] Full suite: `node --no-experimental-require-module ./node_modules/jest/bin/jest.js --runInBand`. The parallel route tests flake on a shared in-memory Mongo with hard-coded IDs such as `25KMT4Z9`; this is unrelated.
- [ ] Run the four reviewer payloads through the validator and compare with the table above.
