import Boom from '@hapi/boom'
import { validate } from './index.js'

export const jsonSchemaValidator = (schemaId) => (value) => {
  if (validate(schemaId, value)) {
    return value
  }
  throw Boom.badRequest('Payload validation failed')
}
