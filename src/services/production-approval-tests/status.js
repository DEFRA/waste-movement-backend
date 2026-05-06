export const PAT_STATUS = {
  PASS: 'Pass',
  FAIL: 'Fail',
  ERROR: 'Error'
}

export const pass = () => ({ status: PAT_STATUS.PASS, message: '' })

export const fail = (message) => ({ status: PAT_STATUS.FAIL, message })

export const error = (message) => ({ status: PAT_STATUS.ERROR, message })
