import { ValidationError } from './validation-error.js'
import { HTTP_STATUS_CODES } from '../../constants/http-status-codes.js'

describe('ValidationError', () => {
  it('should use default errorType when not provided', () => {
    const error = new ValidationError('testKey', 'test message')

    expect(error.name).toBe('ValidationError')
    expect(error.key).toBe('testKey')
    expect(error.message).toBe('test message')
    expect(error.errorType).toBe('UnexpectedError')
    expect(error.statusCode).toBe(HTTP_STATUS_CODES.BAD_REQUEST)
  })

  it('should use provided errorType', () => {
    const error = new ValidationError(
      'apiCode',
      'invalid api code',
      'InvalidValue'
    )

    expect(error.errorType).toBe('InvalidValue')
  })

  it('should return correct response format', () => {
    const error = new ValidationError(
      'apiCode',
      'the API Code supplied is invalid',
      'InvalidValue'
    )

    expect(error.response()).toEqual({
      validation: {
        errors: [
          {
            key: 'apiCode',
            errorType: 'InvalidValue',
            message: 'the API Code supplied is invalid'
          }
        ]
      }
    })
  })

  it('should return correct response format with default errorType', () => {
    const error = new ValidationError('field', 'error message')

    expect(error.response()).toEqual({
      validation: {
        errors: [
          {
            key: 'field',
            errorType: 'UnexpectedError',
            message: 'error message'
          }
        ]
      }
    })
  })
})
