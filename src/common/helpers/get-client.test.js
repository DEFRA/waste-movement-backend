import { client } from '../../test/data/client.js'
import { getClient } from './get-client.js'
import { httpClients } from './http-client.js'
import * as logger from './logging/logger.js'

jest.mock('./http-client.js', () => ({
  httpClients: {
    clientSync: { get: jest.fn() }
  }
}))

describe('#getClient', () => {
  it('should return the client when a client is found', async () => {
    httpClients.clientSync.get.mockResolvedValue({ payload: client })

    const result = await getClient(client.tenantServiceName, client.clientId)

    expect(result).toEqual(client)
  })

  it('should log an error and return undefined when a client is not found', async () => {
    httpClients.clientSync.get.mockResolvedValue({ payload: undefined })

    const errorLoggerSpy = jest.spyOn(logger.createLogger(), 'error')

    const result = await getClient(client.tenantServiceName, client.clientId)

    expect(errorLoggerSpy).toHaveBeenCalledWith(
      `Failed to get client: ${JSON.stringify({ tenantServiceName: client.tenantServiceName, clientId: client.clientId })}`
    )
    expect(result).toBeUndefined()
  })
})
