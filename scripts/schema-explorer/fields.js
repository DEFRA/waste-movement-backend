// Describes a schema's fields as text, one entry per field path, fully expanded
// through fragments: its type, whether it's required, its conditions and rules,
// allowed values, format, limits, description and the fragment it uses.
// changes.js compares these between two builds for "What's changed".

const plain = (text) => (text ?? '').replace(/`/g, '')
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

/**
 * One entry per field (and per variant), depth-first, every fragment expanded,
 * with the text that describes it. Paths are the model's ("a.b[]",
 * "a<Variant>"). Rules on the top-level object come first, with path ''.
 * changes.js compares these between two builds.
 */
export const fieldEntries = (rootNode) => {
  const entries = []
  const row = ({ path, field, node, required, rules, description, uses }) =>
    entries.push({
      path,
      field,
      type: typeText(node),
      required,
      rules,
      allowed: allowed(node),
      format: formatText(node),
      min: limits(node).min,
      max: limits(node).max,
      description: plain(description),
      uses: uses ? fragmentId(uses) : ''
    })

  // Object-level rules belong to the row of the field that holds the object.
  const objectRules = (node) => (node.rules ?? []).map(ruleText)
  const objectOf = (node) =>
    node.type === 'array' && node.items ? objectOf(node.items) : node

  const walk = (node, path) => {
    if (node.type === 'array' && node.items) {
      return walk(node.items, `${path}[]`)
    }
    if (node.type === 'variants') {
      for (const option of node.options) {
        const p = `${path}<${option.label}>`
        row({
          path: p,
          field: node.discriminator
            ? `${node.discriminator} = ${option.label}`
            : option.label,
          node: option.node,
          required: 'Variant',
          rules: [
            node.discriminator
              ? `Applies when ${node.discriminator} is ${JSON.stringify(option.label)}. Exactly one variant applies.`
              : 'Exactly one variant applies.',
            ...objectRules(option.node)
          ].join('\n'),
          description: option.node.description,
          uses: option.node.fragment
        })
        walk(option.node, p)
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
        node: n,
        required: REQUIRED_LABEL[f.req],
        rules: [
          ...f.notes.map(plain),
          ...(!forbidden && (inner !== n || inner.type === 'object')
            ? objectRules(inner)
            : [])
        ].join('\n'),
        description: n.description ?? (inner !== n ? inner.description : ''),
        uses
      })
      // A field this schema forbids has nothing inside it to document here.
      if (!forbidden) walk(n, p)
    }
  }

  // Rules on the top-level object have no field row to sit on.
  const top = objectOf(rootNode)
  if (top.rules?.length) {
    entries.push({
      path: '',
      field: '(rules on the whole object)',
      type: '',
      required: '',
      rules: objectRules(top).join('\n'),
      allowed: '',
      format: '',
      min: '',
      max: '',
      description: '',
      uses: ''
    })
  }
  walk(rootNode, '')
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
