// Reads one version's JSON Schemas (e.g. src/schemas/beta-2) and builds the
// explorer's model of it: every top-level request and response schema
// (*-request / *-response.schema.json) as a normalised tree, with $ref fragments
// resolved, oneOf / anyOf / if-then-else turned into plain rules, and an index
// of where each shared fragment is used.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const posix = path.posix

const resolveRef = (ref, from) =>
  posix.normalize(posix.join(posix.dirname(from), ref.split('#')[0]))
const fragmentId = (file) => posix.basename(file).replace(/\.schema\.json$/, '')

// ---------------------------------------------------------------------------
// Rule phrasing

const CONSTRAINT_KEYS = [
  'const',
  'enum',
  'pattern',
  'format',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'uniqueItems'
]
const pick = (s) =>
  Object.fromEntries(
    CONSTRAINT_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])
  )
const isEmpty = (s) =>
  s && typeof s === 'object' && !Array.isArray(s) && Object.keys(s).length === 0
const isForbidden = (s) => s?.not && isEmpty(s.not)
const fmt = (v) => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v))
const code = (x) => `\`${x}\``
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const list = (xs, joiner = 'and') =>
  xs.length <= 1
    ? xs.join('')
    : `${xs.slice(0, -1).join(', ')} ${joiner} ${xs.at(-1)}`
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const describeConstraint = (c) => {
  const out = []
  if ('const' in c) out.push(`must be ${fmt(c.const)}`)
  if (c.enum) out.push(`must be one of ${c.enum.map(fmt).join(', ')}`)
  if (c.minItems !== undefined) {
    out.push(`needs at least ${plural(c.minItems, 'item')}`)
  }
  if (c.maxItems !== undefined) {
    out.push(`allows at most ${plural(c.maxItems, 'item')}`)
  }
  if (c.minimum !== undefined) out.push(`must be at least ${c.minimum}`)
  if (c.maximum !== undefined) out.push(`must be at most ${c.maximum}`)
  if (c.exclusiveMinimum !== undefined) {
    out.push(`must be greater than ${c.exclusiveMinimum}`)
  }
  if (c.exclusiveMaximum !== undefined) {
    out.push(`must be less than ${c.exclusiveMaximum}`)
  }
  if (c.minLength !== undefined) {
    out.push(`needs at least ${plural(c.minLength, 'character')}`)
  }
  if (c.maxLength !== undefined) {
    out.push(`allows at most ${plural(c.maxLength, 'character')}`)
  }
  if (c.pattern) out.push('must match a pattern')
  return out
}

// What a oneOf / anyOf branch, or an if / then / else part, says about each property.
const summarise = (b = {}) => {
  const s = { requires: [...(b.required ?? [])], forbids: [], sets: {} }
  for (const [k, v] of Object.entries(b.properties ?? {})) {
    if (isForbidden(v)) s.forbids.push(k)
    else {
      const c = pick(v)
      if (Object.keys(c).length) s.sets[k] = c
    }
  }
  return s
}

const condProps = (s) =>
  Object.entries(s.sets)
    .filter(([, c]) => 'const' in c)
    .map(([k]) => k)
const conditionText = (s) =>
  condProps(s)
    .map(
      (k) =>
        `${code(k)} is ${fmt(s.sets[k].const)}${s.requires.includes(k) ? '' : ' or absent'}`
    )
    .join(' and ')

const effectsByProp = (s, skip = []) => {
  const m = new Map()
  const add = (k, t) => m.set(k, [...(m.get(k) ?? []), t])
  for (const k of s.requires) if (!skip.includes(k)) add(k, 'required')
  for (const k of s.forbids) add(k, 'not allowed')
  for (const [k, c] of Object.entries(s.sets)) {
    if (!skip.includes(k)) for (const t of describeConstraint(c)) add(k, t)
  }
  return m
}
const effectsText = (m) => [...m].map(([k, ts]) => `${code(k)} ${list(ts)}`)
const requiredIn = (...maps) =>
  maps.flatMap((m) =>
    [...m].filter(([, ts]) => ts.includes('required')).map(([k]) => k)
  )

const addNote = (notes, k, t) => {
  notes[k] = [...(notes[k] ?? []), t]
}

const ifRule = (part) => {
  const cond = summarise(part.if)
  const when = conditionText(cond)
  const thenM = effectsByProp(summarise(part.then))
  const elseM = effectsByProp(summarise(part.else))
  const notes = {}
  for (const [k, ts] of thenM) {
    addNote(notes, k, `${cap(list(ts))} when ${when}.`)
  }
  for (const [k, ts] of elseM) addNote(notes, k, `${cap(list(ts))} otherwise.`)
  const cases = [{ when: `When ${when}`, effects: effectsText(thenM) }]
  if (elseM.size) cases.push({ when: 'Otherwise', effects: effectsText(elseM) })
  return {
    kind: 'when',
    label: 'Conditional',
    cases,
    notes,
    condReq: requiredIn(thenM, elseM)
  }
}

const oneOfRule = (branches) => {
  const sums = branches.map(summarise)
  const exclusive =
    sums.length > 1 &&
    sums.every((s) => s.requires.length === 1 && !Object.keys(s.sets).length) &&
    sums.every((s, i) =>
      sums.every((o, j) => i === j || s.forbids.includes(o.requires[0]))
    )
  if (exclusive) {
    const names = sums.map((s) => s.requires[0])
    const notes = {}
    for (const n of names) {
      addNote(
        notes,
        n,
        `Provide this or ${list(names.filter((x) => x !== n).map(code), 'or')}, not both.`
      )
    }
    return {
      kind: 'exactlyOne',
      label: 'Exactly one',
      text: `Provide exactly one of ${list(names.map(code), 'or')}.`,
      notes,
      condReq: names
    }
  }
  const notes = {}
  const maps = []
  const cases = sums.map((s, i) => {
    const when = conditionText(s)
    const m = effectsByProp(s, condProps(s))
    maps.push(m)
    for (const [k, ts] of m) {
      addNote(
        notes,
        k,
        `${cap(list(ts))} when ${when || `option ${i + 1} applies`}.`
      )
    }
    return {
      when: when ? `When ${when}` : `Option ${i + 1}`,
      effects: effectsText(m)
    }
  })
  return {
    kind: 'oneOf',
    label: 'One branch applies',
    cases,
    notes,
    condReq: requiredIn(...maps)
  }
}

const anyOfRule = (branches) => {
  const sums = branches.map(summarise)
  if (
    sums.every(
      (s) =>
        s.requires.length === 1 &&
        !s.forbids.length &&
        !Object.keys(s.sets).length
    )
  ) {
    const names = sums.map((s) => s.requires[0])
    const notes = {}
    for (const n of names) {
      addNote(
        notes,
        n,
        `At least one of ${list(names.map(code), 'or')} is required.`
      )
    }
    return {
      kind: 'atLeastOne',
      label: 'At least one',
      text: `Provide at least one of ${list(names.map(code), 'or')}.`,
      notes,
      condReq: names
    }
  }
  const maps = sums.map((s) => effectsByProp(s))
  return {
    kind: 'anyOf',
    label: 'One or more branches apply',
    cases: maps.map((m, i) => ({
      when: `Option ${i + 1}`,
      effects: effectsText(m)
    })),
    notes: {},
    condReq: requiredIn(...maps)
  }
}

// ---------------------------------------------------------------------------
// Normalising schemas into a tree the page can render

const findDiscriminator = (options) => {
  const first = options[0]?.fields ?? []
  return first
    .map((f) => f.name)
    .find((name) => {
      const values = options.map(
        (o) => o.fields?.find((f) => f.name === name)?.node.constraints?.const
      )
      return (
        values.every((v) => v !== undefined) &&
        new Set(values).size === values.length
      )
    })
}

// Keywords beside a $ref apply as well as the referenced schema (2020-12), so
// a parent can tighten a shared fragment in place, e.g. create-movement's
// wasteItems forbidding the waste item's treatments. Apply those overrides to
// the already-normalised fragment: forbidden fields, newly required fields and
// extra constraints.
const applyOverrides = (node, overrides) => {
  if (node.type === 'variants') {
    for (const o of node.options) applyOverrides(o.node, overrides)
    return
  }
  if (overrides.items && node.type === 'array' && node.items) {
    applyOverrides(node.items, overrides.items)
  }
  if (node.type !== 'object') return
  for (const [name, sub] of Object.entries(overrides.properties ?? {})) {
    const field = node.fields.find((f) => f.name === name)
    if (!field) continue
    if (isForbidden(sub)) {
      field.req = 'forbidden'
      field.notes = [sub.description ?? 'Not allowed here.']
    } else {
      const c = pick(sub)
      if (Object.keys(c).length) {
        field.node.constraints = { ...field.node.constraints, ...c }
      }
    }
  }
  for (const name of overrides.required ?? []) {
    const field = node.fields.find((f) => f.name === name)
    if (field && field.req !== 'forbidden') field.req = 'required'
  }
}

/**
 * Build the model for one version.
 * @param {string} schemaDir one version's folder of schema files
 * @param {{ extraExamples?: Record<string, unknown[]> }} [options]
 *   extraExamples: more examples for fragments, by file, kept with the
 *   explorer rather than in the schemas (see examples/)
 * @returns {object} the model the page and the spreadsheet are built from
 */
export const buildModel = (schemaDir, { extraExamples = {} } = {}) => {
  const cache = new Map()
  const load = (rel) => {
    if (!cache.has(rel)) {
      cache.set(
        rel,
        JSON.parse(fs.readFileSync(path.join(schemaDir, rel), 'utf8'))
      )
    }
    return cache.get(rel)
  }

  const collectObject = (schema, file, acc) => {
    for (const [name, sub] of Object.entries(schema.properties ?? {})) {
      if (!acc.props.has(name) || !isEmpty(sub)) {
        acc.props.set(name, { schema: sub, file })
      }
    }
    for (const r of schema.required ?? []) acc.required.add(r)
    if (schema.additionalProperties === false) acc.closed = true
    if (schema.propertyNames?.enum) acc.closed = true
    for (const part of schema.allOf ?? []) {
      if (part.$ref) {
        const target = resolveRef(part.$ref, file)
        acc.mixins.push(target)
        collectObject(load(target), target, acc)
        // A part's own fields and its if/then/else are read together (an
        // if-only part has no fields, so it just adds its rule).
      } else collectObject(part, file, acc)
    }
    if (schema.if) acc.rules.push(ifRule(schema))
    if (schema.oneOf) acc.rules.push(oneOfRule(schema.oneOf))
    if (schema.anyOf) acc.rules.push(anyOfRule(schema.anyOf))
  }

  const normalize = (schema, file, stack = []) => {
    if (schema.$ref) {
      const target = resolveRef(schema.$ref, file)
      if (stack.includes(target)) {
        return { type: 'any', fragment: target, recursive: true }
      }
      const node = normalize(load(target), target, [...stack, target])
      node.fragment = target
      if (schema.description) node.description = schema.description
      applyOverrides(node, schema)
      return node
    }

    const node = {}
    if (schema.title) node.title = schema.title
    if (schema.description) node.description = schema.description
    const constraints = pick(schema)
    if (Object.keys(constraints).length) node.constraints = constraints
    const types = [].concat(schema.type ?? [])
    if (types.includes('null')) node.nullable = true

    if (schema.oneOf?.length && schema.oneOf.every((b) => b.$ref)) {
      const options = schema.oneOf.map((b) => normalize(b, file, stack))
      const discriminator = findDiscriminator(options)
      return {
        ...node,
        type: 'variants',
        discriminator,
        options: options.map((o) => ({
          label: discriminator
            ? String(
                o.fields.find((f) => f.name === discriminator).node.constraints
                  .const
              )
            : (o.title ?? fragmentId(o.fragment)),
          node: o
        }))
      }
    }

    if (types.includes('array') || schema.items) {
      node.type = 'array'
      if (schema.items) node.items = normalize(schema.items, file, stack)
      return node
    }

    if (
      types.includes('object') ||
      schema.properties ||
      schema.allOf ||
      schema.oneOf ||
      schema.anyOf ||
      schema.if
    ) {
      const acc = {
        props: new Map(),
        required: new Set(),
        rules: [],
        mixins: [],
        closed: false
      }
      collectObject(schema, file, acc)
      const condReq = new Set(acc.rules.flatMap((r) => r.condReq))
      node.type = 'object'
      node.fields = [...acc.props].map(([name, { schema: s, file: f }]) => ({
        name,
        req: acc.required.has(name)
          ? 'required'
          : condReq.has(name)
            ? 'conditional'
            : 'optional',
        notes: acc.rules.flatMap((r) => r.notes[name] ?? []),
        node: normalize(s, f, stack)
      }))
      if (acc.rules.length) {
        node.rules = acc.rules.map(({ notes, condReq: _, ...r }) => r)
      }
      if (acc.closed) node.closed = true
      if (acc.mixins.length) node.mixins = acc.mixins
      return node
    }

    node.type =
      types.filter((t) => t !== 'null').join(' | ') ||
      ('const' in schema ? typeof schema.const : 'any')
    return node
  }

  // ---------------------------------------------------------------------------
  // Roots, usage index and fragment catalogue

  // The top-level schemas are found from the files themselves, not from an
  // OpenAPI spec: every *-request.schema.json and *-response.schema.json is a
  // whole body; everything they reference is a fragment. Each is known by its
  // file name ("create-movement-request"), which is also its page's #link.
  const collectSchemaFiles = (dir) =>
    fs
      .readdirSync(path.join(schemaDir, dir), { withFileTypes: true })
      .flatMap((entry) => {
        const rel = dir ? `${dir}/${entry.name}` : entry.name
        if (entry.isDirectory()) return collectSchemaFiles(rel)
        return entry.name.endsWith('.schema.json') ? [rel] : []
      })
  const roots = collectSchemaFiles('')
    .filter((file) => /-(request|response)\.schema\.json$/.test(file))
    .sort()
    .map((file) => ({
      id: fragmentId(file),
      kind: file.endsWith('-request.schema.json') ? 'request' : 'response',
      file,
      label: load(file).title ?? fragmentId(file)
    }))
  const ids = roots.map((r) => r.id)
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      `Two top-level schemas in ${schemaDir} share a file name: ${ids.join(', ')}`
    )
  }

  const examplesFor = (file) => {
    const exFile = file.replace(/\.schema\.json$/, '.examples.json')
    return fs.existsSync(path.join(schemaDir, exFile)) ? load(exFile) : null
  }

  const occurrences = {}
  const record = (file, root, p, via) => {
    ;(occurrences[file] ??= []).push({
      root,
      path: p,
      direct: !via,
      via: via ? fragmentId(via) : undefined
    })
  }
  const walk = (node, root, p, via) => {
    if (node.fragment && p) record(node.fragment, root, p, via)
    for (const m of node.mixins ?? []) record(m, root, p, node.fragment ?? via)
    const inner = (p && node.fragment) || via
    const stats = { fields: 0, rules: node.rules?.length ?? 0 }
    const add = (s) => {
      stats.fields += s.fields
      stats.rules += s.rules
    }
    if (node.type === 'object') {
      // A forbidden field isn't part of this payload, so it doesn't count as a
      // field or as a use of the fragment it would otherwise hold.
      for (const f of node.fields.filter((f) => f.req !== 'forbidden')) {
        stats.fields++
        add(walk(f.node, root, p ? `${p}.${f.name}` : f.name, inner))
      }
    }
    if (node.type === 'array' && node.items) {
      add(walk(node.items, root, `${p}[]`, inner))
    }
    if (node.type === 'variants') {
      for (const o of node.options) {
        add(walk(o.node, root, `${p}<${o.label}>`, inner))
      }
    }
    return stats
  }

  for (const r of roots) {
    r.tree = normalize(load(r.file), r.file, [r.file])
    r.title = load(r.file).title
    r.examples = examplesFor(r.file)
    r.stats = walk(r.tree, r.id, '', null)
    r.stats.fragments = Object.values(occurrences).filter((occ) =>
      occ.some((o) => o.root === r.id)
    ).length
  }

  const parents = {}
  const scanRefs = (value, from) => {
    if (Array.isArray(value)) return value.forEach((v) => scanRefs(v, from))
    if (!value || typeof value !== 'object') return
    if (typeof value.$ref === 'string' && !value.$ref.startsWith('#')) {
      ;(parents[resolveRef(value.$ref, from)] ??= new Set()).add(from)
    }
    for (const v of Object.values(value)) scanRefs(v, from)
  }
  for (const [file, json] of cache) {
    if (!file.endsWith('.examples.json')) {
      scanRefs(json, file)
    }
  }

  const rootFiles = new Map(roots.map((r) => [r.file, r.id]))
  const fragments = Object.keys(occurrences)
    .sort()
    .map((file) => {
      const raw = load(file)
      return {
        id: fragmentId(file),
        file,
        title: raw.title ?? fragmentId(file),
        description: raw.description,
        examples: [...(raw.examples ?? []), ...(extraExamples[file] ?? [])],
        tree: normalize(raw, file, [file]),
        occurrences: occurrences[file],
        parents: [...(parents[file] ?? [])]
          .sort()
          .map((p) =>
            rootFiles.has(p)
              ? { root: rootFiles.get(p) }
              : { fragment: fragmentId(p) }
          )
      }
    })

  const git = (cmd) => {
    try {
      return execSync(`git ${cmd}`, {
        cwd: schemaDir,
        stdio: ['ignore', 'pipe', 'ignore']
      })
        .toString()
        .trim()
    } catch {
      return null
    }
  }

  const model = {
    // The version is the folder's name, e.g. beta-2.
    api: { version: path.basename(schemaDir) },
    generatedAt: new Date().toISOString(),
    commit:
      process.env.GITHUB_SHA?.slice(0, 7) ?? git('rev-parse --short HEAD'),
    schemaDir: path.relative(process.cwd(), schemaDir) || '.',
    roots,
    fragments
  }

  return model
}
