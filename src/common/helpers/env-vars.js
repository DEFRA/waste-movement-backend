/**
 * Gets env vars which match a key
 * @param {String} key - The env var key to find
 * @returns {Array} Matching env vars
 */
export const getEnvVars = (key) => {
  if (!key) {
    return []
  }

  return Object.keys(process.env).reduce((envVars, varKey) => {
    if (varKey.startsWith(key)) {
      envVars.push(process.env[varKey])
    }
    return envVars
  }, [])
}
