#!/usr/bin/env node
// Builds the schema explorer: a static HTML page per API version that draws
// every request and response schema in its OpenAPI document as a block diagram,
// with $ref fragments resolved and oneOf / anyOf / if-then-else turned into
// plain rules. The model itself is built by model.js.
//
// Usage: node scripts/schema-explorer/build.js [schemas] [outDir] [--standalone] [--legacy]
//          [--since <git ref>] [--changes-md <file>]
//   schemas       a folder of versions (its beta-N subfolders, e.g.
//                 src/schemas/beta-1 and src/schemas/beta-2), or one version's
//                 folder (default src/schemas). Within a version, every
//                 *-request.schema.json and *-response.schema.json is a
//                 top-level schema; no OpenAPI spec is needed.
//   outDir        where to write (default .schema-explorer). Each version is
//                 written to <outDir>/<version>/index.html, and
//                 <outDir>/index.html sends visitors to the latest version.
//   --standalone  write complete HTML documents (for GitHub Pages); without it
//                 each page is a body for hosts that add their own <head>
//   --legacy      also add a "legacy" version, before the others, for the
//                 Joi-validated receive and bulk-receive routes (legacy/)
//   --since <ref> compare every beta version with the same schemas at a git
//                 ref (e.g. origin/main) and add a "What's changed" view
//                 (changes.js). The legacy version isn't compared.
//   --changes-md <file>
//                 with --since, also write the changes as Markdown, e.g. for a
//                 CI job summary

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { buildModel } from './model.js'
import { buildValidators } from './validators.js'
import { buildLegacyBundle } from './legacy/bundle.js'
import { buildChecksBundle } from './checks/bundle.js'
import { checkedFiles } from './checks/routes.js'
import { buildLegacyModel } from './legacy/joi-model.js'
import { compareModels, changesMarkdown } from './changes.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const standalone = args.includes('--standalone')
const legacy = args.includes('--legacy')
const VALUE_FLAGS = ['--since', '--changes-md']
const valueOf = (flag) =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined
const since = valueOf('--since')
const changesMd = valueOf('--changes-md')
const [schemasArg = 'src/schemas', outArg = '.schema-explorer'] = args.filter(
  (a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1])
)
const schemasRoot = path.resolve(schemasArg)
const outDir = path.resolve(outArg)

// Versions are the beta-N subfolders (the same rule as the docs repo's schema
// sync); a folder without any is taken to be one version itself. Sorted with
// numeric awareness so beta-10 comes after beta-9; the last is the latest.
const VERSION_FOLDER = /^beta-\d+$/
const subfolders = fs
  .readdirSync(schemasRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory() && VERSION_FOLDER.test(e.name))
  .map((e) => path.join(schemasRoot, e.name))
  .sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b), 'en', { numeric: true })
  )
const versionDirs = subfolders.length ? subfolders : [schemasRoot]

// Extra examples for fragments live with the explorer (examples/<version>.json,
// keyed by schema file), not in the schemas. Each must be valid: a schema
// change that breaks one fails the build, so the page never offers a bad one.
const extraExamplesFor = (slug, validators) => {
  const file = path.join(here, 'examples', `${slug}.json`)
  if (!fs.existsSync(file)) return {}
  const byFile = JSON.parse(fs.readFileSync(file, 'utf8'))
  const problems = Object.entries(byFile).flatMap(([schema, examples]) =>
    examples.flatMap((example, i) => {
      const errors = validators.check(schema, example)
      return errors
        ? [
            `${schema} example ${i + 1}: ${errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`
          ]
        : []
    })
  )
  if (problems.length) {
    throw new Error(
      `Invalid examples in ${path.relative(process.cwd(), file)}:\n  ${problems.join('\n  ')}`
    )
  }
  return byFile
}

// Each version is published under its folder name, e.g. beta-2/.
const versions = versionDirs.map((dir) => {
  const slug = path.basename(dir)
  const validators = buildValidators(dir)
  const extraExamples = extraExamplesFor(slug, validators)
  return { dir, slug, validators, model: buildModel(dir, { extraExamples }) }
})
// The legacy (Joi) routes come first, as the oldest. Their "Try it" runs the
// routes' own Joi schemas, bundled for the browser.
if (legacy) {
  versions.unshift({
    slug: 'legacy',
    model: buildLegacyModel(),
    bundle: await buildLegacyBundle()
  })
}

// The name each version is shown under (the switcher and headings), by folder. A version not listed keeps its own name. The folders, and
// so the URLs, don't change.
const VERSION_NAMES = {
  legacy: 'ReceiptOfWaste'
}
// The name each top-level schema is shown under, in the order the navigation
// lists them, by file name without "-request" / "-response", so a request and
// its response share a name. Schemas not listed keep their own title and come
// after these.
const ROOT_NAMES = {
  'create-movement': 'Creation',
  'create-collection': 'Collection',
  'record-delivery': 'Delivery',
  'record-receipt': 'Receipt',
  'record-receipt-undocumented': 'Receipt (undocumented)',
  // beta-1's name for the undocumented receipt.
  'record-receipt-without-delivery': 'Receipt (undocumented)'
}
const rootKey = (r) => r.id.replace(/-(request|response)$/, '')
const rootOrder = (r) => {
  const i = Object.keys(ROOT_NAMES).indexOf(rootKey(r))
  return i === -1 ? Infinity : i
}

const nameRoots = (model) => {
  for (const r of model.roots) {
    const name = ROOT_NAMES[rootKey(r)]
    if (name) r.title = r.label = name
  }
  // Stable, so schemas not listed keep their order.
  model.roots.sort((a, b) => rootOrder(a) - rootOrder(b))
}
for (const { slug, model } of versions) {
  if (VERSION_NAMES[slug]) model.api.version = VERSION_NAMES[slug]
  nameRoots(model)
}
const latest = versions.at(-1)

// --since: the schemas folder as it is at that ref, from git, in a temporary
// folder, and a label for it like "origin/main (1a2b3c4)".
const git = (...gitArgs) =>
  execFileSync('git', gitArgs, {
    cwd: schemasRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1 << 28
  })
const baseSchemas = (ref) => {
  const top = git('rev-parse', '--show-toplevel').toString().trim()
  const rel = path.relative(top, schemasRoot).split(path.sep).join('/')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-explorer-base-'))
  const short = git('rev-parse', '--short', ref).toString().trim()
  const label = short.startsWith(ref) ? short : `${ref} (${short})`
  try {
    execFileSync('tar', ['-x', '-C', tmp], {
      input: execFileSync('git', ['archive', '--format=tar', ref, '--', rel], {
        cwd: top,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1 << 28
      })
    })
  } catch {
    // The folder isn't there at that ref: everything in it is new.
    return { dir: null, label }
  }
  return { dir: path.join(tmp, rel), label }
}
if (since) {
  const base = baseSchemas(since)
  for (const v of versions.filter((x) => x.dir)) {
    const dir =
      base.dir && (subfolders.length ? path.join(base.dir, v.slug) : base.dir)
    let before = null
    if (dir && fs.existsSync(dir)) {
      before = buildModel(dir)
      nameRoots(before)
    }
    v.model.changes = compareModels(before, v.model, base.label)
  }
  if (changesMd) {
    fs.writeFileSync(
      changesMd,
      changesMarkdown(
        versions
          .filter((v) => v.model.changes)
          .map((v) => ({
            slug: v.slug,
            name: v.model.api.version ?? v.slug,
            changes: v.model.changes
          })),
        { siteUrl: process.env.SITE_URL }
      )
    )
  }
}

// The order versions are listed in: beta-N newest first, then anything else
// (the legacy ReceiptOfWaste routes) last.
const betaNumber = (v) => Number(/^beta-(\d+)$/.exec(v.slug)?.[1] ?? -1)
const listed = [...versions].sort((a, b) => betaNumber(b) - betaNumber(a))

// The checks some routes run after the schema (checks/routes.js), bundled once
// and embedded only in the versions that have any.
const checksBundle = versions.some((v) => checkedFiles(v.slug).length)
  ? await buildChecksBundle()
  : ''

const toDocument = (body, head = '') => {
  if (!standalone) return body
  // Everything before the page shell (title, fonts, styles) belongs in <head>.
  const split = body.indexOf('<div class="shell">')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}${split > 0 ? body.slice(0, split).trim() : ''}
</head>
<body>
${split > 0 ? body.slice(split) : body}
</body>
</html>
`
}

const template = fs.readFileSync(path.join(here, 'template.html'), 'utf8')

// ajv's standalone code is CommonJS and needs a few runtime modules; give it
// both in the browser. ucs2length is ajv's string length in Unicode code
// points. Function formats such as date-time are read from ajv-formats' own
// formats module, which has no imports, so it is embedded as it is.
const require = createRequire(import.meta.url)
const commonJsModule = (name) => `(() => {
    const exports = {}
    ${fs.readFileSync(require.resolve(name), 'utf8')}
    return exports
  })()`
const RUNTIME = {
  'ajv-formats/dist/formats': commonJsModule('ajv-formats/dist/formats'),
  'ajv/dist/runtime/ucs2length': `{ default: (str) => {
    let length = 0
    for (let pos = 0; pos < str.length; length++) {
      const value = str.charCodeAt(pos++)
      if (value >= 0xd800 && value <= 0xdbff && pos < str.length && (str.charCodeAt(pos) & 0xfc00) === 0xdc00) pos++
    }
    return length
  } }`
}
const browserValidators = (code) => {
  const needed = [
    ...new Set([...code.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))
  ]
  const missing = needed.filter((name) => !RUNTIME[name])
  if (missing.length) {
    throw new Error(
      `Validators need runtime modules the page doesn't provide: ${missing.join(', ')}`
    )
  }
  return `window.schemaValidators = (() => {
  const runtime = { ${needed.map((name) => `${JSON.stringify(name)}: ${RUNTIME[name]}`).join(',\n')} }
  const require = (name) => runtime[name]
  const exports = {}
  ${code.replace(/<\//g, '<\\/')}
  return exports
})()`
}

// errors.js turns ajv's errors into the page's error list. It's a plain module
// (so errors.test.js can import it); the page gets it as window.schemaErrors.
const errorsSource = fs.readFileSync(path.join(here, 'errors.js'), 'utf8')
const errorsExports = [...errorsSource.matchAll(/^export const (\w+)/gm)].map(
  (m) => m[1]
)
if (
  (errorsSource.match(/^export /gm) || []).length !== errorsExports.length ||
  /^import /m.test(errorsSource)
) {
  throw new Error('errors.js must have no imports and export only consts')
}
const browserErrors = `window.schemaErrors = (() => {
${errorsSource.replace(/^export const/gm, 'const').replace(/<\//g, '<\\/')}
  return { ${errorsExports.join(', ')} }
})()`

for (const { slug, model, validators, bundle } of versions) {
  const dir = path.join(outDir, slug)
  fs.mkdirSync(dir, { recursive: true })

  // Lets the page switch between versions; links are relative to this page.
  model.versions = listed.map((v) => ({
    version: v.model.api.version ?? v.slug,
    href: `../${v.slug}/index.html`,
    current: v.slug === slug
  }))

  // The "Try it" view validates with the same compiled schemas as the API, or
  // for legacy, the same Joi schemas.
  if (validators) model.validators = validators.ids
  const checks = checkedFiles(slug).length ? checksBundle : ''
  if (checks) model.checks = { version: slug, files: checkedFiles(slug) }

  const page = template
    .split('__ERRORS__')
    .join(
      bundle
        ? ''
        : browserErrors + (checks && `\n${checks.replace(/<\//g, '<\\/')}`)
    )
    .split('__VALIDATORS__')
    .join(
      bundle
        ? bundle.replace(/<\//g, '<\\/')
        : browserValidators(validators.code)
    )
    .split('__MODEL__')
    .join(JSON.stringify(model).replace(/</g, '\\u003c'))
  const file = path.join(dir, 'index.html')
  fs.writeFileSync(file, toDocument(page))
  console.log(
    `Schema explorer (${slug}): ${model.roots.length} roots, ${model.fragments.length} fragments -> ${path.relative(process.cwd(), file)}`
  )
}

// The site root sends visitors to the latest version, keeping any #deep-link.
const target = `${latest.slug}/index.html`
fs.writeFileSync(
  path.join(outDir, 'index.html'),
  toDocument(
    `<p>Opening <a href="${target}">${latest.model.api.version ?? latest.slug}</a>. All versions: ${listed
      .map(
        (v) =>
          `<a href="${v.slug}/index.html">${v.model.api.version ?? v.slug}</a>`
      )
      .join(', ')}.</p>
<script>location.replace(${JSON.stringify(target)} + location.hash)</script>`,
    `<title>Schema Explorer</title>\n<meta http-equiv="refresh" content="0; url=${target}">\n`
  )
)
console.log(
  `Schema explorer index -> ${path.relative(process.cwd(), path.join(outDir, 'index.html'))} (opens ${latest.slug})`
)
