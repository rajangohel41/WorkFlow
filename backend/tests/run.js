import { spawnSync } from "node:child_process"
import { createServer } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

const backendRoot = fileURLToPath(new URL("..", import.meta.url))
const testPort = 5101
const testEnv = {
  ...process.env,
  NODE_ENV: "test",
  WORKFLOW_TEST_PORT: String(testPort),
  MONGODB_TEST_URI:
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/workflow_test",
}
const suites = [
  "qa_security_audit.test.js",
  "auth_registration.test.js",
  "e2e_business_flow.test.js",
  "collab_realtime_e2e.test.js",
  "concurrency_stale_writes.test.js",
  "persistence_writeback.test.js",
  "assignee_status_rbac.test.js",
  "vercel_runtime_verification.test.js",
]


await new Promise((resolve, reject) => {
  const probe = createServer()
  probe.once("error", (error) => {
    reject(new Error(`Test port ${testPort} is unavailable; refusing to run the suite against another server.`, { cause: error }))
  })
  probe.listen(testPort, () => {
    probe.close((error) => (error ? reject(error) : resolve()))
  })
})

for (const suite of suites) {
  const result = spawnSync(
    process.execPath,
    [path.join("tests", suite)],
    { cwd: backendRoot, env: testEnv, stdio: "inherit" },
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}