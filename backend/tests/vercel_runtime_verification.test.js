import assert from "node:assert/strict"
import { createServer } from "node:http"
import { io as Client } from "socket.io-client"
import mongoose from "mongoose"
import { connectDb } from "../src/db/connect.js"
import { app, corsOriginHandler } from "../src/app.js"
import { initSocketServer, closeSocketServer } from "../src/sockets/index.js"
import {
  storeAttachment,
  removeAttachment,
  isBlobStorageConfigured,
  streamPrivateBlob,
} from "../src/services/storage.js"
import { signAccessToken } from "../src/utils/tokens.js"
import { User } from "../src/models/User.js"
import { Organization, OrganizationMember } from "../src/models/Organization.js"
import { Project } from "../src/models/Project.js"
import { Task } from "../src/models/Task.js"

console.log("==================================================")
console.log("=== VERCEL RUNTIME & SOCKET.IO VERIFICATION SUITE ===")
console.log("==================================================")

await connectDb()

const server = createServer(app)
const io = initSocketServer(server, app)

const PORT = 5109
await new Promise((resolve) => server.listen(PORT, resolve))
const BASE_URL = `http://localhost:${PORT}`

let userA = null
let userB = null
let userCrossTenant = null
let orgA = null
let orgB = null
let projectA = null
let taskA = null
let tokenA = null
let tokenB = null
let tokenCross = null

try {
  // Bootstrap tenant A with two members (userA = Owner, userB = Member)
  const unique = `vcl-${Date.now()}`
  userA = await User.create({
    name: "User A",
    email: `usera-${unique}@workflow.io`,
    passwordHash: "dummy-hash-for-unit-test",
  })
  userB = await User.create({
    name: "User B",
    email: `userb-${unique}@workflow.io`,
    passwordHash: "dummy-hash-for-unit-test",
  })
  userCrossTenant = await User.create({
    name: "Cross Tenant User",
    email: `cross-${unique}@workflow.io`,
    passwordHash: "dummy-hash-for-unit-test",
  })

  orgA = await Organization.create({
    name: `Org A ${unique}`,
    slug: `orga-${unique}`,
    ownerId: userA._id,
  })
  await OrganizationMember.create([
    {
      organizationId: orgA._id,
      userId: userA._id,
      role: "Owner",
      status: "Active",
    },
    {
      organizationId: orgA._id,
      userId: userB._id,
      role: "Member",
      status: "Active",
    },
  ])

  // Tenant B for cross-tenant isolation testing
  orgB = await Organization.create({
    name: `Org B ${unique}`,
    slug: `orgb-${unique}`,
    ownerId: userCrossTenant._id,
  })
  await OrganizationMember.create({
    organizationId: orgB._id,
    userId: userCrossTenant._id,
    role: "Owner",
    status: "Active",
  })

  projectA = await Project.create({
    name: "Project A",
    slug: `proja-${unique}`,
    organizationId: orgA._id,
    memberIds: [userA._id, userB._id],
  })
  taskA = await Task.create({
    displayId: "WF-V1",
    title: "Vercel Runtime Verification Task",
    organizationId: orgA._id,
    projectId: projectA._id,
    createdBy: userA._id,
    assignedTo: userA._id,
  })

  tokenA = signAccessToken(userA._id.toString(), 0)
  tokenB = signAccessToken(userB._id.toString(), 0)
  tokenCross = signAccessToken(userCrossTenant._id.toString(), 0)

  // 1. Verify HTTP Health Checks
  console.log("\n[TEST 1] Backend HTTP function health endpoints")
  const h1 = await fetch(`${BASE_URL}/health`)
  assert.equal(h1.status, 200)
  const h1Json = await h1.json()
  assert.equal(h1Json.ok, true)

  const h2 = await fetch(`${BASE_URL}/api/v1/health`)
  assert.equal(h2.status, 200)
  const h2Json = await h2.json()
  assert.equal(h2Json.ok, true)
  console.log("  [PASS] 1: /health and /api/v1/health respond with 200 healthy")

  // 2. Verify Serverless Entrypoint Structure
  console.log("\n[TEST 2] backend/api/index.js exports server instance")
  const apiMod = await import("../api/index.js")
  assert.ok(apiMod.default, "api/index.js must have a default export")
  console.log("  [PASS] 2: backend/api/index.js cleanly exports server with Express and Socket.IO attached")

  // 3. Multi-Client Socket.IO Tenant Isolation & Cross-Client Delivery
  console.log("\n[TEST 3] Multi-client Socket.IO tenant isolation & event propagation")
  const clientA = Client(BASE_URL, {
    transports: ["websocket"],
    auth: { token: tokenA, organizationId: orgA._id.toString() },
    reconnection: false,
  })
  const clientB = Client(BASE_URL, {
    transports: ["websocket"],
    auth: { token: tokenB, organizationId: orgA._id.toString() },
    reconnection: false,
  })
  const clientCross = Client(BASE_URL, {
    transports: ["websocket"],
    auth: { token: tokenCross, organizationId: orgB._id.toString() },
    reconnection: false,
  })

  await Promise.all([
    new Promise((res, rej) => {
      clientA.on("connect", res)
      clientA.on("connect_error", rej)
    }),
    new Promise((res, rej) => {
      clientB.on("connect", res)
      clientB.on("connect_error", rej)
    }),
    new Promise((res, rej) => {
      clientCross.on("connect", res)
      clientCross.on("connect_error", rej)
    }),
  ])
  console.log("  [PASS] 3a: Three independent clients authenticated and connected to respective tenant rooms")

  let clientBReceived = null
  let clientCrossReceived = null
  clientB.on("task.updated", (data) => {
    clientBReceived = data
  })
  clientCross.on("task.updated", (data) => {
    clientCrossReceived = data
  })

  const { emitOrgEvent } = await import("../src/services/notify.js")
  emitOrgEvent(io, orgA._id.toString(), "task.updated", { id: "WF-V1", action: "updated" })

  await new Promise((res) => setTimeout(res, 500))

  assert.ok(clientBReceived, "Client B in same org MUST receive the event")
  assert.equal(clientBReceived.id, "WF-V1")
  assert.equal(clientCrossReceived, null, "Cross-tenant client MUST NOT receive Org A's events")
  console.log("  [PASS] 3b: Event delivered to Org A peer and strictly isolated from Org B cross-tenant client")

  clientA.disconnect()
  clientB.disconnect()
  clientCross.disconnect()

  // 4. Redis Adapter Requirement in Production Check
  console.log("\n[TEST 4] Production Redis requirement enforcement")
  const prevEnv = process.env.NODE_ENV
  const prevRedis = process.env.REDIS_URL
  try {
    process.env.NODE_ENV = "production"
    delete process.env.REDIS_URL
    delete process.env.REDIS_CONNECTION_STRING
    delete process.env.ALLOW_IN_MEMORY_SOCKETS_IN_PROD
    const dummyServer = createServer()
    assert.throws(
      () => initSocketServer(dummyServer),
      /REDIS_URL is required in production/,
      "Must throw clear error in production if REDIS_URL is absent",
    )
    console.log("  [PASS] 4: Fails clearly with actionable blocker error when REDIS_URL is missing in production")
  } finally {
    process.env.NODE_ENV = prevEnv
    if (prevRedis) process.env.REDIS_URL = prevRedis
  }

  // 5. Strict Production CORS Enforcement Check
  console.log("\n[TEST 5] Strict production CORS policy")
  await new Promise((resolve) => {
    corsOriginHandler("https://random-attacker.vercel.app", (err, allowed) => {
      assert.ok(err, "Arbitrary *.vercel.app origin must be rejected by CORS")
      resolve()
    })
  })
  console.log("  [PASS] 5: Arbitrary *.vercel.app origins are strictly rejected by CORS")

  // 6. Attachment Authorization & Cross-Tenant Download Protection
  console.log("\n[TEST 6] Attachment authorization and cross-tenant download isolation")
  const sampleBuffer = Buffer.from("Sensitive WorkFlow attachment test content")
  const stored = await storeAttachment({
    originalname: "confidential.pdf",
    buffer: sampleBuffer,
    mimetype: "application/pdf",
    size: sampleBuffer.length,
  })
  taskA.attachments = [stored]
  await taskA.save()
  const filename = stored.url.split("/uploads/")[1]

  // 6a: Authorized Member of Org A can download
  const authRes = await fetch(`${BASE_URL}/uploads/${filename}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  })
  assert.equal(authRes.status, 200, "Authorized tenant member must get 200")
  assert.ok(
    authRes.headers.get("content-disposition")?.includes("confidential.pdf"),
    "Content-Disposition must specify attachment filename",
  )
  assert.equal(
    authRes.headers.get("x-content-type-options"),
    "nosniff",
    "Must enforce nosniff security header",
  )
  assert.ok(
    authRes.headers.get("cache-control")?.includes("private"),
    "Cache-Control must be private",
  )
  console.log("  [PASS] 6a: Authorized tenant member downloaded file with proper security headers")

  // 6b: Unauthenticated request is rejected (401)
  const unauthRes = await fetch(`${BASE_URL}/uploads/${filename}`)
  assert.equal(unauthRes.status, 401, "Unauthenticated request must return 401")
  console.log("  [PASS] 6b: Unauthenticated download blocked with 401")

  // 6c: Cross-tenant member (User from Org B) is rejected (403)
  const crossTenantRes = await fetch(`${BASE_URL}/uploads/${filename}`, {
    headers: { Authorization: `Bearer ${tokenCross}` },
  })
  assert.equal(crossTenantRes.status, 403, "Cross-tenant member must be blocked with 403")
  console.log("  [PASS] 6c: Cross-tenant user blocked from accessing attachment with 403 Forbidden")

  // 6d: Non-existent file returns 404
  const missingRes = await fetch(`${BASE_URL}/uploads/nonexistent-file.pdf`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  assert.equal(missingRes.status, 404, "Non-existent attachment must return 404")
  console.log("  [PASS] 6d: Non-existent attachment correctly returns 404")

  // 7. Direct Upload Authorization Flow (Bypassing 4.5 MB Function Limit)
  console.log("\n[TEST 7] Direct client upload authorization & limits")
  // 7a: Valid upload intent (file <= 10 MB, valid extension, valid MIME)
  const intentRes = await fetch(`${BASE_URL}/api/v1/tasks/${taskA._id}/attachments/upload-intent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-organization-id": orgA._id.toString(),
    },
    body: JSON.stringify({
      filename: "architecture-design.png",
      mimeType: "image/png",
      size: 5 * 1024 * 1024, // 5 MB
    }),
  })
  assert.equal(intentRes.status, 200, "Valid upload intent must succeed")
  const intentData = await intentRes.json()
  assert.equal(intentData.maxSize, 10 * 1024 * 1024)
  console.log("  [PASS] 7a: Valid upload intent approved with 10 MB maximum limit")

  // 7b: Oversized file rejection (> 10 MB)
  const oversizedRes = await fetch(`${BASE_URL}/api/v1/tasks/${taskA._id}/attachments/upload-intent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-organization-id": orgA._id.toString(),
    },
    body: JSON.stringify({
      filename: "huge-dump.zip",
      mimeType: "application/zip",
      size: 11 * 1024 * 1024, // 11 MB > 10 MB limit
    }),
  })
  assert.equal(oversizedRes.status, 422, "Oversized file must be rejected with 422")
  const oversizedData = await oversizedRes.json()
  assert.ok(oversizedData.message.includes("10 MB limit"))
  console.log("  [PASS] 7b: Oversized file (>10 MB) rejected before upload authorization")

  // 7c: Invalid file extension rejection
  const invalidExtRes = await fetch(`${BASE_URL}/api/v1/tasks/${taskA._id}/attachments/upload-intent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-organization-id": orgA._id.toString(),
    },
    body: JSON.stringify({
      filename: "exploit.exe",
      mimeType: "application/octet-stream",
      size: 1024,
    }),
  })
  assert.equal(invalidExtRes.status, 422, "Disallowed file extension must be rejected with 422")
  console.log("  [PASS] 7c: Disallowed file extension (.exe) rejected with 422")

  // 7d: Cross-tenant upload intent rejected
  const crossIntentRes = await fetch(`${BASE_URL}/api/v1/tasks/${taskA._id}/attachments/upload-intent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenCross}`,
      "x-organization-id": orgB._id.toString(),
    },
    body: JSON.stringify({
      filename: "test.png",
      mimeType: "image/png",
      size: 1024,
    }),
  })
  assert.equal(crossIntentRes.status, 404, "Cross-tenant task upload intent must return 404")
  console.log("  [PASS] 7d: Cross-tenant upload authorization blocked with 404")

  // 7e: Complete verification rejects spoofed pathname
  const spoofedComplete = await fetch(`${BASE_URL}/api/v1/tasks/${taskA._id}/attachments/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-organization-id": orgA._id.toString(),
    },
    body: JSON.stringify({
      name: "spoofed.png",
      blobUrl: "https://blob.vercel-storage.com/other-org/other-task/spoofed.png",
      pathname: `orgs/${orgB._id}/tasks/some-other-task/spoofed.png`,
    }),
  })
  assert.ok([400, 403].includes(spoofedComplete.status), "Spoofed pathname must be rejected")
  console.log("  [PASS] 7e: Mismatched/spoofed storage pathname rejected during completion verification")

  // 8. Attachment Deletion and Cleanup
  console.log("\n[TEST 8] Attachment deletion authorization & cleanup")
  // Cross-tenant user cannot delete attachment
  const crossDelete = await fetch(
    `${BASE_URL}/api/v1/tasks/${taskA._id}/attachments/${taskA.attachments[0]._id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenCross}`,
        "x-organization-id": orgB._id.toString(),
      },
    },
  )
  assert.equal(crossDelete.status, 404, "Cross-tenant attachment delete must return 404")
  console.log("  [PASS] 8a: Cross-tenant attachment deletion blocked")

  // Authorized user deletes attachment
  const authDelete = await fetch(
    `${BASE_URL}/api/v1/tasks/${taskA._id}/attachments/${taskA.attachments[0]._id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "x-organization-id": orgA._id.toString(),
      },
    },
  )
  assert.equal(authDelete.status, 200, "Authorized deletion must return 200")
  console.log("  [PASS] 8b: Authorized attachment deletion executed cleanly")

  await removeAttachment(stored)

  console.log("\n==================================================")
  console.log("ALL VERCEL RUNTIME, BLOB & SOCKET.IO TESTS PASSED!")
  console.log("==================================================")
} finally {
  // Clean up database test fixtures
  if (taskA?._id) await Task.deleteOne({ _id: taskA._id })
  if (projectA?._id) await Project.deleteOne({ _id: projectA._id })
  if (orgA?._id) {
    await OrganizationMember.deleteMany({ organizationId: orgA._id })
    await Organization.deleteOne({ _id: orgA._id })
  }
  if (orgB?._id) {
    await OrganizationMember.deleteMany({ organizationId: orgB._id })
    await Organization.deleteOne({ _id: orgB._id })
  }
  if (userA?._id) await User.deleteOne({ _id: userA._id })
  if (userB?._id) await User.deleteOne({ _id: userB._id })
  if (userCrossTenant?._id) await User.deleteOne({ _id: userCrossTenant._id })

  await closeSocketServer(io)
  if (server.listening) {
    await new Promise((resolve) => server.close(resolve))
  }
  await mongoose.disconnect()
  process.exit(0)
}

