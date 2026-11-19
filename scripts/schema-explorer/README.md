# Schema explorer

Generates an interactive page per API version (`beta-1`, `beta-2`, …) that draws each request and response
body as a block diagram. Every `$ref` fragment is resolved, `oneOf` / `anyOf` / `if`-`then`-`else` become
readable rules, and the page shows where each shared fragment under `common/` is reused. A switcher in the
sidebar moves between versions, staying on the same endpoint where it exists.

Every endpoint and fragment page also has a **Try it** view: an editor, pre-filled from the schema's
examples, that checks the JSON as you type. It uses the API's own compiled schemas (the same ajv, options
and formats as `src/schemas/validate/index.js`) and reduces the errors the way
`src/schemas/validate/hapi-validator.js` does. So a request body gets the same `errorType`, `pointer` and
`message` list as the API's 400 response. A request body also gets the checks its route runs after the
schema (`withPayloadChecks`): EWC and POP codes against the reference data, the consignment note rule for
hazardous waste, and date-times not being empty or in the future (against the viewer's clock). These are
the API's own functions, bundled for the browser. Each error links to its place in the editor and in the
diagram. Only the body is checked, not headers, path IDs or checks against stored data. Edits are kept in
the viewer's browser.

Try it's code (the compiled validators, error handling and checks, over half of a version's code) is a
separate `try-it.js` beside each page, loaded the first time Try it is opened or pointed at, so the diagrams
don't wait for it. The EWC code list the checks use is bundled as the codes alone (`ewc-codes.js`), not the
utils package's full list with descriptions.

### Legacy (Joi) routes

`--legacy` (on in `npm run docs:schemas`) adds a **legacy** version (shown as **ReceiptOfWaste**; see `VERSION_NAMES` in `build.js`), listed after the beta versions (newest first), for the routes
that still validate with Joi: receive a movement (`POST`/`PUT /movements/{wasteTrackingId}/receive`) and bulk
receive (`POST`/`PUT /bulk/{bulkId}/movements/receive`). There are no JSON Schema files for these, so
`legacy/joi-model.js` reads each Joi schema's own description (`schema.describe()`) into the same model:
fields and limits, `.when()` conditions, `xor`/`or`/`with`/`without` rules, alternatives, and `.custom()` checks
(named where Joi has a description, with the messages they can report; their logic is code, so it isn't
shown). A nested schema matching one of the utils schemas listed in `legacy/schemas.js` is shown as that
shared fragment.

Its **Try it** runs the routes' real Joi schemas in the browser: `legacy/check.js` validates as the routes do
(Joi with `abortEarly` off, then the API's own `validationErrorFormatter`, and per-item errors for bulk
routes), and `legacy/bundle.js` bundles it with esbuild. Errors therefore come back in the legacy API's format,
`{ key, errorType, message }`. The examples come from the utils package's own valid test payload.

Everything is generated from the schema files alone, so it can't drift from them. Within a version, every
`*-request.schema.json` and `*-response.schema.json` is a top-level schema, and everything they reference is
a shared fragment. No OpenAPI spec is read. Each top-level schema's page is named after its file, e.g.
`beta-2/index.html#create-movement-request`.

### What's changed

Built with `--since <git ref>`, each beta version also gets a **What's changed** view comparing its schemas
with the same version at that ref, e.g. `main`:

- **What's changed**, under Overview in the sidebar, lists every request schema, response schema and shared
  fragment that was added, removed or changed. Each changed one lists its fields, with what changed (before
  and after) and a link to the field in the diagram.
- In the diagrams, changed rows have a **new** or **changed** tag, and a dot marks a row with changes
  inside it. Selecting a changed field shows what changed, and what was removed from inside it.
- The sidebar marks changed schemas and fragments, and each one's page links to its changes.

A field counts as changed when anything the page shows for it changed: its type, whether
it's required, its conditions and rules, allowed values, format or pattern, limits, description or the
fragment it uses. A field added or removed with everything inside it is listed once, with a count of the
fields inside. A renamed schema file shows as one removed and one added. The legacy (ReceiptOfWaste)
version isn't compared.

To see what your branch changes:

```sh
npm run docs:schemas -- --since main
```

## Build it locally

```sh
npm run docs:schemas
open .schema-explorer/index.html    # opens the latest version
```

This writes:

```
.schema-explorer/
  index.html                  sends visitors to the latest version, keeping any #link
  beta-1/index.html           beta-1's diagram
  beta-1/try-it.js            beta-1's Try it, loaded when it's opened
  beta-2/index.html
  beta-2/try-it.js
  legacy/index.html           the ReceiptOfWaste (legacy) routes
  legacy/try-it.js
```

The generator uses the repo's own `ajv` and `ajv-formats` to compile the validators for **Try it**, and
`esbuild` (a dev dependency) for the legacy bundle, so run `npm ci` first. To point it at other schemas:

```sh
node scripts/schema-explorer/build.js <schemas> <outDir> --standalone
```

`schemas` is either a folder of versions, whose `beta-N` subfolders are the versions (`src/schemas`), or a
single version's folder (`src/schemas/beta-2`). Versions are sorted by number, and the last one is the
latest.

## Publishing

`.github/workflows/schema-explorer.yml` rebuilds every version's page and deploys them to
GitHub Pages on every push to `main` that touches `src/schemas/**` or this folder. It can also be run by
hand from the Actions tab. A new `beta-N` folder is picked up with no changes here.

The pull request check (`.github/workflows/check-pull-request.yml`) builds the explorer with
`--since origin/<base branch>`, so a schema change that breaks the generator fails the PR. It also:

- writes the changes to the run's summary page (`--changes-md`), and
- attaches the built site to the run as the `schema-explorer` artifact for 14 days. Download it from the
  run's page, unzip it and open `index.html`; the pages work straight from the files.

## Files

- `build.js` is the command line: it finds the versions and writes each one's page.
- `model.js` reads one version's schemas and normalises them into the tree the page uses.
- `template.html` holds the page's styles and script. The generator replaces `__MODEL__` with the data.
- `validators.js` compiles a version's schemas into standalone validation code for **Try it**. Keep its
  ajv options in step with `src/schemas/validate/index.js`.
- `examples/<version>.json` holds extra examples for shared fragments, keyed by schema file (e.g.
  `"common/carrier.schema.json": [ … ]`). They're kept here, not in the schemas, so the documentation stays
  separate from the source. The page offers them after any examples the schema has. Each is checked against
  the API's compiled schema on every build, and an invalid one fails the build with its file and reason.
- `errors.js` turns ajv's errors into the error list **Try it** shows (type, pointer, message), following
  `src/schemas/validate/hapi-validator.js`. The generator inlines it into each page.
- `errors.test.js` checks the explorer reports exactly what the API would, for every schema in every version:
  each example as written, then with each field removed, emptied, given the wrong type or an unknown value,
  and with extra fields. It fails if `validators.js` or `errors.js` drift from `src/schemas/validate/`. Run it
  with `npm run test:schema-explorer`. The PR check and the Pages workflow both run it.
- `checks/routes.js` lists each beta route's request schema and the payload checks it runs after it,
  importing the checks from `src/`. `checks/bundle.js` bundles them, with the utils reference data they use,
  into the pages of versions that have any.
- `checks.test.js` runs every beta route's real payload validation against the page's (schema, errors and
  checks bundle), on each example, every way of breaking each field, unrecognised EWC codes and future
  date-times. It fails if a route is missing from `checks/routes.js` or its checks differ.
- `legacy/schemas.js` lists the legacy route schemas and the utils schemas shown as their fragments.
  `legacy/joi-model.js` turns them into the model; `legacy/check.js` and `legacy/bundle.js` are the legacy
  **Try it**.
- `legacy.test.js` checks the legacy page's bundle reports exactly what `legacy/check.js` does unbundled
  against the real modules, for every example and every way of breaking each field.
- `ewc-codes.js` swaps the utils package's EWC code list for the codes alone in both bundles (the checks
  and legacy). `ewc-codes.test.js` checks it answers exactly as the real one for every code.
- `fields.js` describes each field as text (type, required, rules, limits…), for `changes.js` to compare.
- `changes.js` compares a version's model with an earlier build of it for **What's changed**, and writes the
  Markdown summary. `changes.test.js` checks it finds known edits to a copy of beta-2.
- `test-cases.js` makes the broken payloads the tests use.
