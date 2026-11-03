import assert from "node:assert/strict"
import { createServer } from "node:http"
import mongoose from "mongoose"
import { app } from "../src/app.js"
import { connectDb } from "../src/db/connect.js"
import { User } from "../src/models/User.js"
import { Organization, OrganizationMember } from "../src/models/Organization.js"

const TEST_PORT = Number(process.env.WORKFLOW_TEST_PORT || 5106)
const API_BASE = `http://127.0.0.1:${TEST_PORT}/api/v1`
let server = null

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })
  const text = await response.text()
  return {
    status: response.status,
    headers: response.headers,
    data: text ? JSON.parse(text) : null,
  }
}

function parseCookies(headers) {
  const setCookies = headers.getSetCookie?.() || [headers.get("set-cookie") || ""]
  const cookies = {}
  for (const raw of setCookies) {
    if (!raw) continue
    const parts = raw.split(";").map((p) => p.trim())
    const [name, val] = parts[0].split("=")
    cookies[name] = {
      value: val,
      raw,
      httpOnly: parts.some((p) => p.toLowerCase() === "httponly"),
      path: parts.find((p) => p.toLowerCase().startsWith("path="))?.split("=")[1] || "/",
      maxAge: parts.find((p) => p.toLowerCase().startsWith("max-age="))?.split("=")[1],
    }
  }
  return cookies
}

function cookieString(cookieMap) {
  return Object.entries(cookieMap)
    .map(([k, v]) => `${k}=${v.value}`)
    .join("; ")
}

async function run() {
  await connectDb()
  server = createServer(app)
  await new Promise((resolve) => server.listen(TEST_PORT, resolve))

  console.log("\n==================================================")
  console.log("=== AUTH PERSISTENCE, REFRESH & LOGOUT TEST SUITE ===")
  console.log("==================================================\n")

  const email = `persisted_user_${Date.now()}@workflow.test`
  const password = "ValidPassword123!"

  console.log("[TEST 1] Register new user and inspect auth cookies")
  const regRes = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Persisted User", email, password }),
  })
  assert.equal(regRes.status, 201, "Registration should succeed with 201")
  const regCookies = parseCookies(regRes.headers)
  assert.ok(regCookies.accessToken, "accessToken cookie should be set")
  assert.ok(regCookies.refreshToken, "refreshToken cookie should be set")
  assert.ok(regCookies.refreshToken.httpOnly, "refreshToken must be HttpOnly")
  assert.equal(regCookies.refreshToken.path, "/", "refreshToken path must be /")
  console.log("  [PASS] 1: User registered and secure cookies verified")

  console.log("[TEST 2] Verify session survives refresh via cookies (Simulated browser refresh)")
  // Client makes request without Authorization header, relying entirely on cookies
  const meRes = await request("/auth/me", {
    method: "GET",
    headers: {
      Cookie: cookieString(regCookies),
    },
  })
  assert.equal(meRes.status, 200, "/auth/me should succeed using cookie session")
  assert.equal(meRes.data.user.email, email.toLowerCase())
  console.log("  [PASS] 2: User authenticated on page refresh using cookie")

  console.log("[TEST 3] Token refresh endpoint rotates tokens and issues new cookies")
  const refreshRes = await request("/auth/refresh", {
    method: "POST",
    headers: {
      Cookie: `refreshToken=${regCookies.refreshToken.value}`,
    },
  })
  assert.equal(refreshRes.status, 200, "/auth/refresh should succeed")
  assert.ok(refreshRes.data.accessToken, "New accessToken returned")
  assert.ok(refreshRes.data.refreshToken, "New refreshToken returned")
  const rotatedCookies = parseCookies(refreshRes.headers)
  assert.ok(rotatedCookies.accessToken, "Rotated accessToken cookie set")
  assert.ok(rotatedCookies.refreshToken, "Rotated refreshToken cookie set")
  console.log("  [PASS] 3: Refresh endpoint smoothly rotated access and refresh tokens")

  console.log("[TEST 4] Server-side logout invalidates database session & tokenVersion")
  const userBeforeLogout = await User.findOne({ email: email.toLowerCase() })
  const initialVersion = userBeforeLogout.tokenVersion || 0

  const logoutRes = await request("/auth/logout", {
    method: "POST",
    headers: {
      Cookie: cookieString(rotatedCookies),
      Authorization: `Bearer ${rotatedCookies.accessToken.value}`,
    },
  })
  assert.equal(logoutRes.status, 200, "/auth/logout should return 200")
  assert.equal(logoutRes.data.success, true)

  // Verify cookie clearance headers
  const clearedCookies = parseCookies(logoutRes.headers)
  assert.ok(clearedCookies.accessToken, "accessToken cookie cleared")
  assert.ok(clearedCookies.refreshToken, "refreshToken cookie cleared")
  assert.equal(clearedCookies.accessToken.value, "", "accessToken cleared with empty value")
  assert.equal(clearedCookies.refreshToken.value, "", "refreshToken cleared with empty value")
  assert.ok(
    clearedCookies.accessToken.raw.includes("1970") || clearedCookies.accessToken.maxAge === "0",
    "accessToken expired in past",
  )
  assert.ok(
    clearedCookies.refreshToken.raw.includes("1970") || clearedCookies.refreshToken.maxAge === "0",
    "refreshToken expired in past",
  )

  // Verify User tokenVersion incremented in MongoDB
  const userAfterLogout = await User.findOne({ email: email.toLowerCase() })
  assert.equal(
    userAfterLogout.tokenVersion,
    initialVersion + 1,
    "User tokenVersion must increment on logout to invalidate tokens",
  )
  console.log("  [PASS] 4: Logout incremented tokenVersion and cleared authentication cookies")

  console.log("[TEST 5] Attempting token refresh with invalidated session rejected")
  const postLogoutRefreshRes = await request("/auth/refresh", {
    method: "POST",
    headers: {
      Cookie: `refreshToken=${rotatedCookies.refreshToken.value}`,
    },
  })
  assert.equal(postLogoutRefreshRes.status, 401, "Refresh after logout must be rejected with 401")
  console.log("  [PASS] 5: Post-logout refresh request strictly rejected with 401 Session revoked")

  console.log("[TEST 6] Attempting protected route /auth/me with old tokens rejected")
  const postLogoutMeRes = await request("/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${rotatedCookies.accessToken.value}`,
    },
  })
  assert.equal(postLogoutMeRes.status, 401, "Protected endpoint access after logout must return 401")
  console.log("  [PASS] 6: Old access token cannot access protected endpoints after logout")

  console.log("[TEST 7] Logout handles expired access token by reading refresh token")
  // Register a second user to test logout when accessToken is expired/missing
  const email2 = `persisted_user2_${Date.now()}@workflow.test`
  const reg2 = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Persisted User 2", email: email2, password }),
  })
  const user2 = await User.findOne({ email: email2.toLowerCase() })
  const v2 = user2.tokenVersion || 0
  const cookies2 = parseCookies(reg2.headers)

  // Call logout with ONLY the refreshToken cookie (simulating expired accessToken)
  const logoutExpiredRes = await request("/auth/logout", {
    method: "POST",
    headers: {
      Cookie: `refreshToken=${cookies2.refreshToken.value}`,
    },
  })
  assert.equal(logoutExpiredRes.status, 200, "Logout with refreshToken only should succeed")
  const user2After = await User.findOne({ email: email2.toLowerCase() })
  assert.equal(
    user2After.tokenVersion,
    v2 + 1,
    "User 2 tokenVersion must increment even when accessToken was missing/expired",
  )
  console.log("  [PASS] 7: Logout cleanly resolved user from refreshToken and invalidated session")

  console.log("\n==================================================")
  console.log("ALL 7 AUTH PERSISTENCE, REFRESH & LOGOUT TESTS PASSED!")
  console.log("==================================================\n")

  server.close()
  process.exit(0)
}

run().catch((err) => {
  console.error("Test failed:", err)
  if (server) server.close()
  process.exit(1)
})
