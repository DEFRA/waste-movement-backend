// The utils package's EWC code module (constants/ewc-codes.js) holds every
// code with its chapter, sub-chapter and description, about 250 KB. The
// checks the pages run only ask whether a code exists and whether it's
// hazardous, so the bundles (checks/bundle.js, legacy/bundle.js) get this
// smaller module in its place: the same two functions over the same codes,
// read from the real module when the page is built, without the text.
// ewc-codes.test.js checks it answers exactly as the real one does.

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ewcCodesFile = path.resolve(
  here,
  '../../node_modules/@defra/waste-movement-utils/src/constants/ewc-codes.js'
)

/** @returns {Promise<string>} the source of the smaller module */
export const ewcCodesModule = async () => {
  const { validEwcCodes } = await import(pathToFileURL(ewcCodesFile).href)
  const codes = validEwcCodes.map((e) => e.code)
  const hazardous = validEwcCodes.filter((e) => e.isHazardous === true)
  return `// Generated from @defra/waste-movement-utils constants/ewc-codes.js.
const all = new Set(${JSON.stringify(codes.join(' '))}.split(' '))
const hazardous = new Set(${JSON.stringify(hazardous.map((e) => e.code).join(' '))}.split(' '))
const normalise = (code) => code.replace(/\\s/g, '')
export const isValidEwcCode = (code) => {
  if (!code) return false
  return all.has(normalise(code))
}
export const isValidHazardousEwcCode = (code) => {
  if (!code) return false
  return hazardous.has(normalise(code))
}
`
}

/** An esbuild plugin that bundles the smaller module in place of the real one. */
export const ewcCodesPlugin = {
  name: 'ewc-codes',
  setup(b) {
    b.onLoad({ filter: /[\\/]constants[\\/]ewc-codes\.js$/ }, async (args) =>
      path.resolve(args.path) === ewcCodesFile
        ? { contents: await ewcCodesModule(), loader: 'js' }
        : undefined
    )
  }
}
