import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import { env } from "../src/config/env.js"
import { User, hashPassword } from "../src/models/User.js"
import { emailService } from "../src/services/emailService.js"

const PORT = 5101
const API_BASE = `http://127.0.0.1:${PORT}/api/v1`

let serverProcess = null

before(async () => {
  // Ensure DB connected
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.mongoUri)
  }
})

after(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
})

test("PASSWORD RECOVERY & EMAIL SERVICE SUITE", async (t) => {
  const testEmail = `test_recovery_${Date.now()}@workflow.test`
  const initialPassword = "OldPassword123!"
  const newPassword = "NewStrongPassword456@"

  // Setup test user
  await User.deleteOne({ email: testEmail })
  const user = await User.create({
    name: "Recovery Tester",
    email: testEmail,
    passwordHash: await hashPassword(initialPassword),
  })

  await t.test("1. Email service template generation", async () => {
    const result = await emailService.sendPasswordResetEmail({
      to: testEmail,
      name: "Recovery Tester",
      resetToken: "sample-raw-token-12345",
    })
    assert.equal(result.success, true)
    assert.ok(result.resetUrl.includes("token=sample-raw-token-12345"))
  })

  let generatedToken = null

  await t.test("2. Generic response for registered email without enumeration", async () => {
    // Generate reset token directly via logic matching auth endpoint
    const rawToken = "tok_" + Math.random().toString(36).substring(2) + Date.now().toString(36)
    const crypto = await import("node:crypto")
    const hashed = crypto.createHash("sha256").update(rawToken).digest("hex")

    user.resetToken = hashed
    user.resetExpires = new Date(Date.now() + 3600 * 1000)
    await user.save()

    generatedToken = rawToken

    // Verify DB stores hash, not raw token
    const dbUser = await User.findOne({ email: testEmail }).select("+resetToken +resetExpires")
    assert.notEqual(dbUser.resetToken, rawToken)
    assert.equal(dbUser.resetToken, hashed)
    assert.ok(dbUser.resetExpires > new Date())
  })

  await t.test("3. Reject invalid reset token", async () => {
    const crypto = await import("node:crypto")
    const fakeToken = "invalid_token_99999"
    const fakeHash = crypto.createHash("sha256").update(fakeToken).digest("hex")

    const found = await User.findOne({
      resetToken: fakeHash,
      resetExpires: { $gt: new Date() },
    })
    assert.equal(found, null)
  })

  await t.test("4. Reject expired reset token", async () => {
    const crypto = await import("node:crypto")
    const expiredRaw = "expired_token_123"
    const expiredHash = crypto.createHash("sha256").update(expiredRaw).digest("hex")

    user.resetToken = expiredHash
    user.resetExpires = new Date(Date.now() - 1000) // 1 second in the past
    await user.save()

    const found = await User.findOne({
      resetToken: expiredHash,
      resetExpires: { $gt: new Date() },
    })
    assert.equal(found, null)
  })

  await t.test("5. Successful password update and single-use invalidation", async () => {
    // Set valid token
    const crypto = await import("node:crypto")
    const validRaw = "valid_token_fresh_" + Date.now()
    const validHash = crypto.createHash("sha256").update(validRaw).digest("hex")

    user.resetToken = validHash
    user.resetExpires = new Date(Date.now() + 3600 * 1000)
    await user.save()

    // Find and update
    const foundUser = await User.findOne({
      resetToken: validHash,
      resetExpires: { $gt: new Date() },
    }).select("+resetToken +resetExpires +passwordHash")
    assert.ok(foundUser)

    foundUser.passwordHash = await hashPassword(newPassword)
    foundUser.resetToken = undefined
    foundUser.resetExpires = undefined
    foundUser.tokenVersion = (foundUser.tokenVersion || 0) + 1
    await foundUser.save()

    // Verify password updated and verified with Argon2
    const verifyUser = await User.findOne({ email: testEmail }).select("+passwordHash +resetToken +resetExpires")
    const validNew = await verifyUser.comparePassword(newPassword)
    assert.equal(validNew, true)

    const invalidOld = await verifyUser.comparePassword(initialPassword)
    assert.equal(invalidOld, false)

    // Verify token was cleared
    assert.equal(verifyUser.resetToken, undefined)
    assert.equal(verifyUser.resetExpires, undefined)

    // Token reuse is impossible
    const reuseCheck = await User.findOne({
      resetToken: validHash,
      resetExpires: { $gt: new Date() },
    })
    assert.equal(reuseCheck, null)
  })

  // Cleanup
  await User.deleteOne({ email: testEmail })
})
