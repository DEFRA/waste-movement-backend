// Test payloads for the explorer's drift tests: an example as written, then
// with each field in turn removed, emptied, given the wrong type or an unknown
// value, and with unexpected extra fields.

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v)

const withChange = (value, at, change) => {
  const copy = structuredClone(value)
  if (!at.length) return change === undefined ? copy : change
  const parent = at.slice(0, -1).reduce((node, key) => node[key], copy)
  const key = at.at(-1)
  if (change !== undefined) parent[key] = change
  else if (Array.isArray(parent)) parent.splice(key, 1)
  else delete parent[key]
  return copy
}

// Each example as it is, then with each field in turn removed, emptied,
// given the wrong type or an unknown value, and with unexpected extra fields.
export const casesFrom = (example) => {
  const cases = [['as written', example]]
  const visit = (value, at) => {
    const name = '/' + at.join('/')
    if (at.length) cases.push([`${name} removed`, withChange(example, at)])
    for (const [label, change] of [
      ['an empty string', ''],
      ['a number', 7],
      ['an unknown word', 'zzz'],
      ['null', null],
      ['an object', {}],
      ['a list', []]
    ]) {
      cases.push([`${name} as ${label}`, withChange(example, at, change)])
    }
    if (isObject(value)) {
      cases.push([
        `${name} with an extra field`,
        withChange(example, [...at, 'unexpectedField'], true)
      ])
      for (const key of Object.keys(value)) visit(value[key], [...at, key])
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, [...at, i]))
    }
  }
  visit(example, [])
  return cases
}
