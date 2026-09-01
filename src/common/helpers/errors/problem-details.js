class ProblemDetails extends Error {
  constructor({ type, title, status, detail, instance, ...extensions }) {
    super(detail || title)
    this.type = type || 'about:blank'
    this.title = title
    this.status = status
    this.detail = detail
    this.instance = instance
    this.extensions = extensions // custom fields allowed by the spec
  }

  toJSON() {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      ...(this.detail && { detail: this.detail }),
      ...(this.instance && { instance: this.instance }),
      ...this.extensions
    }
  }
}

const toProblemDetails = (
  err,
  { status = 500, instance, extensions = {} } = {}
) => {
  if (err instanceof ProblemDetails) {
    return {
      ...err.toJSON(),
      ...extensions
    }
  }

  return {
    type: 'about:blank',
    title: err.name || 'Internal Server Error',
    status: err.statusCode || status,
    detail: err.message,
    ...(instance && { instance }),
    ...extensions
  }
}

const toProblemDetailsResponse = (h, err, options = {}) => {
  const { headers = {}, ...problemOptions } = options
  const problem = toProblemDetails(err, problemOptions)

  const response = h
    .response(problem)
    .code(problem.status)
    .type('application/problem+json')

  Object.entries(headers).forEach(([key, value]) => {
    response.header(key, value)
  })

  return response
}

function validationErrorToProblemDetails(request, err) {
  const invalidParams = err.details.map((d) => ({
    name: d.path.join('.'),
    reason: d.message.replace(/"/g, '')
  }))

  return {
    type: 'https://example.com/errors/validation-error',
    title: "Your request parameters didn't validate",
    status: 400,
    detail: `Validation failed for ${invalidParams.length} field(s)`,
    instance: request.path,
    'invalid-params': invalidParams
  }
}

const failAction = (request, h, err) => {
  const problem = validationErrorToProblemDetails(request, err)

  return h
    .response(problem)
    .code(problem.status)
    .type('application/problem+json')
    .takeover()
}

export {
  ProblemDetails,
  toProblemDetails,
  toProblemDetailsResponse,
  failAction
}
