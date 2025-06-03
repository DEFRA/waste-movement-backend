import { health } from '../routes/health.js'
import { movement } from '../routes/movement.js'
import { movementUpdate } from '../routes/movement-update.js'

const router = {
  plugin: {
    name: 'router',
    register: async (server, _options) => {
      // Register all routes
      const routes = [health, ...movement, movementUpdate]

      // Register routes directly
      server.route(routes)
    }
  }
}

export { router }
