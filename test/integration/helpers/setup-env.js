// Runs as a Jest `setupFiles` entry, i.e. before any test module is imported.
//
// Suites that need waste-tracking-id-backend pass the stub's ephemeral URL to
// startTestService(). This default only stops suites that don't start the stub
// from ever calling the real service configured in `src/config.js`.
import { userBasicAuthTest1 } from '../../../src/test/data/basic-auth.js'

// Port 1 (tcpmux) is privileged and effectively never listening.
process.env.WASTE_TRACKING_SERVICE_URL = 'http://127.0.0.1:1'

process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

// A proxy in the dev machine's shell would otherwise swallow the suite's own
// fetch() calls to localhost once setupProxy() installs a global dispatcher.
delete process.env.HTTP_PROXY
delete process.env.http_proxy

process.env.LOG_ENABLED = 'false'
process.env.CDP_AUDIT_ENABLED = 'false'
