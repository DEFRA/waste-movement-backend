// Runs as a Jest `setupFiles` entry, i.e. before any test module is imported.
//
// Ordering is load-bearing: `src/common/helpers/http-client.js` builds its
// `httpClients` singleton at module-load time from `config.get('services.wasteTracking')`,
// so `WASTE_TRACKING_SERVICE_URL` must be set before that module (or `src/config.js`)
// is ever imported - a `beforeAll` in a test file would be too late.
import { userBasicAuthTest1 } from '../../../src/test/data/basic-auth.js'

process.env.WASTE_TRACKING_SERVICE_URL =
  process.env.WASTE_TRACKING_SERVICE_URL || 'http://127.0.0.1:3999'

process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

// A proxy in the dev machine's shell would otherwise swallow the suite's own
// fetch() calls to localhost once setupProxy() installs a global dispatcher.
delete process.env.HTTP_PROXY
delete process.env.http_proxy

process.env.LOG_ENABLED = 'false'
process.env.CDP_AUDIT_ENABLED = 'false'
