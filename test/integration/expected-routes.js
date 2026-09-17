// The declared set of routes this service exposes when `ENVIRONMENT` (aka
// `cdpEnvironment`) is `local` - the default - which registers the
// `nonProdRoutes` block in src/plugins/router.js but not `extTestRoutes`.
//
// A new route lands here deliberately, not automatically: route-coverage.test.js
// fails until someone adds it, closing the one real risk of the explicit
// per-endpoint style used by the rest of this suite.
export const expectedRoutes = [
  { method: 'get', path: '/health' },
  { method: 'post', path: '/movements/{wasteTrackingId}/receive' },
  { method: 'put', path: '/movements/{wasteTrackingId}/receive' },
  { method: 'post', path: '/movements/retry-audit-log' },
  { method: 'post', path: '/bulk/{bulkId}/movements/receive' },
  { method: 'put', path: '/bulk/{bulkId}/movements/receive' },
  { method: 'get', path: '/qa-non-prod/movements' },
  { method: 'post', path: '/production-approval-tests' },
  { method: 'post', path: '/beta-1/movements' },
  { method: 'post', path: '/beta-1/movements/{movementId}/collection' },
  { method: 'post', path: '/beta-1/deliveries' },
  { method: 'post', path: '/beta-1/deliveries/{deliveryId}/receipt' },
  { method: 'post', path: '/beta-1/receipts' }
]
