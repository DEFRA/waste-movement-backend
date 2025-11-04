import { HTTP_STATUS_CODES } from '../../constants/http-status-codes.js'

export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
    this.statusCode = HTTP_STATUS_CODES.BAD_REQUEST
  }
}
