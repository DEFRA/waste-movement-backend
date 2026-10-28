// Compares a version's model with the same version built from an earlier
// commit (e.g. main) for the "What's changed" view: which top-level schemas and
// shared fragments were added, removed or changed, and in each, which fields.
//
// Fields are compared by path, on the text the spreadsheet shows for them
// (spreadsheet.js fieldEntries), so a change counts when it would change what a
// reader sees: type, required, conditions and rules, allowed values, format,
// limits, description or the fragment it uses. A field added or removed with
// everything inside it is listed once, with how many fields came with it.

import { fieldEntries, valueEntry } from './spreadsheet.js'

const COMPARED = [
  ['type', 'Type'],
  ['required', 'Required'],
  ['rules', 'Conditions and rules'],
  ['allowed', 'Allowed values'],
  ['format', 'Format or pattern'],
  ['min', 'Min'],
  ['max', 'Max'],
  ['description', 'Description'],
  ['uses', 'Uses fragment']
]

const isComplex = (tree) =>
  ['object', 'variants'].includes(tree.type) ||
  (tree.type === 'array' && ['object', 'variants'].includes(tree.items?.type))

// Every field by path. The whole schema is path '': its own description and
// rules, or for a single value (e.g. registration-number) everything about it.
const entriesOf = (tree) => {
  const fields = isComplex(tree) ? fieldEntries(tree) : []
  const top = fields.find((e) => e.path === '')
  const self = {
    ...(isComplex(tree)
      ? { description: valueEntry(tree).description }
      : valueEntry(tree)),
    rules: top?.rules ?? '',
    field: '(the schema itself)'
  }
  return new Map([
    ['', self],
    ...fields.filter((e) => e.path !== '').map((e) => [e.path, e])
  ])
}

// "a.b" is inside "a", as are "a[]" and "a<Variant>".
const isInside = (path, ancestor) =>
  ancestor !== '' &&
  path.startsWith(ancestor) &&
  /^[.[<]/.test(path.slice(ancestor.length))

// Added and removed fields under one that was itself added or removed are
// folded into it as a count.
const fold = (list) => {
  const kept = []
  for (const change of list) {
    const parent = kept.find(
      (k) => k.status === change.status && isInside(change.path, k.path)
    )
    if (change.status === 'changed') {
      kept.push(change)
    } else if (parent) {
      parent.inside++
    } else {
      kept.push({ ...change, inside: 0 })
    }
  }
  return kept
}

const diffTrees = (before, after) => {
  const was = entriesOf(before)
  const now = entriesOf(after)
  const list = []
  for (const [path, e] of now) {
    const old = was.get(path)
    if (!old) {
      list.push({ path, field: e.field, status: 'added', required: e.required })
      continue
    }
    const diffs = COMPARED.filter(
      ([key]) => (old[key] ?? '') !== (e[key] ?? '')
    ).map(([key, what]) => ({
      what,
      before: old[key] ?? '',
      after: e[key] ?? ''
    }))
    if (diffs.length) {
      list.push({ path, field: e.field, status: 'changed', diffs })
    }
  }
  for (const [path, e] of was) {
    if (!now.has(path)) list.push({ path, field: e.field, status: 'removed' })
  }
  return fold(list)
}

const compareList = (before, after, keyOf, describe) => {
  const was = new Map((before ?? []).map((x) => [keyOf(x), x]))
  const now = new Map(after.map((x) => [keyOf(x), x]))
  const out = []
  for (const [key, x] of now) {
    const old = was.get(key)
    if (!old) out.push({ ...describe(x), status: 'added' })
    else {
      const fields = diffTrees(old.tree, x.tree)
      if (fields.length) out.push({ ...describe(x), status: 'changed', fields })
    }
  }
  for (const [key, x] of was) {
    if (!now.has(key)) out.push({ ...describe(x), status: 'removed' })
  }
  return out
}

/**
 * @param {object | null} before the version's model at the base commit, or
 *   null when the version didn't exist there
 * @param {object} after the version's model now
 * @param {string} base what `before` was built from, e.g. "main (1a2b3c4)"
 */
export const compareModels = (before, after, base) => {
  if (!before) return { base, newVersion: true, roots: [], fragments: [] }
  const roots = compareList(
    before.roots,
    after.roots,
    (r) => r.id,
    (r) => ({ id: r.id, kind: r.kind, title: r.title ?? r.label, file: r.file })
  )
  const fragments = compareList(
    before.fragments,
    after.fragments,
    (f) => f.file,
    (f) => ({ id: f.id, title: f.title, file: f.file })
  )
  return { base, newVersion: false, roots, fragments }
}

/** How many schemas and fragments changed in a comparison. */
export const changeCount = (changes) =>
  changes.newVersion ? 1 : changes.roots.length + changes.fragments.length

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const displayPath = (p) => p.replace(/<([^>]+)>/g, ' ($1)') || '(whole schema)'
const oneLine = (text) =>
  text.length > 80 ? text.slice(0, 79).replace(/\s+\S*$/, '') + '…' : text
const fieldLine = (c) => {
  const where = `\`${displayPath(c.path)}\``
  if (c.status === 'added') {
    return `- ➕ ${where} added${c.required ? ` (${c.required.toLowerCase()})` : ''}${c.inside ? `, with ${plural(c.inside, 'field')} inside` : ''}`
  }
  if (c.status === 'removed') {
    return `- ➖ ${where} removed${c.inside ? `, with ${plural(c.inside, 'field')} inside` : ''}`
  }
  const what = c.diffs.map((d) =>
    ['Required', 'Type', 'Min', 'Max'].includes(d.what) &&
    !d.before.includes('\n') &&
    !d.after.includes('\n')
      ? `${d.what.toLowerCase()} ${d.before || '–'} → ${d.after || '–'}`
      : `${d.what.toLowerCase()} ${oneLine(d.after) ? 'changed' : 'removed'}`
  )
  return `- ✏️ ${where}: ${what.join('; ')}`
}

/**
 * A Markdown summary of every version's changes, for a CI job summary or a PR
 * comment.
 * @param {{ slug: string, name: string, changes: object, href?: string }[]} versions
 */
export const changesMarkdown = (versions, { siteUrl } = {}) => {
  const lines = ['## Schema changes', '']
  const changed = versions.filter((v) => v.changes && changeCount(v.changes))
  if (!changed.length) {
    const base = versions.find((v) => v.changes)?.changes.base
    lines.push(`No schema changes${base ? ` since ${base}` : ''}.`)
    return lines.join('\n') + '\n'
  }
  for (const { slug, name, changes } of changed) {
    const link = siteUrl
      ? `${siteUrl.replace(/\/$/, '')}/${slug}/#changes`
      : null
    lines.push(`### ${link ? `[${name}](${link})` : name}`, '')
    if (changes.newVersion) {
      lines.push(`New version: it isn't in ${changes.base}.`, '')
      continue
    }
    lines.push(`Since ${changes.base}.`, '')
    for (const [label, items] of [
      ['Schemas', changes.roots],
      ['Shared fragments', changes.fragments]
    ]) {
      if (!items.length) continue
      lines.push(`**${label}**`, '')
      for (const item of items) {
        const title = `${item.title}${item.kind ? ` ${item.kind}` : ''} (\`${item.file}\`)`
        if (item.status !== 'changed') {
          lines.push(
            `- ${item.status === 'added' ? '➕' : '➖'} ${title} ${item.status}`
          )
          continue
        }
        lines.push(
          `<details><summary>✏️ ${title}: ${plural(item.fields.length, 'change')}</summary>`,
          ''
        )
        lines.push(...item.fields.map(fieldLine), '', '</details>')
      }
      lines.push('')
    }
  }
  return lines.join('\n') + '\n'
}
