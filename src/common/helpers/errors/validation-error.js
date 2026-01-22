import { HTTP_STATUS_CODES } from '../../constants/http-status-codes.js'

export class ValidationError extends Error {
  constructor(key, message, errorType = 'UnexpectedError') {
    super(message)
    this.name = 'ValidationError'
    this.statusCode = HTTP_STATUS_CODES.BAD_REQUEST
    this.errorType = errorType
    this.key = key
  }

  response() {
    return {
      validation: {
        errors: [
          {
            key: this.key,
            errorType: this.errorType,
            message: this.message
          }
        ]
      }
    }
  }
}
