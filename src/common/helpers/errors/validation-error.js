import { HTTP_STATUS } from 'waste-movement-utils'

export class ValidationError extends Error {
  constructor(key, message, errorType = 'UnexpectedError') {
    super(message)
    this.name = 'ValidationError'
    this.statusCode = HTTP_STATUS.BAD_REQUEST
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
