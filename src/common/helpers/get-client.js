import { httpClients } from './http-client.js'

/**
 * Gets a client from the DWT Client Sync Service for the given tenantServiceName and clientId.
 *
 * @param {String} tenantServiceName - The tenant service name (`config.get('serviceName')`)
 * @param {String} clientId - The client id
 *
 * @returns {Promise<{clientName: String, clientId: String, tenantServiceName: String}>} The client
 */
export async function getClient(tenantServiceName, clientId) {
  const client = await httpClients.clientSync
    .get(`/clients/${tenantServiceName}/${clientId}`)
    .then(({ payload }) => payload)

  if (!client?.clientId) {
    throw new Error(
      `Failed to get client: ${JSON.stringify({ tenantServiceName, clientId })}`
    )
  }

  return client
}
