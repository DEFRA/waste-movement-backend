// Bundles checks/routes.js, with the API's check functions and the reference
// data they use, into one script for the "Try it" view
// (window.schemaChecks.runChecks).
//
// '@defra/waste-movement-utils' is pointed at only the modules the checks use:
// the package's index also exports test helpers (Mongo, uuid…).

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const utilsSrc = path.resolve(
  here,
  '../../../node_modules/@defra/waste-movement-utils/src'
)

// What the checks import from the utils package index.
const UTILS_EXPORTS = {
  'constants/validation-error-categories.js': ['ERROR_TYPE'],
  'constants/ewc-codes.js': ['isValidEwcCode'],
  'constants/pop-names.js': ['isValidPopCode']
}

const shims = {
  name: 'checks-shims',
  setup(b) {
    b.onResolve({ filter: /^@defra\/waste-movement-utils$/ }, () => ({
      path: 'utils',
      namespace: 'shim'
    }))
    b.onLoad({ filter: /^utils$/, namespace: 'shim' }, () => ({
      contents: Object.entries(UTILS_EXPORTS)
        .map(
          ([file, names]) =>
            `export { ${names.join(', ')} } from ${JSON.stringify(path.join(utilsSrc, file))}`
        )
        .join('\n'),
      resolveDir: utilsSrc,
      loader: 'js'
    }))
  }
}

/** @returns {Promise<string>} a script that defines window.schemaChecks */
export const buildChecksBundle = async () => {
  const result = await build({
    entryPoints: [path.join(here, 'routes.js')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'schemaChecksBundle',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
    plugins: [shims],
    logLevel: 'silent'
  })
  return `${result.outputFiles[0].text}\nwindow.schemaChecks = schemaChecksBundle`
}
