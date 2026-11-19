// The legacy (Joi) schemas the explorer shows: the receive and bulk-receive
// routes' payloads, and the @defra/waste-movement-utils schemas they are built
// from, which the explorer shows as shared fragments.
//
// Both the generator (in Node) and the legacy page's "Try it" bundle (in the
// browser, built by esbuild) import this module, so they see the same schemas.

import { movementSchema } from '../../../src/schemas/movement.js'
import {
  bulkReceiveMovementRequestSchema,
  bulkUpdateMovementRequestSchema
} from '../../../src/schemas/bulk-receipt.js'
import { receiveMovementRequestSchema } from '@defra/waste-movement-utils/src/schemas/receipt.js'
import { addressSchema } from '@defra/waste-movement-utils/src/schemas/address.js'
import { brokerOrDealerSchema } from '@defra/waste-movement-utils/src/schemas/brokerOrDealer.js'
import { carrierSchema } from '@defra/waste-movement-utils/src/schemas/carrier.js'
import { carrierOrBrokerDealerRegistrationNumber } from '@defra/waste-movement-utils/src/schemas/carrierOrBrokerDealerRegistrationNumber.js'
import { hazardousWasteConsignmentCodeSchema } from '@defra/waste-movement-utils/src/schemas/hazardous-waste-consignment.js'
import { producerSchema } from '@defra/waste-movement-utils/src/schemas/producer.js'
import {
  authorisationNumberSchema,
  receiverSchema
} from '@defra/waste-movement-utils/src/schemas/receiver.js'
import { wasteItemsSchema } from '@defra/waste-movement-utils/src/schemas/waste.js'
import { weightSchema } from '@defra/waste-movement-utils/src/schemas/weight.js'

// Top-level request schemas, one per route payload. `bulk` routes report
// errors per item, as src/plugins/error-handler.js does for /bulk/ paths.
export const roots = [
  {
    id: 'receive-movement-request',
    title: 'Receive movement request',
    file: 'src/schemas/movement.js#movementSchema',
    description:
      'Payload for POST and PUT /movements/{wasteTrackingId}/receive.',
    schema: movementSchema,
    bulk: false
  },
  {
    id: 'bulk-receive-movement-request',
    title: 'Bulk receive movement request',
    file: 'src/schemas/bulk-receipt.js#bulkReceiveMovementRequestSchema',
    description: 'Payload for POST /bulk/{bulkId}/movements/receive.',
    schema: bulkReceiveMovementRequestSchema,
    bulk: true
  },
  {
    id: 'bulk-update-movement-request',
    title: 'Bulk update movement request',
    file: 'src/schemas/bulk-receipt.js#bulkUpdateMovementRequestSchema',
    description: 'Payload for PUT /bulk/{bulkId}/movements/receive.',
    schema: bulkUpdateMovementRequestSchema,
    bulk: true
  }
]

// Shared fragments: the utils schemas the routes are built from. A nested
// schema whose description matches one of these is shown as that fragment.
const utils = (file, name) =>
  `@defra/waste-movement-utils/src/schemas/${file}#${name}`
export const fragments = [
  {
    file: utils('receipt.js', 'receiveMovementRequestSchema'),
    schema: receiveMovementRequestSchema
  },
  { file: utils('address.js', 'addressSchema'), schema: addressSchema },
  {
    file: utils('brokerOrDealer.js', 'brokerOrDealerSchema'),
    schema: brokerOrDealerSchema
  },
  { file: utils('carrier.js', 'carrierSchema'), schema: carrierSchema },
  {
    file: utils(
      'carrierOrBrokerDealerRegistrationNumber.js',
      'carrierOrBrokerDealerRegistrationNumber'
    ),
    schema: carrierOrBrokerDealerRegistrationNumber
  },
  {
    file: utils(
      'hazardous-waste-consignment.js',
      'hazardousWasteConsignmentCodeSchema'
    ),
    schema: hazardousWasteConsignmentCodeSchema
  },
  { file: utils('producer.js', 'producerSchema'), schema: producerSchema },
  {
    file: utils('receiver.js', 'authorisationNumberSchema'),
    schema: authorisationNumberSchema
  },
  { file: utils('receiver.js', 'receiverSchema'), schema: receiverSchema },
  { file: utils('waste.js', 'wasteItemsSchema'), schema: wasteItemsSchema },
  { file: utils('weight.js', 'weightSchema'), schema: weightSchema }
]
