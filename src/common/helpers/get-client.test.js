import { client } from '../../test/data/client.js'
import { getClient } from './get-client.js'
import { httpClients } from './http-client.js'

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

  it('should throw an error when a client is not found: error', async () => {
    httpClients.clientSync.get.mockResolvedValue({
      payload: { statusCode: 404 }
    })

    await expect(() =>
      getClient(client.tenantServiceName, client.clientId)
    ).rejects.toThrow(
      `Failed to get client: ${JSON.stringify({ tenantServiceName: client.tenantServiceName, clientId: client.clientId })}`
    )
  })

  it('should throw an error when a client is not found: undefined', async () => {
    httpClients.clientSync.get.mockResolvedValue({
      payload: undefined
    })

    await expect(() =>
      getClient(client.tenantServiceName, client.clientId)
    ).rejects.toThrow(
      `Failed to get client: ${JSON.stringify({ tenantServiceName: client.tenantServiceName, clientId: client.clientId })}`
    )
  })
})
