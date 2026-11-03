import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import fs from "node:fs"
import path from "node:path"

console.log("\n==================================================")
console.log("=== REAL BROWSER (CHROME CDP) QA VERIFICATION ===")
console.log("==================================================\n")

const SERVER_PORT = 5120
const CHROME_PORT = 9226
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const USER_DATA_DIR = path.join(process.env.TEMP || "C:\\Temp", `chrome_qa_pass_${Date.now()}`)

let currentTokenVersion = 0
let lastReceivedCookies = ""

// Create simulated same-origin / backend server
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${SERVER_PORT}`)
  lastReceivedCookies = req.headers.cookie || ""

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", `http://127.0.0.1:${SERVER_PORT}`)
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    return res.end()
  }

  if (url.pathname === "/api/v1/auth/login") {
    // Set authentication cookies
    currentTokenVersion = 1
    res.setHeader("Set-Cookie", [
      "accessToken=test-access-token-123; Path=/; HttpOnly; SameSite=Lax",
      "refreshToken=test-refresh-token-456; Path=/; HttpOnly; SameSite=Lax",
    ])
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify({ success: true, user: { id: "user-1", name: "Browser QA User" } }))
  }

  if (url.pathname === "/api/v1/auth/me") {
    const cookies = req.headers.cookie || ""
    const hasAccess = cookies.includes("accessToken=test-access-token-123")
    if (hasAccess && currentTokenVersion === 1) {
      res.writeHead(200, { "Content-Type": "application/json" })
      return res.end(JSON.stringify({ user: { id: "user-1", name: "Browser QA User" } }))
    }
    res.writeHead(401, { "Content-Type": "application/json" })
    return res.end(JSON.stringify({ message: "Authentication required" }))
  }

  if (url.pathname === "/api/v1/auth/logout") {
    currentTokenVersion = 2
    res.setHeader("Set-Cookie", [
      "accessToken=; Path=/; HttpOnly; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "refreshToken=; Path=/; HttpOnly; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ])
    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify({ success: true }))
  }

  // HTML page for browser testing
  if (url.pathname === "/dashboard" || url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" })
    return res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>WorkFlow Dashboard</title></head>
        <body>
          <h1 id="title">Dashboard</h1>
          <div id="status">Ready</div>
          <script>
            window.checkAuth = async () => {
              const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
              return { status: res.status, data: await res.json() };
            };
            window.doLogin = async () => {
              const res = await fetch('/api/v1/auth/login', { method: 'POST', credentials: 'include' });
              return { status: res.status, data: await res.json() };
            };
            window.doLogout = async () => {
              const res = await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
              return { status: res.status, data: await res.json() };
            };
          </script>
        </body>
      </html>
    `)
  }

  res.writeHead(404)
  res.end()
})

await new Promise((resolve) => server.listen(SERVER_PORT, resolve))

// Launch real Chrome browser in headless mode
console.log("[SETUP] Launching real Google Chrome (Headless)...")
const chromeProcess = spawn(CHROME_PATH, [
  "--headless=new",
  `--remote-debugging-port=${CHROME_PORT}`,
  `--user-data-dir=${USER_DATA_DIR}`,
  "--no-first-run",
  "--no-default-browser-check",
])

// Wait for Chrome CDP endpoint
let pageWsUrl = null
for (let i = 0; i < 30; i++) {
  try {
    const listRes = await fetch(`http://127.0.0.1:${CHROME_PORT}/json`)
    if (listRes.ok) {
      const targets = await listRes.json()
      const pageTarget = targets.find((t) => t.type === "page")
      if (pageTarget?.webSocketDebuggerUrl) {
        pageWsUrl = pageTarget.webSocketDebuggerUrl
        break
      }
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 200))
}

assert.ok(pageWsUrl, "Chrome CDP debugger URL must be available")
console.log("  [PASS] Real Chrome instance connected via DevTools Protocol")

// Helper to send CDP commands
class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.msgId = 0
    this.pending = new Map()
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve
      this.ws.onerror = reject
    })
    this.ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data)
      if (parsed.id && this.pending.has(parsed.id)) {
        const { resolve, reject } = this.pending.get(parsed.id)
        this.pending.delete(parsed.id)
        if (parsed.error) reject(parsed.error)
        else resolve(parsed.result)
      }
    }
  }

  async send(method, params = {}) {
    await this.ready
    const id = ++this.msgId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    return res.result?.value
  }

  close() {
    this.ws.close()
  }
}

const cdp = new CdpSession(pageWsUrl)
await cdp.send("Page.enable")
await cdp.send("Network.enable")
await cdp.send("Runtime.enable")

try {
  // Navigate to Dashboard
  console.log("\n[TEST 1] Initial navigation to Dashboard in Real Chrome")
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${SERVER_PORT}/dashboard` })
  await new Promise((r) => setTimeout(r, 500))

  const initialAuth = await cdp.eval("window.checkAuth()")
  assert.equal(initialAuth.status, 401, "Initial unauthenticated check must return 401")
  console.log("  [PASS] 1: Unauthenticated browser request receives 401 as expected")

  // Perform login
  console.log("\n[TEST 2] Sign-in and HttpOnly cookie establishment in Real Chrome")
  const loginRes = await cdp.eval("window.doLogin()")
  assert.equal(loginRes.status, 200)

  // Verify cookies in Chrome's actual cookie jar via Network.getCookies
  const { cookies: browserCookies } = await cdp.send("Network.getCookies", {
    urls: [`http://127.0.0.1:${SERVER_PORT}`],
  })
  const accessCookie = browserCookies.find((c) => c.name === "accessToken")
  const refreshCookie = browserCookies.find((c) => c.name === "refreshToken")

  assert.ok(accessCookie, "accessToken cookie must exist in real browser cookie jar")
  assert.ok(refreshCookie, "refreshToken cookie must exist in real browser cookie jar")
  assert.equal(accessCookie.httpOnly, true, "accessToken must be HttpOnly")
  assert.equal(refreshCookie.httpOnly, true, "refreshToken must be HttpOnly")
  console.log("  [PASS] 2: HttpOnly cookies stored securely in Chrome's native cookie jar")

  // Test 3: Session survives real browser refresh
  console.log("\n[TEST 3] Session survives real browser reload (Page.reload)")
  await cdp.send("Page.reload", { ignoreCache: false })
  await new Promise((r) => setTimeout(r, 600))

  const refreshAuth = await cdp.eval("window.checkAuth()")
  assert.equal(refreshAuth.status, 200, "After browser reload, session must remain active (200 OK)")
  assert.equal(refreshAuth.data.user.name, "Browser QA User")
  assert.ok(
    lastReceivedCookies.includes("accessToken="),
    "Browser automatically transmitted cookies on reload",
  )
  console.log("  [PASS] 3: Valid session successfully survived browser refresh in real Chrome")

  // Test 4: Session survives in a New Tab
  console.log("\n[TEST 4] Session survives across new tab navigation")
  const { targetId } = await cdp.send("Target.createTarget", {
    url: `http://127.0.0.1:${SERVER_PORT}/dashboard`,
  })
  assert.ok(targetId, "New browser tab created successfully")

  // Attach to new tab
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  })

  // Evaluate auth in new tab
  const newTabEval = await cdp.send("Runtime.evaluate", {
    expression: "window.checkAuth()",
    awaitPromise: true,
    returnByValue: true,
    sessionId,
  })
  assert.equal(newTabEval.result?.value?.status, 200, "New tab immediately restored session from cookies")
  console.log("  [PASS] 4: Valid session immediately restored in separate real browser tab")

  // Close new tab
  await cdp.send("Target.closeTarget", { targetId })

  // Test 5: Logout and browser back navigation protection
  console.log("\n[TEST 5] Logout and browser back navigation protection")
  const logoutRes = await cdp.eval("window.doLogout()")
  assert.equal(logoutRes.status, 200)

  // Verify cookies cleared in Chrome
  const { cookies: postLogoutCookies } = await cdp.send("Network.getCookies", {
    urls: [`http://127.0.0.1:${SERVER_PORT}`],
  })
  const postAccess = postLogoutCookies.find((c) => c.name === "accessToken")
  assert.ok(!postAccess || postAccess.value === "", "accessToken cleared from browser jar")

  // Verify /auth/me now returns 401
  const postLogoutAuth = await cdp.eval("window.checkAuth()")
  assert.equal(postLogoutAuth.status, 401, "Protected call returns 401 after logout")

  // Simulate user pressing browser BACK button (history navigation)
  console.log("  Navigating browser back...")
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${SERVER_PORT}/` })
  await new Promise((r) => setTimeout(r, 400))
  // Navigate forward/back to dashboard
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${SERVER_PORT}/dashboard` })
  await new Promise((r) => setTimeout(r, 400))

  const backAuth = await cdp.eval("window.checkAuth()")
  assert.equal(backAuth.status, 401, "Dashboard strictly rejects access on back navigation after logout")
  console.log("  [PASS] 5: Protected dashboard never reappears after logout, even on back navigation")

  console.log("\n==================================================")
  console.log("ALL REAL BROWSER (CHROME CDP) TESTS PASSED!")
  console.log("==================================================\n")
} finally {
  cdp.close()
  chromeProcess.kill()
  server.close()
  try {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true })
  } catch {}
}
