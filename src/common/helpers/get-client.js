import { httpClients } from './http-client.js'
import { createLogger } from '../helpers/logging/logger.js'

const logger = createLogger()

export async function getClient(tenantServiceName, clientId) {
  const client = await httpClients.clientSync
    .get(`/clients/${tenantServiceName}/${clientId}`)
    .then(({ payload }) => payload)

  if (!client) {
    logger.error(
      `Failed to get client: ${JSON.stringify({ tenantServiceName, clientId })}`
    )
  }

  return client
}
