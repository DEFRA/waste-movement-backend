import Boom from '@hapi/boom'
import { validEwcCodes } from '@defra/waste-movement-utils'
import {
  findMissingConsignmentNote,
  findUnrecognisedEwcCodes,
  hasHazardousEwcCode,
  withWasteReferenceDataChecks
} from './waste-reference-data-checks.js'

const withCodes = (...ewcCodesPerItem) => ({
  wasteItems: ewcCodesPerItem.map((ewcCodes) => ({
    classification: { wasteDescription: 'Waste', ewcCodes }
  }))
})

const unrecognised = (itemIndex, codeIndex) => ({
  message: 'must be a recognised EWC code',
  path: [
    'wasteItems',
    String(itemIndex),
    'classification',
    'ewcCodes',
    String(codeIndex)
  ],
  type: 'InvalidValue'
})

const schemaError = (details) => {
  const error = Boom.badRequest(details.map((d) => d.message).join('. '))
  error.details = details
  return error
}

const getError = (fn) => {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('expected it to throw')
}

describe('findUnrecognisedEwcCodes', () => {
  test('finds nothing when every code is recognised', () => {
    expect(findUnrecognisedEwcCodes(withCodes(['200101', '200121']))).toEqual(
      []
    )
  })

  test('reports each unrecognised code against its waste item and position', () => {
    expect(
      findUnrecognisedEwcCodes(
        withCodes(['200101'], ['200301', '999999', '999998'])
      )
    ).toEqual([unrecognised(1, 1), unrecognised(1, 2)])
  })

  // The schema has already reported these as format errors.
  test.each(['2001', '20 01 01', '200101*', '', 999999, null])(
    'leaves a code of %p that is not six digits to the schema',
    (code) => {
      expect(findUnrecognisedEwcCodes(withCodes([code]))).toEqual([])
    }
  )

  // The payload hasn't necessarily passed the schema yet.
  test.each([
    ['no payload', undefined],
    ['no waste items', {}],
    ['waste items that are not a list', { wasteItems: 'none' }],
    ['a waste item with no classification', { wasteItems: [{}] }],
    ['a null waste item', { wasteItems: [null] }],
    [
      'EWC codes that are not a list',
      { wasteItems: [{ classification: { ewcCodes: '999999' } }] }
    ]
  ])('finds nothing in a payload with %s', (_, payload) => {
    expect(findUnrecognisedEwcCodes(payload)).toEqual([])
  })
})

describe('hasHazardousEwcCode', () => {
  test('is false when no code is hazardous', () => {
    expect(hasHazardousEwcCode(withCodes(['200301'], ['170504']))).toBe(false)
  })

  test('is true when any code on any waste item is hazardous', () => {
    expect(
      hasHazardousEwcCode(withCodes(['200301'], ['191212', '200121']))
    ).toBe(true)
  })

  test.each([
    ['no waste items', {}],
    ['a waste item with no classification', { wasteItems: [{}] }],
    ['a hazardous code in the wrong format', withCodes(['20 01 21'])]
  ])('is false for %s', (_, payload) => {
    expect(hasHazardousEwcCode(payload)).toBe(false)
  })
})

describe('findMissingConsignmentNote', () => {
  const hazardous = withCodes(['200121'])
  const noteRequired = {
    message:
      "Required when a waste item has a hazardous EWC code, with a 'code' or a 'reasonForNoCode'",
    path: ['consignmentNote'],
    type: 'NotProvided'
  }
  const reasonRequired = {
    message:
      "Required when a waste item has a hazardous EWC code and 'code' is not provided",
    path: ['consignmentNote', 'reasonForNoCode'],
    type: 'NotProvided'
  }

  // Business scenarios are in routes/beta-2/create-movement.test.js; these
  // cover the edges.
  test('needs nothing for non-hazardous waste', () => {
    expect(findMissingConsignmentNote(withCodes(['200101']))).toEqual([])
  })

  test('treats every absolute and mirror hazardous code in the reference data as hazardous, and no others', () => {
    const misclassified = validEwcCodes
      .filter(
        ({ code, isHazardous }) =>
          findMissingConsignmentNote(withCodes([code])).length > 0 !==
          (isHazardous === true)
      )
      .map(({ code, entryTypeDesc }) => `${code} (${entryTypeDesc})`)

    expect(misclassified).toEqual([])
  })

  test('requires a consignment note when any code on any waste item is hazardous', () => {
    expect(
      findMissingConsignmentNote(withCodes(['200101'], ['191212', '191211']))
    ).toEqual([noteRequired])
  })

  test.each([
    ['a null consignment note', null],
    ['a consignment note that is a string', 'CJTILE/A0001'],
    ['a consignment note that is a list', []]
  ])('leaves %s to the schema', (_, consignmentNote) => {
    expect(
      findMissingConsignmentNote({ ...hazardous, consignmentNote })
    ).toEqual([])
  })

  test.each([
    ['neither field', {}],
    ['both empty', { code: '', reasonForNoCode: '' }],
    ['both null', { code: null, reasonForNoCode: null }]
  ])('requires a reason when the note has %s', (_, consignmentNote) => {
    expect(
      findMissingConsignmentNote({ ...hazardous, consignmentNote })
    ).toEqual([reasonRequired])
  })

  test.each([
    ['a code', { code: 'CJTILE/A0001' }],
    ['a code in the wrong format, which the schema reports', { code: 'X' }],
    ['a reason', { reasonForNoCode: 'No note given' }],
    ['a reason and a null code', { code: null, reasonForNoCode: 'No note' }]
  ])('is satisfied by %s', (_, consignmentNote) => {
    expect(
      findMissingConsignmentNote({ ...hazardous, consignmentNote })
    ).toEqual([])
  })

  // Badly formatted codes are left to the schema, including ones that would
  // be hazardous once their spaces were removed.
  test('ignores a hazardous code in the wrong format', () => {
    expect(findMissingConsignmentNote(withCodes(['20 01 21']))).toEqual([])
  })
})

describe('withWasteReferenceDataChecks', () => {
  test('returns the payload when it passes the schema and every code is recognised', () => {
    const payload = withCodes(['200101'])
    const validate = withWasteReferenceDataChecks((value) => value)

    expect(validate(payload)).toBe(payload)
  })

  test('throws a Boom badRequest for an unrecognised code', () => {
    const validate = withWasteReferenceDataChecks((value) => value)
    const error = getError(() => validate(withCodes(['999999'])))

    expect(error.output.statusCode).toBe(400)
    expect(error.message).toBe('must be a recognised EWC code')
    expect(error.details).toEqual([unrecognised(0, 0)])
  })

  test("reports unrecognised codes after the schema's own errors", () => {
    const missingDescription = {
      message: "'wasteDescription' is required",
      path: ['wasteItems', '0', 'classification', 'wasteDescription'],
      type: 'NotProvided'
    }
    const validate = withWasteReferenceDataChecks(() => {
      throw schemaError([missingDescription])
    })
    const error = getError(() => validate(withCodes(['999999'])))

    expect(error.details).toEqual([missingDescription, unrecognised(0, 0)])
    expect(error.message).toBe(
      "'wasteDescription' is required. must be a recognised EWC code"
    )
  })

  test('reports a missing consignment note for hazardous waste', () => {
    const validate = withWasteReferenceDataChecks((value) => value)
    const error = getError(() => validate(withCodes(['200121'])))

    expect(error.details).toEqual([
      expect.objectContaining({
        path: ['consignmentNote'],
        type: 'NotProvided'
      })
    ])
  })

  test('rethrows an error that is not a validation error unchanged', () => {
    const unexpected = new Error('boom')
    const validate = withWasteReferenceDataChecks(() => {
      throw unexpected
    })

    expect(getError(() => validate(withCodes(['999999'])))).toBe(unexpected)
  })
})
