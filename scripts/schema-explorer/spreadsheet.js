// Turns the schema explorer model into flat spreadsheet tabs: an About tab, a
// schema index, a fragment usage matrix, a fragment index, one tab per
// request schema and one tab per shared fragment. Each field tab lists every
// field path, fully expanded, with its type, requirement, rules and limits.

import { STYLE, writeXlsx } from './xlsx.js'

const plain = (text) => (text ?? '').replace(/`/g, '')
const displayPath = (p) => p.replace(/<([^>]+)>/g, ' ($1)')
const fragmentId = (file) =>
  file
    .split('/')
    .pop()
    .replace(/\.schema\.json$/, '')

const ruleText = (rule) =>
  plain(
    rule.text ??
      rule.cases
        .map(
          (c) =>
            `${c.when} → ${c.effects.join('; ') || 'no further constraints'}`
        )
        .join('. ')
  )

const typeText = (node) => {
  if (node.type === 'array') {
    const items = node.items
    if (!items) return 'array'
    const inner =
      items.type === 'object' || items.type === 'variants'
        ? items.title || 'object'
        : typeText(items)
    return `array of ${inner}`
  }
  if (node.type === 'variants') return `one of ${node.options.length}`
  if (node.type === 'object') {
    return node.title ? `object (${node.title})` : 'object'
  }
  return node.type + (node.nullable ? ' | null' : '')
}

const count = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`

const limits = (node) => {
  const c = node.constraints ?? {}
  const min = []
  const max = []
  if (c.minLength !== undefined) min.push(count(c.minLength, 'char'))
  if (c.maxLength !== undefined) max.push(count(c.maxLength, 'char'))
  if (c.minimum !== undefined) min.push(`≥ ${c.minimum}`)
  if (c.exclusiveMinimum !== undefined) min.push(`> ${c.exclusiveMinimum}`)
  if (c.maximum !== undefined) max.push(`≤ ${c.maximum}`)
  if (c.exclusiveMaximum !== undefined) max.push(`< ${c.exclusiveMaximum}`)
  if (c.minItems !== undefined) min.push(count(c.minItems, 'item'))
  if (c.maxItems !== undefined) max.push(count(c.maxItems, 'item'))
  return { min: min.join(', '), max: max.join(', ') }
}

const allowed = (node) => {
  const c = node.constraints ?? {}
  if ('const' in c) return `= ${JSON.stringify(c.const)}`
  if (c.enum) return c.enum.join(', ')
  return ''
}

const formatText = (node) => {
  const c = node.constraints ?? {}
  const own = [c.format, c.pattern].filter(Boolean).join('  ')
  if (own) return own
  // Arrays of strings (e.g. movementIds) carry the format on their items.
  if (node.type === 'array' && node.items) {
    const ic = node.items.constraints ?? {}
    return [ic.format, ic.pattern].filter(Boolean).join('  ')
  }
  return ''
}

const REQUIRED_LABEL = {
  required: 'Required',
  optional: 'Optional',
  conditional: 'Conditional',
  forbidden: 'Not allowed'
}

const FIELD_COLUMNS = [
  { header: 'Path', width: 46 },
  { header: 'Field', width: 30 },
  { header: 'Type', width: 26 },
  { header: 'Required', width: 12 },
  { header: 'Conditions and rules', width: 60, style: STYLE.wrap },
  { header: 'Allowed values', width: 34, style: STYLE.wrap },
  { header: 'Format or pattern', width: 34 },
  { header: 'Min', width: 12 },
  { header: 'Max', width: 12 },
  { header: 'Description', width: 70, style: STYLE.wrap },
  { header: 'Uses fragment', width: 24 },
  { header: 'Defined in', width: 24 }
]

/**
 * One entry per field (and per variant), depth-first, every fragment expanded,
 * with the text the spreadsheet shows for it. Paths are the model's ("a.b[]",
 * "a<Variant>"). Rules on the top-level object come first, with path ''.
 * changes.js compares these between two builds.
 */
export const fieldEntries = (rootNode, rootDefinedIn) => {
  const entries = []
  const row = ({
    path,
    field,
    depth,
    node,
    required,
    rules,
    description,
    uses,
    definedIn
  }) =>
    entries.push({
      path,
      field,
      depth,
      type: typeText(node),
      required,
      rules,
      allowed: allowed(node),
      format: formatText(node),
      min: limits(node).min,
      max: limits(node).max,
      description: plain(description),
      uses: uses ? fragmentId(uses) : '',
      definedIn: definedIn ? fragmentId(definedIn) : ''
    })

  // Object-level rules belong to the row of the field that holds the object.
  const objectRules = (node) => (node.rules ?? []).map(ruleText)
  const objectOf = (node) =>
    node.type === 'array' && node.items ? objectOf(node.items) : node

  const walk = (node, path, depth, definedIn) => {
    if (node.type === 'array' && node.items) {
      return walk(
        node.items,
        `${path}[]`,
        depth,
        node.items.fragment ?? definedIn
      )
    }
    if (node.type === 'variants') {
      for (const option of node.options) {
        const p = `${path}<${option.label}>`
        row({
          path: p,
          field: node.discriminator
            ? `${node.discriminator} = ${option.label}`
            : option.label,
          depth,
          node: option.node,
          required: 'Variant',
          rules: [
            node.discriminator
              ? `Applies when ${node.discriminator} is ${JSON.stringify(option.label)}. Exactly one variant applies.`
              : 'Exactly one variant applies.',
            ...objectRules(option.node)
          ].join('\n'),
          description: option.node.description,
          uses: option.node.fragment,
          definedIn
        })
        walk(option.node, p, depth + 1, option.node.fragment ?? definedIn)
      }
      return
    }
    if (node.type !== 'object') return
    for (const f of node.fields) {
      const p = path ? `${path}.${f.name}` : f.name
      const n = f.node
      const inner = objectOf(n)
      const uses = n.fragment ?? (n.type === 'array' && n.items?.fragment)
      const forbidden = f.req === 'forbidden'
      row({
        path: p,
        field: f.name,
        depth,
        node: n,
        required: REQUIRED_LABEL[f.req],
        rules: [
          ...f.notes.map(plain),
          ...(!forbidden && (inner !== n || inner.type === 'object')
            ? objectRules(inner)
            : [])
        ].join('\n'),
        description: n.description ?? (inner !== n ? inner.description : ''),
        uses,
        definedIn
      })
      // A field this schema forbids has nothing inside it to document here.
      if (!forbidden) walk(n, p, depth + 1, n.fragment ?? definedIn)
    }
  }

  // Rules on the top-level object have no field row to sit on.
  const top = objectOf(rootNode)
  if (top.rules?.length) {
    entries.push({
      path: '',
      field: '(rules on the whole object)',
      depth: 0,
      type: '',
      required: '',
      rules: objectRules(top).join('\n'),
      allowed: '',
      format: '',
      min: '',
      max: '',
      description: '',
      uses: '',
      definedIn: rootDefinedIn ? fragmentId(rootDefinedIn) : ''
    })
  }
  walk(rootNode, '', 0, rootDefinedIn)
  return entries
}

/** What a single value (a primitive fragment) is, in the same terms. */
export const valueEntry = (node) => ({
  type: typeText(node),
  allowed: allowed(node),
  format: formatText(node),
  min: limits(node).min,
  max: limits(node).max,
  description: plain(node.description)
})

const fieldRows = (rootNode, rootDefinedIn) =>
  fieldEntries(rootNode, rootDefinedIn).map((e) => [
    displayPath(e.path),
    { value: e.field, style: STYLE.indent(e.depth) },
    e.type,
    e.required,
    e.rules,
    e.allowed,
    e.format,
    e.min,
    e.max,
    e.description,
    e.uses,
    e.definedIn
  ])

// A primitive fragment (e.g. registration-number) has no fields: one row for itself.
const primitiveRow = (fragment) => {
  const n = fragment.tree
  return [
    '',
    { value: fragment.id, style: STYLE.indent(0) },
    typeText(n),
    '',
    '',
    allowed(n),
    formatText(n),
    limits(n).min,
    limits(n).max,
    plain(fragment.description),
    '',
    fragment.id
  ]
}

/**
 * @param {object} model the schema explorer model built by build.js
 * @param {{ siteUrl?: string }} [options]
 * @returns {Buffer} the .xlsx file
 */
export const buildSpreadsheet = (model, { siteUrl } = {}) => {
  const requests = model.roots.filter((r) => r.kind === 'request')
  const rootById = Object.fromEntries(model.roots.map((r) => [r.id, r]))
  // A top-level schema by its own title, not the API operation it serves.
  const schemaName = (r) => r.title ?? r.label
  const rootLabel = (id) => schemaName(rootById[id])
  const endpointCount = (f) =>
    new Set(
      f.occurrences
        .filter((o) => rootById[o.root].kind === 'request')
        .map((o) => o.root)
    ).size
  const fragments = [...model.fragments].sort((a, b) =>
    a.id.localeCompare(b.id)
  )

  const about = {
    name: 'About',
    columns: [
      { header: 'Item', width: 22 },
      { header: 'Value', width: 100, style: STYLE.wrap }
    ],
    rows: [
      ['Version', model.api.version ?? ''],
      ['Generated', model.generatedAt],
      ['Commit', model.commit ?? ''],
      ['Schema folder', model.schemaDir],
      ...(siteUrl ? [['Interactive diagram', siteUrl]] : []),
      [
        'How to read this',
        'Schemas lists the request schemas. Each request schema tab lists every field path, fully expanded through shared fragments. Each fragment has its own tab. Usage shows which request schemas use each fragment. The file is generated from the JSON Schemas, so edit the schemas, not this file.'
      ],
      [
        'Required',
        'Required: must be sent. Conditional: required or forbidden depending on another value (see Conditions and rules). Optional: may be left out. Not allowed: the shared fragment has this field, but this request schema forbids it. Variant: one branch of a choice, picked by the field named in Field.'
      ]
    ]
  }

  const schemas = {
    name: 'Schemas',
    columns: [
      { header: 'Schema (tab)', width: 40 },
      { header: 'Schema file', width: 56 },
      { header: 'Fields', width: 9 },
      { header: 'Shared fragments', width: 17 },
      { header: 'Rules', width: 9 }
    ],
    rows: requests.map((r) => [
      schemaName(r),
      r.file,
      r.stats.fields,
      r.stats.fragments,
      r.stats.rules
    ])
  }

  const usage = {
    name: 'Usage',
    columns: [
      { header: 'Fragment', width: 30 },
      ...requests.map((r) => ({ header: schemaName(r), width: 18 })),
      { header: 'Request schemas', width: 15 },
      { header: 'Total uses', width: 11 }
    ],
    rows: [...model.fragments]
      .sort(
        (a, b) =>
          endpointCount(b) - endpointCount(a) ||
          b.occurrences.length - a.occurrences.length ||
          a.id.localeCompare(b.id)
      )
      .map((f) => [
        f.id,
        ...requests.map((r) => {
          const occ = f.occurrences.filter((o) => o.root === r.id)
          if (!occ.length) return ''
          return `${occ.some((o) => o.direct) ? 'Direct' : 'Nested'} (${occ.length})`
        }),
        endpointCount(f),
        f.occurrences.length
      ])
  }

  const fragmentIndex = {
    name: 'Fragments',
    columns: [
      { header: 'Fragment (tab)', width: 30 },
      { header: 'Title', width: 30 },
      { header: 'Type', width: 18 },
      { header: 'File', width: 56 },
      { header: 'Request schemas', width: 15 },
      { header: 'Total uses', width: 11 },
      { header: 'Referenced directly by', width: 50, style: STYLE.wrap },
      { header: 'Where it appears', width: 80, style: STYLE.wrap },
      { header: 'Description', width: 80, style: STYLE.wrap }
    ],
    rows: fragments.map((f) => [
      f.id,
      f.title,
      typeText(f.tree),
      f.file,
      endpointCount(f),
      f.occurrences.length,
      f.parents.map((p) => p.fragment ?? rootLabel(p.root)).join(', '),
      f.occurrences
        .map((o) => `${rootLabel(o.root)}: ${displayPath(o.path)}`)
        .join('\n'),
      plain(f.description)
    ])
  }

  const requestTabs = requests.map((r) => ({
    name: schemaName(r),
    columns: FIELD_COLUMNS,
    rows: fieldRows(r.tree, null)
  }))

  const fragmentTabs = fragments.map((f) => {
    const complex = ['object', 'array', 'variants'].includes(f.tree.type)
    return {
      name: f.id,
      columns: FIELD_COLUMNS,
      rows: complex ? fieldRows(f.tree, f.file) : [primitiveRow(f)]
    }
  })

  return writeXlsx([
    about,
    schemas,
    usage,
    fragmentIndex,
    ...requestTabs,
    ...fragmentTabs
  ])
}
