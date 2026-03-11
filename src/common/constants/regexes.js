// RegEx per Gov UK recommendation: https://assets.publishing.service.gov.uk/media/5a7f3ff4ed915d74e33f5438/Bulk_Data_Transfer_-_additional_validation_valid_from_12_November_2015.pdf
export const UK_POSTCODE_REGEX =
  '^((GIR 0A{2})|((([A-Z]\\d{1,2})|(([A-Z][A-HJ-Y]\\d{1,2})|(([A-Z]\\d[A-Z])|([A-Z][A-HJ-Y]\\d?[A-Z])))) \\d[A-Z]{2}))$' // NOSONAR

// Ireland Eircode regex (routing key + unique identifier)
// Reference: https://www.eircode.ie
export const IRL_POSTCODE_REGEX =
  '^(?:D6W|[AC-FHKNPRTV-Y]\\d{2}) ?[0-9AC-FHKNPRTV-Y]{4}$'

/*
 * Carrier Registration Numbers
 * See src/test/data/carrier-registration-numbers.js for examples
 */
export const ENGLAND_CARRIER_REGISTRATION_NUMBER_REGEX = '^CBD[LU]\\d{3,}$'

export const SEPA_CARRIER_REGISTRATION_NUMBER_REGEX =
  '^((WCR\\/R\\/\\d{7})|((SCO|SEA|SNO|SWE|WCR)\\/\\d{6}))$'

export const NRU_CARRIER_REGISTRATION_NUMBER_REGEX =
  ENGLAND_CARRIER_REGISTRATION_NUMBER_REGEX

export const NI_CARRIER_REGISTRATION_NUMBER_REGEX = '^ROC\\W*[UL]T\\W*\\d{1,5}$'

// England site authorisation number regexes
const ENGLAND_SITE_AUTHORISATION_NUMBER_REGEXES = [
  '^[A-Z]{2}\\d{4}[A-Z]{2}$', // XX9999XX
  '^[A-Z]{2}\\d{4}[A-Z]{2}\\/D\\d{4}$', // XX9999XX/D9999
  '^EPR\\/[A-Z]{2}\\d{4}[A-Z]{2}$', // EPR/XX9999XX
  '^EPR\\/[A-Z]{2}\\d{4}[A-Z]{2}\\/D\\d{4}$', // EPR/XX9999XX/D9999
  '^EAWML\\d{6}$', // EAWML999999
  '^WML\\d{6}$' // WML999999
]

// Scotland (SEPA) site authorisation number regexes
const SCOTLAND_SITE_AUTHORISATION_NUMBER_REGEXES = [
  '^PPC\\/[AWEN]\\/\\d{7}$', // PPC/A/9999999
  '^WML\\/[LWEN]\\/\\d{7}$', // WML/L/9999999
  '^PPC\\/A\\/SEPA\\d{4}-\\d{4}$', // PPC/A/SEPA9999-9999
  '^WML\\/L\\/SEPA\\d{4}-\\d{4}$', // WML/L/SEPA9999-9999
  '^EAS\\/P\\/\\d{6}$' // EAS/P/999999
]

// Wales (NRW) site authorisation number regexes - shares regexes with England
const WALES_SITE_AUTHORISATION_NUMBER_REGEXES = [
  '^[A-Z]{2}\\d{4}[A-Z]{2}$', // XX9999XX
  '^EPR\\/[A-Z]{2}\\d{4}[A-Z]{2}$' // EPR/XX9999XX
]

// Northern Ireland site authorisation number regexes
const NI_SITE_AUTHORISATION_NUMBER_REGEXES = [
  '^P\\d{4}\\/\\d{2}[A-Z]$', // P9999/99X
  '^P\\d{4}\\/\\d{2}[A-Z]\\/V\\d+$', // P9999/99X/V# (with version)
  '^WPPC \\d{2}\\/\\d{2}$', // WPPC 99/99
  '^WPPC \\d{2}\\/\\d{2}\\/V\\d+$', // WPPC 99/99/V# (with version)
  // WML, LN, and PAC formats are only valid when combined (see below)
  '^WML \\d{2}\\/\\d+(\\/T)? LN\\/\\d{2}\\/\\d+(\\/([MTCN]|V\\d+))*$', // Combined WML + LN formats (suffixes optional)
  '^WML \\d{2}\\/\\d+ PAC\\/\\d{4}\\/WCL\\d{3}$' // Combined WML + PAC formats
]

// Combine all site authorisation number regexes for validation
export const ALL_SITE_AUTHORISATION_NUMBER_REGEXES = [
  ...ENGLAND_SITE_AUTHORISATION_NUMBER_REGEXES,
  ...SCOTLAND_SITE_AUTHORISATION_NUMBER_REGEXES,
  ...WALES_SITE_AUTHORISATION_NUMBER_REGEXES,
  ...NI_SITE_AUTHORISATION_NUMBER_REGEXES
]

// Consignment note code formats, e.g.
// CJTILE/A0001
// SA1234567
// DA1234567
export const EA_NRW_CONSIGNMENT_CODE_REGEX =
  '^[A-Za-z]{2,}\\/[A-Za-z0-9]{5}[A-Za-z]?$'
export const SEPA_CONSIGNMENT_CODE_REGEX = '^S[ABC]\\d{7}$'
export const NIEA_CONSIGNMENT_CODE_REGEX = '^D[ABC]\\d{7}$'
