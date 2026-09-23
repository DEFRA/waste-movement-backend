---
worth: later
where: src/schemas/beta-2/common/producer/producer.schema.json
added: 2026-09-22
---

# beta-2 JSON Schemas have no public URL for other services to fetch or $ref

The beta-2 schemas are the source of truth for payload validation, but nothing outside this
repo can reach them. `digital-waste-tracking-api-docs` needs them to build its published API
spec, and `waste-movement-external-api` may want them for documentation or codegen. Today the
only way to consume them is to copy the files.

**Why it is unresolved rather than just undone:** the mechanism is a real decision with no
obvious winner, and it drags an `$id` change along with it.

## What has been ruled out

- **npm package** — rejected. Also carries a live drift risk: `waste-movement-utils` is
  already on 1.10.1 here, 1.9.0 in `waste-movement-external-api`, 1.10.2 on npm. Two services
  validating against different versions of the same schema disagree about what is valid.
- **Serving from this service** — `@hapi/inert` is registered and a `directory:` handler with
  `auth: false` would work exactly like hapi-swagger's own routes. But it is not public:
  README line 15 says the service is "not directly accessible externally", and it is reached
  at `waste-movement-backend.<env>.cdp-int.defra.cloud`. The swagger and OpenAPI specs it
  already exposes are unauthenticated _within the protected zone_, not on the internet. Still
  worth doing for internal consumers and local dev — just not an answer to this item.

## Candidates

1. **GitHub Pages from this repo.** Publicly reachable, source of truth stays here, no
   package, no CDP networking change. This repo publishes no Page today — no workflow, no
   `gh-pages` branch; `publish.yml` is a CDP container build plus SonarCloud. Would need a new
   workflow.
2. **Into `digital-waste-tracking-api-docs`' existing Page.** Already live and public at
   `https://defra.github.io/digital-waste-tracking-api-docs` (`gh-pages` branch, `mike deploy`
   in `docs-release.yml`). Avoids a second publication surface, but the files have to get
   there — the unresolved copy-vs-bundle question — and the schemas' canonical home stops
   being this repo.
3. **Proxy through `waste-movement-external-api`.** The only internet-facing service, and it
   already proxies every beta route here via `proxyWasteMovementBackend`. Serves them at
   runtime rather than publishing them, so consumers cannot fetch at build time.

## What settles it

Whether the consumers need these at **build time** or **runtime**. Build-time consumption
(spec assembly, codegen) rules out candidate 3 and points at Pages. Runtime consumption points
at the proxy. Worth confirming with whoever owns the docs build before choosing.

## Rider

Whichever route wins, decide `$id` at the same time. They are currently relative
(`beta-2/common/producer/producer.schema.json`) and `src/schemas/validate/index.js` enforces
that with a hard throw. Relative `$id`s work over HTTP — `$ref`s resolve against the retrieval
URI as long as the directory tree is served intact — but leave the schemas non-self-identifying,
so anything caching by `$id` collides with any other schema at that path. Switching to absolute
`$id`s under a base such as `https://waste-tracking.service.gov.uk/schemas/` (the domain the
RFC9457 plugin already uses for `problems/`) costs one line in the loader's assertion and
requires **no change to any `$ref`** — verified, since AJV resolves relative refs against the
`$id` base either way. It gets harder to retrofit as more schemas land.
