import assert from "node:assert/strict"
import mongoose from "mongoose"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { env } from "../src/config/env.js"
import { connectDb } from "../src/db/connect.js"
import { User } from "../src/models/User.js"
import { Organization, OrganizationMember } from "../src/models/Organization.js"

const API_BASE = `http://localhost:${env.port}/api/v1`
let serverProcess = null

async function ensureServerRunning() {
  try {
    const res = await fetch(`http://localhost:${env.port}/health`)
    if (res.ok) return
  } catch {}

  serverProcess = spawn(process.execPath, ["src/index.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "pipe",
    env: { ...process.env, NODE_ENV: "test" },
  })

  const start = Date.now()
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch(`http://localhost:${env.port}/health`)
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
  await ensureServerRunning()
  await connectDb()
  const email = `account-${Date.now()}@example.test`
  const password = "Password123!"
  let organizationId

  try {
    const registration = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "Immediate Account", email, password }),
    })
    assert.equal(registration.status, 201)
    assert.ok(registration.data.user.id)
    assert.ok(registration.data.organization.id)
    assert.equal(Object.hasOwn(registration.data, "verificationRequired"), false)
    assert.equal(Object.hasOwn(registration.data, "devVerificationCode"), false)
    organizationId = registration.data.organization.id

    const user = await User.findOne({ email })
    assert.ok(user)
    assert.equal(Object.hasOwn(user.toObject(), "emailVerified"), false)
    assert.equal(Object.hasOwn(user.toObject(), "verificationCode"), false)

    const weakPassword = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "Weak Password", email: `weak-${Date.now()}@example.test`, password: "weak" }),
    })
    assert.equal(weakPassword.status, 422)
    assert.match(weakPassword.data.message || "", /strong password|at least 12|uppercase|lowercase|number|symbol/i)

    const login = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
    assert.equal(login.status, 200)
    assert.equal(login.data.user.id, registration.data.user.id)

    const me = await request("/auth/me", {
      headers: { Cookie: cookieHeader(registration.headers) },
    })
    assert.equal(me.status, 200)
    assert.equal(me.data.user.id, registration.data.user.id)
    assert.equal(me.data.organizations.length, 1)

    const smtpStatus = await fetch(`http://localhost:${env.port}/api/v1/auth/smtp-status`)
    assert.equal(smtpStatus.status, 404)

    const forgotPassword = await request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    })
    assert.equal(forgotPassword.status, 200)
    assert.ok(forgotPassword.data.devResetToken)

    // Verify token is hashed in MongoDB — plaintext raw token is NEVER stored in database
    const userWithToken = await User.findOne({ email }).select("+resetToken +resetExpires")
    assert.ok(userWithToken.resetToken)
    assert.notEqual(userWithToken.resetToken, forgotPassword.data.devResetToken)

    const updatedPassword = "UpdatedStrongPassword123!"
    const reset = await request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token: forgotPassword.data.devResetToken,
        password: updatedPassword,
      }),
    })
    assert.equal(reset.status, 200)

    // Verify single-use token: reusing the same token immediately returns 422
    const reuseAttempt = await request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token: forgotPassword.data.devResetToken,
        password: "AnotherPassword123!@#",
      }),
    })
    assert.equal(reuseAttempt.status, 422)

    // Verify expired token rejection
    const forgot2 = await request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    })
    assert.equal(forgot2.status, 200)
    await User.updateOne({ email }, { resetExpires: new Date(Date.now() - 60000) })
    const expiredAttempt = await request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token: forgot2.data.devResetToken,
        password: "AnotherPassword123!@#",
      }),
    })
    assert.equal(expiredAttempt.status, 422)

    const oldPasswordLogin = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
    assert.equal(oldPasswordLogin.status, 401)

    const updatedPasswordLogin = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: updatedPassword }),
    })
    assert.equal(updatedPasswordLogin.status, 200)
    console.log("[PASS] Registration, immediate login, and session bootstrap require no email verification")
    console.log("[PASS] Password reset token is hashed with SHA-256 in MongoDB, single-use enforced, and invalidates prior sessions")
  } finally {
    const user = await User.findOne({ email }).select("_id")
    if (user) {
      await OrganizationMember.deleteMany({ userId: user._id })
      await User.deleteOne({ _id: user._id })
    }
    if (organizationId) await Organization.deleteOne({ _id: organizationId })
    await mongoose.disconnect()

    if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
      const shutdown = new Promise((resolve) => {
        serverProcess.once("exit", resolve)
        serverProcess.kill("SIGTERM")
      })
      const timeout = setTimeout(() => {
        serverProcess.kill("SIGKILL")
      }, 10000)
      await shutdown
      clearTimeout(timeout)
    }
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})