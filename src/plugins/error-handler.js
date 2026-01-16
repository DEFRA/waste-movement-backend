import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'

export const errorHandler = {
  plugin: {
    name: 'errorHandler',
    register: async (server) => {
      server.ext('onPreResponse', async (request, h) => {
        const logger = request.logger
        const response = request.response

        if (response.isBoom) {
          logger.error({ err: response }, 'Request error')
        }

        // Check if it's a validation error (Boom error with status 400)
        if (
          response.isBoom &&
          response.output?.statusCode === HTTP_STATUS_CODES.BAD_REQUEST
        ) {
          // Access the validation error details
          const validationErrors = response.details
          const unexpectedErrors = []

          // Transform validation errors to the required format
          const formattedErrors = validationErrors.map((err) => {
            let errorType
            switch (err.type) {
              case 'object.and':
              case 'object.missing':
                errorType = 'NotProvided'
                break
              default:
                errorType = 'UnexpectedError'
                unexpectedErrors.push(err)
            }

            // Determine the error key
            // For most errors, Joi provides the path (e.g., ['fieldName'])
            // However, custom validators at the schema level don't have path context
            let key = err.path.join('.')

            // Fallback to the label
            if (!key && err.context.label) {
              key = err.context.label
            }

            return {
              key,
              errorType,
              message: err.message
            }
          })

          // Create the custom error format
          const customError = {
            validation: {
              errors: formattedErrors
            }
          }

          // Log all validation errors in a single consolidated entry
          if (unexpectedErrors.length > 0) {
            logger.error(
              {
                validationErrors: formattedErrors,
                unexpectedErrors,
                totalErrors: formattedErrors.length,
                unexpectedCount: unexpectedErrors.length
              },
              `Validation failed with unexpected error types, mapped to UnexpectedError`
            )
          } else {
            logger.error(
              { err: formattedErrors },
              `Validation failed ${JSON.stringify(formattedErrors)}`
            )
          }

          // Return the custom formatted error
          return h.response(customError).code(HTTP_STATUS_CODES.BAD_REQUEST)
        }

        // If not a validation error, continue with the default response
        return h.continue
      })
    }
  }
}
