import { health } from '../routes/health.js'
import { createReceiptMovement } from '../routes/create-receipt-movement.js'
import { updateReceiptMovement } from '../routes/update-receipt-movement.js'
import { retryAuditLogReceiptMovement } from '../routes/retry-audit-log-receipt-movement.js'
import { createBulkReceiptMovement } from '../routes/create-bulk-receipt-movement.js'
import { updateBulkReceiptMovement } from '../routes/update-bulk-receipt-movement.js'
import { getReceiptMovement } from '../routes/get-receipt-movement.js'
import { config } from '../config.js'
import { productionApprovalTests } from '../routes/production-approval-tests.js'

const environment = config.get('cdpEnvironment')

const router = {
  plugin: {
    name: 'router',
    register: async (server, _options) => {
      // Register all routes
      const routes = [
        health,
        ...createReceiptMovement,
        updateReceiptMovement,
        retryAuditLogReceiptMovement,
        createBulkReceiptMovement,
        updateBulkReceiptMovement
      ]
      const nonProdRoutes = [getReceiptMovement, productionApprovalTests]
      const extTestRoutes = [productionApprovalTests]

      if (['local', 'dev', 'test'].includes(environment)) {
        routes.push(...nonProdRoutes)
      }

      if (['ext-test'].includes(environment)) {
        routes.push(...extTestRoutes)
      }

      // Register routes directly
      server.route(routes)
    }
  }
}

export { router }
