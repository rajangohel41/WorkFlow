process.env.NODE_ENV = "test"

import assert from "node:assert/strict"
import mongoose from "mongoose"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { env } from "../src/config/env.js"
import { connectDb } from "../src/db/connect.js"
import { User, hashPassword } from "../src/models/User.js"
import { Organization, OrganizationMember } from "../src/models/Organization.js"

const TEST_PORT = Number(process.env.WORKFLOW_TEST_PORT || 5101)
const API_BASE = `http://127.0.0.1:${TEST_PORT}/api/v1`
let serverProcess = null

function makeMockGoogleToken(payload) {
  return `mock-google-token-${Buffer.from(JSON.stringify(payload)).toString("base64")}`
}

async function ensureServerRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`)
    if (res.ok) return
  } catch {}

  serverProcess = spawn(process.execPath, ["src/index.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "test",
      WORKFLOW_TEST_PORT: String(TEST_PORT),
      PORT: String(TEST_PORT),
    },
  })
  serverProcess.stderr.on("data", (d) => process.stderr.write(`[SERVER ERR] ${d}`))
  serverProcess.stdout.on("data", (d) => process.stdout.write(`[SERVER OUT] ${d}`))

  const start = Date.now()
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`)
      if (res.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error("Backend server failed to start within 15s")
}

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

function cookieHeader(headers) {
  const setCookies = headers.getSetCookie?.() || [headers.get("set-cookie") || ""]
  return setCookies.map((cookie) => cookie.split(";")[0]).filter(Boolean).join("; ")
}

async function run() {
  console.log("==================================================")
  console.log("=== GOOGLE AUTH & SECURE ACCOUNT LINKING SUITE ===")
  console.log("==================================================")

  await ensureServerRunning()
  await connectDb()

  const timestamp = Date.now()
  const newGoogleEmail = `new_google_user_${timestamp}@example.com`
  const existingPasswordEmail = `existing_pwd_user_${timestamp}@example.com`
  const password = "ExistingPassword123!"

  try {
    // Clean up test data if leftover
    await User.deleteMany({
      email: { $in: [newGoogleEmail, existingPasswordEmail] },
    })

    // Setup an existing email/password account
    const existingPwdUser = await User.create({
      name: "Existing Password User",
      email: existingPasswordEmail,
      passwordHash: await hashPassword(password),
      tokenVersion: 0,
    })

    console.log("\n[TEST 1] Missing or empty Google token rejection")
    const res1 = await request("/auth/google", {
      method: "POST",
      body: JSON.stringify({}),
    })
    assert.equal(res1.status, 400, "Should reject missing token with 400")
    console.log("  [PASS] 1: Missing ID token correctly rejected with 400")

    console.log("\n[TEST 2] Malformed or invalid Google token rejection")
    const res2 = await request("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken: "invalid-token-format" }),
    })
    assert.equal(res2.status, 401, "Should reject malformed token with 401")
    console.log("  [PASS] 2: Malformed Google ID token rejected with 401")

    console.log("\n[TEST 3] Unverified Google email rejection")
    const unverifiedToken = makeMockGoogleToken({
      sub: "g-unverified-123",
      email: "unverified@gmail.com",
      email_verified: false,
      name: "Unverified Person",
    })
    const res3 = await request("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken: unverifiedToken }),
    })
    assert.equal(res3.status, 403, "Should reject unverified Google email with 403")
    console.log("  [PASS] 3: Unverified Google email strictly rejected with 403")

    console.log("\n[TEST 4] New Google user registration flow")
    const newGoogleSub = `g-sub-${timestamp}`
    const newGoogleToken = makeMockGoogleToken({
      sub: newGoogleSub,
      email: newGoogleEmail,
      email_verified: true,
      name: "Alice Google",
      picture: "https://example.com/avatar.jpg",
    })
    const res4 = await request("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken: newGoogleToken }),
    })
    assert.equal(res4.status, 201, "New user registration should return 201")
    assert.equal(res4.data.isNewUser, true, "Should flag isNewUser: true")
    assert.equal(res4.data.user.email, newGoogleEmail)
    assert.ok(res4.data.accessToken, "Should issue access token")
    const cookie4 = cookieHeader(res4.headers)
    assert.ok(cookie4.includes("accessToken="), "Should set accessToken cookie")

    const createdUser = await User.findOne({ email: newGoogleEmail })
    assert.ok(createdUser, "User should be persisted in database")
    assert.equal(createdUser.googleId, newGoogleSub, "User should have googleId set")
    console.log("  [PASS] 4: New Google user registered, persisted with googleId, and authenticated")

    console.log("\n[TEST 5] Repeat sign-in for existing Google user succeeds directly (1-click)")
    const res5 = await request("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken: newGoogleToken }),
    })
    assert.equal(res5.status, 200, "Existing Google user should sign in with 200")
    assert.equal(res5.data.user.email, newGoogleEmail)
    console.log("  [PASS] 5: Subsequent sign-in for linked Google account succeeds with 200 without password")

    console.log("\n[TEST 6] Existing email/password account cannot be silently taken over")
    const attackGoogleToken = makeMockGoogleToken({
      sub: `g-sub-attacker-${timestamp}`,
      email: existingPasswordEmail,
      email_verified: true,
      name: "Google Attacker",
    })
    const res6 = await request("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken: attackGoogleToken }),
    })
    assert.equal(res6.status, 409, "Should reject silent takeover with 409")
    assert.equal(res6.data.linkRequired, true, "Should require account linking")
    console.log("  [PASS] 6: Unauthenticated takeover blocked; linkRequired returned with 409")

    console.log("\n[TEST 7] Account linking with wrong password rejected")
    const res7 = await request("/auth/google", {
      method: "POST",
      body: JSON.stringify({
        idToken: attackGoogleToken,
        password: "WrongPassword999!",
      }),
    })
    assert.equal(res7.status, 401, "Should reject incorrect password with 401")
    console.log("  [PASS] 7: Incorrect password linking rejected with 401")

    console.log("\n[TEST 8] Secure account linking with verified password succeeds")
    const legitGoogleSub = `g-legit-${timestamp}`
    const legitGoogleToken = makeMockGoogleToken({
      sub: legitGoogleSub,
      email: existingPasswordEmail,
      email_verified: true,
      name: "Existing Password User",
      picture: "https://example.com/alice.jpg",
    })
    const res8 = await request("/auth/google", {
      method: "POST",
      body: JSON.stringify({
        idToken: legitGoogleToken,
        password,
      }),
    })
    assert.equal(res8.status, 200, "Should successfully link with 200")
    assert.equal(res8.data.linked, true, "Should confirm account linked")
    assert.equal(res8.data.user.email, existingPasswordEmail)

    const updatedUser = await User.findOne({ email: existingPasswordEmail })
    assert.equal(updatedUser.googleId, legitGoogleSub, "googleId should now be saved on user document")
    console.log("  [PASS] 8: Verified password securely links Google account and establishes session")

    console.log("\n[TEST 9] Linked user can sign in via Google OR existing password")
    // Test Google sign in
    const res9a = await request("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken: legitGoogleToken }),
    })
    assert.equal(res9a.status, 200, "Google sign-in works immediately after linking")

    // Test original password sign in
    const res9b = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: existingPasswordEmail,
        password,
      }),
    })
    assert.equal(res9b.status, 200, "Original email/password login remains fully functional")
    console.log("  [PASS] 9: Dual auth verified: both Google and password login function simultaneously")

    console.log("\n[TEST 10] Reject linking if Google ID is already linked to another distinct account")
    const res10 = await request("/auth/google/link", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${res4.data.accessToken}`,
      },
      body: JSON.stringify({
        idToken: legitGoogleToken, // Already linked to existingPasswordEmail!
      }),
    })
    assert.equal(res10.status, 409, "Should reject duplicate Google ID across users with 409")
    console.log("  [PASS] 10: Cross-account Google ID reuse strictly rejected with 409 Conflict")

    console.log("\n==================================================")
    console.log("ALL 10 GOOGLE AUTH & ACCOUNT LINKING TESTS PASSED!")
    console.log("==================================================")
  } finally {
    try {
      await User.deleteMany({
        email: { $in: [newGoogleEmail, existingPasswordEmail] },
      })
    } catch {}

    await mongoose.disconnect()

    if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
      const shutdown = new Promise((resolve) => {
        serverProcess.once("exit", resolve)
        serverProcess.kill("SIGTERM")
      })
      const timeout = setTimeout(() => {
        serverProcess.kill("SIGKILL")
      }, 5000)
      await shutdown
      clearTimeout(timeout)
    }
  }
}

run().catch((error) => {
  console.error("Test failure:", error)
  if (serverProcess) serverProcess.kill()
  process.exitCode = 1
})
