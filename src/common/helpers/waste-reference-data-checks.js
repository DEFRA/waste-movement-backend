import Boom from '@hapi/boom'
import {
  ERROR_TYPE,
  isValidEwcCode,
  isValidHazardousEwcCode
} from '@defra/waste-movement-utils'

// The JSON Schema only checks an EWC code's format (six digits): the lists of
// recognised and hazardous codes are too long to inline there. These check
// each well-formed code against the reference data in waste-movement-utils —
// the list GET /reference-data/ewc-codes serves. Codes in the wrong format
// are left to the schema, which has already reported them.
const wellFormedEwcCode = /^\d{6}$/

const asArray = (value) => (Array.isArray(value) ? value : [])

const wellFormedEwcCodes = (payload) =>
  asArray(payload?.wasteItems).flatMap((wasteItem, itemIndex) =>
    asArray(wasteItem?.classification?.ewcCodes)
      .map((code, codeIndex) => ({ code, itemIndex, codeIndex }))
      .filter(
        ({ code }) => typeof code === 'string' && wellFormedEwcCode.test(code)
      )
  )

export const findUnrecognisedEwcCodes = (payload) =>
  wellFormedEwcCodes(payload)
    .filter(({ code }) => !isValidEwcCode(code))
    .map(({ itemIndex, codeIndex }) => ({
      message: 'must be a recognised EWC code',
      path: [
        'wasteItems',
        String(itemIndex),
        'classification',
        'ewcCodes',
        String(codeIndex)
      ],
      type: ERROR_TYPE.INVALID_VALUE
    }))

// null, "" and leaving a field out all mean it isn't provided.
const isProvided = (value) =>
  value !== undefined && value !== null && value !== ''

const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Hazardous waste needs a consignment note with a code or, failing that, a
// reason for having none. A code in the wrong format still counts as given:
// the schema reports its format. A consignmentNote that isn't an object is
// also left to the schema.
export const findMissingConsignmentNote = (payload) => {
  const isHazardous = wellFormedEwcCodes(payload).some(({ code }) =>
    isValidHazardousEwcCode(code)
  )
  const note = payload?.consignmentNote

  if (!isHazardous) {
    return []
  }
  if (note === undefined) {
    return [
      {
        message:
          "Required when a waste item has a hazardous EWC code, with a 'code' or a 'reasonForNoCode'",
        path: ['consignmentNote'],
        type: ERROR_TYPE.NOT_PROVIDED
      }
    ]
  }
  if (
    !isObject(note) ||
    isProvided(note.code) ||
    isProvided(note.reasonForNoCode)
  ) {
    return []
  }
  return [
    {
      message:
        "Required when a waste item has a hazardous EWC code and 'code' is not provided",
      path: ['consignmentNote', 'reasonForNoCode'],
      type: ERROR_TYPE.NOT_PROVIDED
    }
  ]
}

// Wraps a route's payload validator so these checks are reported alongside
// the schema's own errors, in the same shape, rather than only once the rest
// of the payload is valid. Every payload it wraps (creating a movement,
// recording a receipt without a delivery) carries a consignmentNote.
export const withWasteReferenceDataChecks = (validatePayload) => (payload) => {
  let schemaDetails = []
  try {
    validatePayload(payload)
  } catch (error) {
    if (!Array.isArray(error.details)) {
      throw error
    }
    schemaDetails = error.details
  }

  const details = [
    ...schemaDetails,
    ...findUnrecognisedEwcCodes(payload),
    ...findMissingConsignmentNote(payload)
  ]
  if (details.length === 0) {
    return payload
  }
  const boomError = Boom.badRequest(details.map((d) => d.message).join('. '))
  boomError.details = details
  throw boomError
}
