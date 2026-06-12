import { HTTP_STATUS, validationErrorFormatter } from 'waste-movement-utils'

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
          response.output?.statusCode === HTTP_STATUS.BAD_REQUEST
        ) {
          let customError = validationErrorFormatter(response, logger)

          // Re-format per-item errors for bulk upload endpoints
          const hasPerItemErrors = customError.validation.errors.some((error) =>
            /^\d+(\.|$)/.test(error.key)
          )
          const isBulkUploadEndpoint = request.path.startsWith('/bulk/')

          if (isBulkUploadEndpoint && hasPerItemErrors) {
            customError = formatBulkUploadValidationErrors(
              request.payload,
              customError.validation.errors,
              logger
            )
          }

          // Return the custom formatted error
          return h.response(customError).code(HTTP_STATUS.BAD_REQUEST)
        }

        // If not a validation error, continue with the default response
        return h.continue
      })
    }
  }
}

export function formatBulkUploadValidationErrors(
  payload,
  validationErrors,
  logger
) {
  const bulkUploadErrors = {}

  Object.keys(payload).forEach((key) => {
    bulkUploadErrors[key] = {}
  })

  validationErrors.forEach((error) => {
    const errorIndex = error.key.split('.')[0]
    const bulkUploadError = bulkUploadErrors[errorIndex]

    if (!bulkUploadError) {
      logger.error(
        { error },
        `Failed to format validation error and map to payload as the error index doesn't match a payload index: Expected an integer and received '${errorIndex}'`
      )
      return
    }

    if (!bulkUploadError.validation) {
      bulkUploadError.validation = { errors: [] }
    }

    bulkUploadError.validation.errors.push(error)
  })

  return Object.values(bulkUploadErrors)
}
