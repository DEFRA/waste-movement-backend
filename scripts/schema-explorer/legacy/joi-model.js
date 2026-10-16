// Builds the explorer's model for the legacy (Joi) routes, the same shape
// model.js builds from JSON Schema, so the diagram, search and spreadsheet work
// unchanged. Joi describes itself (schema.describe()); this reads that:
// - keys, items, types and limits (min, max, pattern, valid, email…),
// - .when() as conditions on the field ("Required when … is …"),
// - xor / or / with / without / nand / and / oxor as rules on the object,
// - .custom() checks, named where Joi has a description, with their messages,
// - alternatives as "one of" patterns or as a decision between shapes.
// A nested schema whose description matches one of the utils schemas in
// legacy/schemas.js is shown as that shared fragment.

import { execSync } from 'node:child_process'
import { createMovementRequest } from '@defra/waste-movement-utils/src/test/utils/createMovementRequest.js'
import { check } from './check.js'
import { fragments as FRAGMENTS, roots as ROOTS } from './schemas.js'

const code = (x) => `\`${x}\``
const fmt = (v) => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v))
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const list = (xs, joiner = 'and') =>
  xs.length <= 1
    ? xs.join('')
    : `${xs.slice(0, -1).join(', ')} ${joiner} ${xs.at(-1)}`
const fragmentId = (file) =>
  file
    .split('#')[1]
    .replace(/Schema$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()

// Joi marks some allowed values with { override: true }; they're not values.
const valuesOf = (d) =>
  (d?.allow ?? []).filter(
    (v) => !(v && typeof v === 'object' && 'override' in v)
  )
const ruleArgs = (d, name) => (d.rules ?? []).find((r) => r.name === name)?.args
const regexText = (regex) => {
  const m = /^\/(.*)\/([a-z]*)$/s.exec(regex)
  if (!m) return regex
  return m[2].includes('i') ? `${m[1]}  (case-insensitive)` : m[1]
}

// Fingerprints identify a utils schema wherever it's reused: Joi copies a
// schema when .required() or .label() is called on it, so compare descriptions
// without those top-level flags.
const fingerprint = (d) => {
  const { flags = {}, ...rest } = d
  const { presence, label, ...keep } = flags
  return JSON.stringify({ ...rest, flags: keep })
}
const fragmentByPrint = new Map(
  FRAGMENTS.map((f) => [fingerprint(f.schema.describe()), f.file])
)

// ---------------------------------------------------------------------------
// Conditions and effects

const presenceWord = {
  required: 'required',
  forbidden: 'not allowed',
  optional: 'optional'
}

// "`meansOfTransport` is "Road"" from a when's ref and is.
const conditionText = (w) => {
  const who = code((w.ref?.path ?? []).join('.') || 'value')
  const is = w.is ?? w.not
  const negate = w.not !== undefined
  const values = valuesOf(is)
  let text
  if (values.length) {
    text = `is ${negate ? 'not ' : ''}${list(values.map(fmt), 'or')}`
  } else if (is?.flags?.presence === 'forbidden') {
    text = negate ? 'is provided' : 'is not provided'
  } else if (is?.flags?.presence === 'required' || is?.type === 'any') {
    text = negate ? 'is not provided' : 'is provided'
  } else {
    text = `${negate ? 'does not match' : 'matches'} a ${is?.type ?? 'value'} rule`
  }
  return `${who} ${text}`
}

// What a then / otherwise does to the field it sits on.
const effectText = (d) => {
  if (!d) return null
  const parts = []
  if (d.flags?.presence) parts.push(presenceWord[d.flags.presence])
  const values = valuesOf(d)
  if (values.length && d.flags?.only) {
    parts.push(`must be ${list(values.map(fmt), 'or')}`)
  } else if (values.length) {
    parts.push(`may also be ${list(values.map(fmt), 'or')}`)
  }
  for (const r of d.rules ?? []) {
    if (r.name === 'min') parts.push(`at least ${r.args?.limit}`)
    if (r.name === 'max') parts.push(`at most ${r.args?.limit}`)
    if (r.name === 'pattern') parts.push('must match a pattern')
  }
  if (d.keys) parts.push('must match a different set of fields')
  return parts.length ? parts.join(', ') : null
}

const whenNotes = (whens) => {
  const notes = []
  let condReq = false
  for (const w of whens ?? []) {
    const branches = w.switch
      ? w.switch.map((s) => ({ ...s, ref: w.ref }))
      : [w]
    for (const b of branches) {
      const when = conditionText(b)
      const then = effectText(b.then)
      const otherwise = effectText(b.otherwise)
      if (then) notes.push(`${cap(then)} when ${when}.`)
      if (otherwise) notes.push(`${cap(otherwise)} otherwise.`)
      if (
        b.then?.flags?.presence === 'required' ||
        b.otherwise?.flags?.presence === 'required'
      ) {
        condReq = true
      }
    }
  }
  return { notes, condReq }
}

const DEPENDENCY = {
  xor: [
    'exactlyOne',
    'Exactly one',
    (peers) => `Provide exactly one of ${list(peers, 'or')}.`
  ],
  or: [
    'atLeastOne',
    'At least one',
    (peers) => `Provide at least one of ${list(peers, 'or')}.`
  ],
  oxor: [
    'atMostOne',
    'At most one',
    (peers) => `Provide at most one of ${list(peers, 'or')}.`
  ],
  nand: [
    'notAll',
    'Not all',
    (peers) => `${cap(list(peers))} can't all be provided together.`
  ],
  and: [
    'allOrNone',
    'All or none',
    (peers) => `Provide all of ${list(peers)}, or none of them.`
  ],
  with: [
    'with',
    'Goes with',
    (peers, key) => `When ${key} is provided, ${list(peers)} must be too.`
  ],
  without: [
    'without',
    'Not with',
    (peers, key) =>
      `When ${key} is provided, ${list(peers, 'and')} must not be.`
  ]
}
const peerName = (p) =>
  typeof p === 'string' ? p : (p?.path ?? []).join('.') || String(p)

// ---------------------------------------------------------------------------
// Conversion

const constraintsOf = (d) => {
  const c = {}
  const values = valuesOf(d)
  if (d.flags?.only && values.length === 1) c.const = values[0]
  else if (d.flags?.only && values.length) c.enum = values
  for (const r of d.rules ?? []) {
    const a = r.args ?? {}
    if (d.type === 'string') {
      if (r.name === 'min') c.minLength = a.limit
      if (r.name === 'max') c.maxLength = a.limit
      if (r.name === 'length') c.minLength = c.maxLength = a.limit
      if (r.name === 'pattern') c.pattern = regexText(a.regex)
      if (r.name === 'email') c.format = 'email'
      if (r.name === 'guid' || r.name === 'uuid') c.format = 'uuid'
      if (r.name === 'isoDate') c.format = 'date-time'
      if (r.name === 'uri') c.format = 'uri'
    }
    if (d.type === 'number') {
      if (r.name === 'min') c.minimum = a.limit
      if (r.name === 'max') c.maximum = a.limit
      if (r.name === 'greater') c.exclusiveMinimum = a.limit
      if (r.name === 'less') c.exclusiveMaximum = a.limit
      if (r.name === 'sign') {
        c[a.sign === 'positive' ? 'exclusiveMinimum' : 'exclusiveMaximum'] = 0
      }
    }
    if (d.type === 'array') {
      if (r.name === 'min') c.minItems = a.limit
      if (r.name === 'max') c.maxItems = a.limit
      if (r.name === 'length') c.minItems = c.maxItems = a.limit
    }
  }
  if (d.type === 'date') {
    c.format = [].concat(d.flags?.format ?? 'date').join(' or ')
  }
  return c
}

const customNames = (d) =>
  (d.rules ?? [])
    .filter((r) => r.name === 'custom')
    .map((r) => r.args?.description || null)

const messagesRule = (d) => {
  const messages = Object.entries(d.preferences?.messages ?? {})
  if (!messages.length) return []
  return [
    {
      kind: 'messages',
      label: 'Messages it can report',
      cases: messages.map(([key, message]) => ({
        when: code(key),
        effects: [message.replace(/`/g, "'")]
      }))
    }
  ]
}

const toNode = (d, rootFile) => {
  if (!d) return { type: 'any' }
  const node = {}
  if (d.flags?.label) node.title = d.flags.label
  if (d.flags?.description) node.description = d.flags.description
  const print = fingerprint(d)
  const fragment = fragmentByPrint.get(print)
  if (fragment && fragment !== rootFile) node.fragment = fragment
  const constraints = constraintsOf(d)
  if (Object.keys(constraints).length) node.constraints = constraints
  const values = valuesOf(d)
  if (!d.flags?.only && values.includes(null)) node.nullable = true
  const customs = customNames(d)

  if (d.type === 'alternatives') {
    const options = (d.matches ?? [])
      .map((m) => m.schema ?? m.then)
      .filter(Boolean)
    const allStrings = options.every((o) => o.type === 'string' && !o.keys)
    if (allStrings) {
      const patterns = options
        .map((o) => constraintsOf(o).pattern)
        .filter(Boolean)
      return {
        ...node,
        type: 'string',
        constraints: {
          ...node.constraints,
          ...(patterns.length ? { pattern: patterns.join('\n  or  ') } : {})
        },
        ...(customs.length ? { customs } : {})
      }
    }
    return {
      ...node,
      type: 'variants',
      options: options.map((o, i) => ({
        label: o.flags?.label ?? `Option ${i + 1}`,
        node: toNode(o, rootFile)
      }))
    }
  }

  if (d.type === 'array') {
    const items = d.items ?? []
    node.type = 'array'
    if (items.length === 1) node.items = toNode(items[0], rootFile)
    else if (items.length > 1) {
      node.items = {
        type: 'variants',
        options: items.map((it, i) => ({
          label: it.flags?.label ?? `Option ${i + 1}`,
          node: toNode(it, rootFile)
        }))
      }
    }
    if (customs.length) node.customs = customs
    return node
  }

  if (d.type === 'object') {
    node.type = 'object'
    const rules = []
    const notesByField = {}
    const condReq = new Set()
    for (const dep of d.dependencies ?? []) {
      const kind = DEPENDENCY[dep.rel]
      if (!kind) continue
      const peers = (dep.peers ?? []).map(peerName)
      const key = dep.key ? peerName(dep.key) : null
      const text = kind[2](peers.map(code), key && code(key))
      rules.push({ kind: kind[0], label: kind[1], text })
      for (const p of peers) (notesByField[p] ??= []).push(text)
      if (dep.rel === 'xor' || dep.rel === 'or' || dep.rel === 'with') {
        peers.forEach((p) => condReq.add(p))
      }
    }
    for (const name of customs) {
      rules.push({
        kind: 'custom',
        label: 'Custom check',
        text: name
          ? `${name}, checked in code.`
          : 'Checked in code; see the messages it can report.'
      })
    }
    rules.push(...messagesRule(d))
    node.fields = Object.entries(d.keys ?? {}).map(([name, child]) => {
      const { notes, condReq: conditional } = whenNotes(child.whens)
      const childCustoms = customNames(child)
      const presence = child.flags?.presence
      return {
        name,
        req:
          presence === 'required'
            ? 'required'
            : presence === 'forbidden'
              ? conditional
                ? 'conditional'
                : 'forbidden'
              : conditional || condReq.has(name)
                ? 'conditional'
                : 'optional',
        notes: [
          ...notes,
          ...(notesByField[name] ?? []),
          ...childCustoms.map((c) =>
            c ? `Custom check: ${c}.` : 'Has a custom check in code.'
          )
        ],
        node: toNode(child, rootFile)
      }
    })
    if (!d.flags?.unknown) node.closed = true
    if (rules.length) node.rules = rules
    if (!d.keys) node.fields = []
    return node
  }

  node.type =
    {
      string: 'string',
      number:
        ruleArgs(d, 'integer') !== undefined ||
        (d.rules ?? []).some((r) => r.name === 'integer')
          ? 'integer'
          : 'number',
      boolean: 'boolean',
      date: 'string',
      any: 'any'
    }[d.type] ?? d.type
  if (customs.length) node.customs = customs
  return node
}

// ---------------------------------------------------------------------------
// Usage, stats and examples (as model.js does for JSON Schema)

const walk = (node, root, p, via, occurrences) => {
  if (node.fragment && p) {
    ;(occurrences[node.fragment] ??= []).push({
      root,
      path: p,
      direct: !via,
      via: via ? fragmentId(via) : undefined
    })
  }
  const inner = (p && node.fragment) || via
  const stats = {
    fields: 0,
    rules: node.rules?.filter((r) => r.kind !== 'messages').length ?? 0
  }
  const add = (s) => {
    stats.fields += s.fields
    stats.rules += s.rules
  }
  if (node.type === 'object') {
    for (const f of node.fields.filter((f) => f.req !== 'forbidden')) {
      stats.fields++
      add(walk(f.node, root, p ? `${p}.${f.name}` : f.name, inner, occurrences))
    }
  }
  if (node.type === 'array' && node.items) {
    add(walk(node.items, root, `${p}[]`, inner, occurrences))
  }
  if (node.type === 'variants') {
    for (const o of node.options) {
      add(walk(o.node, root, `${p}<${o.label}>`, inner, occurrences))
    }
  }
  return stats
}

// The first value at an explorer path in an example ("a.b[].c").
const valueAt = (value, explorerPath) => {
  let v = value
  for (const part of explorerPath.split('.')) {
    const [name, ...arrays] = part.split('[]')
    if (name) v = v?.[name]
    for (let i = 0; i < arrays.length; i++) {
      v = Array.isArray(v) ? v[0] : undefined
    }
  }
  return v
}

const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

/** @returns {object} the model for the legacy version */
export const buildLegacyModel = () => {
  const movement = createMovementRequest()
  const examples = {
    'receive-movement-request': {
      testPayload: {
        summary: "The utils package's own valid test receipt",
        value: { movement }
      }
    },
    'bulk-receive-movement-request': {
      twoMovements: {
        summary: 'Two receipts in one request',
        value: [movement, createMovementRequest()]
      }
    },
    'bulk-update-movement-request': {
      twoUpdates: {
        summary:
          'Updates to two existing receipts, each with its waste tracking ID',
        value: [
          { ...movement, wasteTrackingId: '25HRA0B2' },
          { ...createMovementRequest(), wasteTrackingId: '25HRA0B3' }
        ]
      }
    }
  }

  const occurrences = {}
  const roots = ROOTS.map((r) => {
    const tree = toNode(r.schema.describe(), null)
    tree.description = r.description
    const root = {
      id: r.id,
      kind: 'request',
      file: r.file,
      label: r.title,
      title: r.title,
      tree,
      examples: examples[r.id]
    }
    root.stats = walk(tree, r.id, '', null, occurrences)
    root.stats.fragments = Object.values(occurrences).filter((occ) =>
      occ.some((o) => o.root === r.id)
    ).length
    return root
  })

  // Fragments: those used, each with an example taken from where it first
  // appears in a valid root example (kept only if it is valid on its own).
  const fragments = FRAGMENTS.filter((f) => occurrences[f.file]).map((f) => {
    const occ = occurrences[f.file]
    const sample = occ
      .map((o) =>
        valueAt(
          examples[o.root] && Object.values(examples[o.root])[0].value,
          o.path
        )
      )
      .find((v) => v !== undefined)
    const tree = toNode(f.schema.describe(), f.file)
    return {
      id: fragmentId(f.file),
      file: f.file,
      title: tree.title ?? fragmentId(f.file),
      description: tree.description,
      examples:
        sample !== undefined && check(f.file, sample)?.valid ? [sample] : [],
      tree,
      occurrences: occ,
      parents: []
    }
  })

  // Which schemas reference each fragment directly.
  const directIn = (node, out = new Set(), top = true) => {
    if (!top && node.fragment) {
      out.add(node.fragment)
      return out
    }
    for (const f of node.fields ?? []) directIn(f.node, out, false)
    if (node.items) directIn(node.items, out, false)
    for (const o of node.options ?? []) directIn(o.node, out, false)
    return out
  }
  const byFile = new Map(fragments.map((f) => [f.file, f]))
  for (const r of roots) {
    for (const file of directIn(r.tree)) {
      byFile.get(file)?.parents.push({ root: r.id })
    }
  }
  for (const f of fragments) {
    for (const file of directIn(f.tree)) {
      byFile.get(file)?.parents.push({ fragment: f.id })
    }
  }

  return {
    api: { version: 'legacy' },
    generatedAt: new Date().toISOString(),
    commit:
      process.env.GITHUB_SHA?.slice(0, 7) ?? git('rev-parse --short HEAD'),
    schemaDir: 'Joi: src/schemas + @defra/waste-movement-utils',
    legacy: true,
    roots,
    fragments
  }
}
