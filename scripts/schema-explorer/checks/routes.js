// The checks each beta route runs on a request body after its JSON Schema:
// rules a schema can't say, such as EWC and POP codes against the reference
// data, or a date-time not being in the future (see
// src/schemas/validate/payload-checks.js). The routes pass them to
// withPayloadChecks; here they are listed by version and request schema file,
// so the "Try it" view runs the same ones. checks.test.js fails if any beta
// route's payload validation reports something this doesn't.
//
// The checks are the API's own functions, not copies: the page gets them
// bundled by checks/bundle.js.

import { wasteReferenceDataChecks } from '../../../src/common/helpers/waste-reference-data-checks.js'
import {
  emptyIsNotProvided,
  notInFuture
} from '../../../src/common/helpers/date-time-checks.js'

const receiptDateTime = ['receiptDateTime']

// Every beta route with a request body, with the checks it runs (none for
// most), so checks.test.js can tell a route here without checks from one
// that's missing.
export const routes = {
  'beta-1': [
    {
      method: 'POST',
      path: '/movements',
      file: 'create-movement-request.schema.json',
      checks: []
    },
    {
      method: 'POST',
      path: '/movements/{movementId}/collection',
      file: 'create-collection-request.schema.json',
      checks: []
    },
    {
      method: 'POST',
      path: '/deliveries',
      file: 'record-delivery-request.schema.json',
      checks: []
    },
    {
      method: 'POST',
      path: '/deliveries/{deliveryId}/receipt',
      file: 'record-receipt-request.schema.json',
      checks: []
    },
    {
      method: 'POST',
      path: '/receipts',
      file: 'record-receipt-without-delivery-request.schema.json',
      checks: []
    }
  ],
  'beta-2': [
    {
      method: 'POST',
      path: '/movements',
      file: 'creation/create-movement-request.schema.json',
      checks: [wasteReferenceDataChecks]
    },
    {
      method: 'POST',
      path: '/movements/{movementId}/collection',
      file: 'collection/create-collection-request.schema.json',
      checks: []
    },
    {
      method: 'POST',
      path: '/deliveries',
      file: 'delivery/record-delivery-request.schema.json',
      checks: []
    },
    {
      method: 'POST',
      path: '/deliveries/{deliveryId}/receipt',
      file: 'receipt/record-receipt-request.schema.json',
      checks: [
        emptyIsNotProvided(receiptDateTime),
        notInFuture(receiptDateTime)
      ]
    },
    {
      method: 'POST',
      path: '/receipts',
      file: 'receipt/record-receipt-undocumented-request.schema.json',
      checks: [
        wasteReferenceDataChecks,
        emptyIsNotProvided(receiptDateTime),
        notInFuture(receiptDateTime)
      ]
    }
  ]
}

/**
 * Runs a request body's checks after its schema, as withPayloadChecks does.
 * @param {string} version e.g. "beta-2"
 * @param {string} file the request schema file, relative to the version folder
 * @param {unknown} payload
 * @param {{ message: string, path: string[], type: string }[]} details the
 *   schema's errors, in hapi-validator's detail shape
 * @returns the errors to report, in the same shape
 */
export const runChecks = (version, file, payload, details) =>
  (routes[version] ?? [])
    .filter((route) => route.file === file)
    .flatMap((route) => route.checks)
    .reduce((found, check) => check(payload, found), details)

/** @returns {string[]} the schema files in a version that have checks */
export const checkedFiles = (version) =>
  (routes[version] ?? [])
    .filter((route) => route.checks.length)
    .map((route) => route.file)
