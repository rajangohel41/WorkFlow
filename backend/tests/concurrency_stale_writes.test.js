import assert from "node:assert"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { io as ioClient } from "socket.io-client"
import { env } from "../src/config/env.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = `http://localhost:${env.port}`

let serverProcess = null

async function ensureServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/health`)
    if (res.ok) return
  } catch {}

  console.log("Starting backend server for concurrency & isolation test suite...")
  serverProcess = spawn(process.execPath, ["src/index.js"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
    env: { ...process.env, NODE_ENV: "test" },
  })

  const start = Date.now()
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch(`${BASE_URL}/health`)
      if (res.ok) {
        console.log("Backend server is ready.")
        return
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error("Backend server failed to start within 15s")
}

async function api(endpoint, options = {}) {
  const headers = { ...options.headers }
  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }
  const body =
    options.body && typeof options.body === "object" && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : options.body

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    body,
  })

  let data
  const contentType = res.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    data = await res.json()
  } else {
    data = await res.text()
  }
  return { status: res.status, data, headers: res.headers }
}

function getCookie(headers, name) {
  const raw = headers.get("set-cookie") || ""
  const match = raw.match(new RegExp(`${name}=([^;]+)`))
  return match ? match[1] : null
}

function createEventCollector(socket) {
  const events = []
  if (socket.onAny) {
    socket.onAny((event, ...args) => {
      events.push({ event, data: args[0], timestamp: Date.now() })
    })
  }
  return {
    events,
    waitFor(eventName, filterFn = null, timeoutMs = 5000) {
      return new Promise((resolve, reject) => {
        const found = events.find(
          (e) =>
            (e.event === eventName ||
              e.event === eventName.replace(".", ":") ||
              e.event === eventName.replace(":", ".")) &&
            (!filterFn || filterFn(e.data)),
        )
        if (found) return resolve(found.data)

        const timer = setTimeout(() => {
          socket.off(eventName, listener)
          reject(
            new Error(
              `Timeout (${timeoutMs}ms) waiting for event "${eventName}". Events collected: [${events
                .map((e) => e.event)
                .join(", ")}]`,
            ),
          )
        }, timeoutMs)

        function listener(data) {
          if (!filterFn || filterFn(data)) {
            clearTimeout(timer)
            resolve(data)
          }
        }
        socket.once(eventName, listener)
      })
    },
    hasEvent(eventName, filterFn = null) {
      return events.some(
        (e) =>
          (e.event === eventName ||
            e.event === eventName.replace(".", ":") ||
            e.event === eventName.replace(":", ".")) &&
          (!filterFn || filterFn(e.data)),
      )
    },
  }
}

async function runConcurrencyAndIsolationTests() {
  await ensureServerRunning()
  const timestamp = Date.now()
  const password = "Password123!@#"

  console.log("\n==================================================")
  console.log("=== CONCURRENCY, STALE-WRITES & TENANT ISOLATION SUITE ===")
  console.log("==================================================")

  // 1. SETUP TWO ORGANIZATIONS
  // Org A with User A (Owner) and User B (Member)
  const regUserA = await api("/api/v1/auth/register", {
    method: "POST",
    body: { name: "User Alpha", email: `alpha-${timestamp}@workflow.io`, password },
  })
  assert.strictEqual(regUserA.status, 201)
  const tokenA = regUserA.data.accessToken || getCookie(regUserA.headers, "accessToken")
  const userA = regUserA.data.user

  const onbA = await api("/api/v1/auth/onboarding", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { workspaceName: "Alpha Isolation Org", workspaceSlug: `alpha-iso-${timestamp}` },
  })
  assert.strictEqual(onbA.status, 201)
  const orgA = onbA.data.organization

  // User B
  const regUserB = await api("/api/v1/auth/register", {
    method: "POST",
    body: { name: "User Beta", email: `beta-${timestamp}@workflow.io`, password },
  })
  const tokenB = regUserB.data.accessToken || getCookie(regUserB.headers, "accessToken")
  const userB = regUserB.data.user

  // Invite and add User B to Org A
  const inviteRes = await api("/api/v1/organizations/invitations", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { email: userB.email, role: "Member" },
  })
  assert.strictEqual(inviteRes.status, 201)
  const inviteToken = inviteRes.data.invitation.token

  const acceptRes = await api(`/api/v1/organizations/invitations/${inviteToken}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
  })
  assert.strictEqual(acceptRes.status, 200)

  // Org B with User C (Owner of foreign tenant)
  const regUserC = await api("/api/v1/auth/register", {
    method: "POST",
    body: { name: "User Gamma", email: `gamma-${timestamp}@workflow.io`, password },
  })
  const tokenC = regUserC.data.accessToken || getCookie(regUserC.headers, "accessToken")
  const userC = regUserC.data.user

  const onbB = await api("/api/v1/auth/onboarding", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenC}` },
    body: { workspaceName: "Gamma Foreign Org", workspaceSlug: `gamma-iso-${timestamp}` },
  })
  assert.strictEqual(onbB.status, 201)
  const orgB = onbB.data.organization

  // Create Project in Org A
  const projRes = await api("/api/v1/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { name: "Concurrency Project", color: "#6366F1" },
  })
  assert.strictEqual(projRes.status, 201)
  const projectA = projRes.data

  // ----------------------------------------------------
  // TEST 1: Simultaneous task-update conflict (HTTP 409)
  // ----------------------------------------------------
  console.log("\n[TEST] CONCURRENCY-01: Simultaneous task updates with version conflict handling")
  const taskRes = await api("/api/v1/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: {
      title: "Concurrent Target Task",
      projectId: projectA.id,
      status: "Backlog",
      priority: "Medium",
      assigneeId: userA.id,
    },
  })
  assert.strictEqual(taskRes.status, 201)
  const initialTask = taskRes.data
  const initialVersion = initialTask.version || 1
  assert.strictEqual(initialVersion, 1)

  // User A attempts concurrent updates from two sessions at nearly the exact same time
  // Session 1 sets status to "In Progress" with version 1
  // Session 2 sets status to "Done" with version 1
  const [updateA, updateB] = await Promise.all([
    api(`/api/v1/tasks/${initialTask.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { status: "In Progress", version: initialVersion },
    }),
    api(`/api/v1/tasks/${initialTask.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { status: "Done", version: initialVersion },
    }),
  ])

  // One request must succeed (200 OK) and the other must be rejected with 409 Conflict
  const statuses = [updateA.status, updateB.status]
  assert.ok(
    statuses.includes(200) && statuses.includes(409),
    `Expected [200, 409] but received [${statuses.join(", ")}]`,
  )

  const conflictResponse = updateA.status === 409 ? updateA : updateB
  const winningResponse = updateA.status === 200 ? updateA : updateB
  assert.strictEqual(conflictResponse.status, 409)
  assert.strictEqual(conflictResponse.data.code, "STALE_VERSION")
  console.log("  [PASS] CONCURRENCY-01: Conflicting simultaneous update returned HTTP 409 Conflict with STALE_VERSION code")

  // ----------------------------------------------------
  // TEST 2: Stale writes cannot silently overwrite accepted changes
  // ----------------------------------------------------
  console.log("\n[TEST] CONCURRENCY-02: Stale write rejection prevents silent overwrites")
  // Verify authoritative state in database matches the winning response
  const freshTask = await api(`/api/v1/tasks/${initialTask.id}`, {
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
  })
  assert.strictEqual(freshTask.data.status, winningResponse.data.status)
  assert.strictEqual(freshTask.data.version, 2)

  // Stale write attempt with old version 1 must be rejected
  const staleAttempt = await api(`/api/v1/tasks/${initialTask.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { status: "Backlog", version: 1 },
  })
  assert.strictEqual(staleAttempt.status, 409)
  console.log("  [PASS] CONCURRENCY-02: Stale write rejected; authoritative server state preserved")

  // ----------------------------------------------------
  // TEST 3: Retry behavior and convergence on authoritative state
  // ----------------------------------------------------
  console.log("\n[TEST] CONCURRENCY-03: Client retry converges on authoritative state")
  // User A retries with fresh version (version 2)
  const retryResponse = await api(`/api/v1/tasks/${initialTask.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { status: "Done", version: freshTask.data.version },
  })
  assert.strictEqual(retryResponse.status, 200)
  assert.strictEqual(retryResponse.data.status, "Done")
  assert.strictEqual(retryResponse.data.version, 3)
  console.log("  [PASS] CONCURRENCY-03: Retry with authoritative version succeeded (version advanced to 3)")

  // ----------------------------------------------------
  // TEST 4: Multiple concurrent comments and accurate comment count
  // ----------------------------------------------------
  console.log("\n[TEST] CONCURRENCY-04: Multiple concurrent comments persist and comment count is accurate")
  const commentCountBefore = 0
  const commentBatch = await Promise.all([
    api(`/api/v1/tasks/${initialTask.id}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { text: "Comment 1 from Alpha" },
    }),
    api(`/api/v1/tasks/${initialTask.id}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
      body: { text: "Comment 2 from Beta" },
    }),
    api(`/api/v1/tasks/${initialTask.id}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { text: "Comment 3 from Alpha" },
    }),
    api(`/api/v1/tasks/${initialTask.id}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
      body: { text: "Comment 4 from Beta" },
    }),
    api(`/api/v1/tasks/${initialTask.id}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { text: "Comment 5 from Alpha" },
    }),
  ])

  for (const c of commentBatch) {
    assert.strictEqual(c.status, 201)
  }

  const taskAfterComments = await api(`/api/v1/tasks/${initialTask.id}`, {
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
  })
  assert.strictEqual(taskAfterComments.data.comments, 5)
  assert.strictEqual(taskAfterComments.data.commentsList.length, 5)
  console.log("  [PASS] CONCURRENCY-04: All 5 concurrent comments persisted and task.comments count is exactly 5")

  // ----------------------------------------------------
  // TEST 5: Assignment notifications without duplicate or self-notifications
  // ----------------------------------------------------
  console.log("\n[TEST] CONCURRENCY-05: Task assignments generate correct notifications without duplicates/self-notifications")
  // User A assigns task to User A (self-assignment) -> should NOT create notification for User A
  const notifsBeforeSelf = await api("/api/v1/notifications", {
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
  })
  const countBeforeSelf = notifsBeforeSelf.data.notifications.length

  await api(`/api/v1/tasks/${initialTask.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { assigneeId: userA.id },
  })

  const notifsAfterSelf = await api("/api/v1/notifications", {
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
  })
  assert.strictEqual(notifsAfterSelf.data.notifications.length, countBeforeSelf)
  console.log("  [PASS] CONCURRENCY-05a: Self-assignment generated zero self-notifications")

  // User A assigns task to User B
  const notifsBeforeB = await api("/api/v1/notifications", {
    headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
  })
  const countBeforeB = notifsBeforeB.data.notifications.length

  await api(`/api/v1/tasks/${initialTask.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { assigneeId: userB.id },
  })

  const notifsAfterB = await api("/api/v1/notifications", {
    headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
  })
  assert.strictEqual(notifsAfterB.data.notifications.length, countBeforeB + 1)
  assert.ok(notifsAfterB.data.notifications[0].title.includes("You were assigned"))
  console.log("  [PASS] CONCURRENCY-05b: Assigning User B created exactly one assignment notification")

  // ----------------------------------------------------
  // TEST 6: Tenant Isolation & Socket.IO Security
  // ----------------------------------------------------
  console.log("\n[TEST] TENANT-01: Unauthorized socket room-join attempts cannot receive private events")
  // Connect socket for User C (Org B)
  const socketC = ioClient(BASE_URL, {
    auth: { token: tokenC, organizationId: orgB.id },
    transports: ["websocket"],
  })
  await new Promise((resolve) => socketC.on("connect", resolve))
  const collectorC = createEventCollector(socketC)

  // User C attempts unauthorized join into Org A room
  socketC.emit("joinOrganization", orgA.id)
  await new Promise((r) => setTimeout(r, 200))

  // User A emits events in Org A (task update, comment)
  await api(`/api/v1/tasks/${initialTask.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { title: "Super Secret Org A Task Title" },
  })
  await api(`/api/v1/tasks/${initialTask.id}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { text: "Confidential Alpha message" },
  })

  await new Promise((r) => setTimeout(r, 400))

  // Assert User C received ZERO events from Org A
  const orgAEventsReceivedByC = collectorC.events.filter(
    (e) =>
      e.data?.title === "Super Secret Org A Task Title" ||
      e.data?.comment?.text === "Confidential Alpha message" ||
      e.data?.target === "Super Secret Org A Task Title",
  )
  assert.strictEqual(orgAEventsReceivedByC.length, 0)
  console.log("  [PASS] TENANT-01: Foreign Org C user received 0 private events from Org A room")

  // ----------------------------------------------------
  // TEST 7: Member removal evicts socket from org room
  // ----------------------------------------------------
  console.log("\n[TEST] TENANT-02: Member removal evicts socket from organization room")
  const socketB = ioClient(BASE_URL, {
    auth: { token: tokenB, organizationId: orgA.id },
    transports: ["websocket"],
  })
  await new Promise((resolve) => socketB.on("connect", resolve))
  const collectorB = createEventCollector(socketB)

  // Verify User B receives an event before removal
  const preRemovePromise = collectorB.waitFor("task.updated")
  await api(`/api/v1/tasks/${initialTask.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { priority: "Urgent" },
  })
  await preRemovePromise
  console.log("  [PASS] TENANT-02a: Active User B verified receiving real-time Org A events")

  // Remove User B from Org A
  const removeRes = await api(`/api/v1/organizations/members/${userB.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
  })
  assert.strictEqual(removeRes.status, 200)

  // Wait for eviction
  await new Promise((r) => setTimeout(r, 200))

  // Now User A emits another task update in Org A
  const eventsCountBefore = collectorB.events.length
  await api(`/api/v1/tasks/${initialTask.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { title: "Post-Removal Task Update" },
  })
  await new Promise((r) => setTimeout(r, 400))

  const leakedEvents = collectorB.events.slice(eventsCountBefore).filter(
    (e) => e.data?.title === "Post-Removal Task Update",
  )
  assert.strictEqual(leakedEvents.length, 0)
  console.log("  [PASS] TENANT-02b: Removed member's socket evicted; post-removal events blocked")

  // ----------------------------------------------------
  // TEST 8: Reconnect does NOT restore revoked room access
  // ----------------------------------------------------
  console.log("\n[TEST] TENANT-03: Reconnect does NOT restore revoked room access")
  socketB.disconnect()
  const socketBReconnected = ioClient(BASE_URL, {
    auth: { token: tokenB, organizationId: orgA.id },
    transports: ["websocket"],
    forceNew: true,
  })
  await new Promise((resolve) => socketBReconnected.on("connect", resolve))
  const collectorBReconnected = createEventCollector(socketBReconnected)

  await api(`/api/v1/tasks/${initialTask.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { title: "Post-Reconnect Test Title" },
  })
  await new Promise((r) => setTimeout(r, 400))

  const reconnectedLeaks = collectorBReconnected.events.filter(
    (e) => e.data?.title === "Post-Reconnect Test Title",
  )
  assert.strictEqual(reconnectedLeaks.length, 0)
  console.log("  [PASS] TENANT-03: Reconnecting socket blocked from joining revoked organization room")

  // ----------------------------------------------------
  // TEST 9: Cross-tenant task assignment rejected
  // ----------------------------------------------------
  console.log("\n[TEST] TENANT-04: Cross-tenant task assignment rejected with 403")
  const crossAssignRes = await api(`/api/v1/tasks/${initialTask.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    body: { assigneeId: userC.id },
  })
  assert.strictEqual(crossAssignRes.status, 403)
  console.log("  [PASS] TENANT-04: Cross-tenant assignment strictly rejected with HTTP 403 Forbidden")

  // Clean up sockets
  socketC.disconnect()
  socketB.disconnect()
  socketBReconnected.disconnect()

  console.log("\n==================================================")
  console.log("ALL CONCURRENCY, STALE-WRITE & TENANT ISOLATION TESTS PASSED!")
  console.log("==================================================")

  if (serverProcess) {
    serverProcess.kill("SIGTERM")
  }
}

runConcurrencyAndIsolationTests().catch((err) => {
  console.error("FATAL SUITE ERROR:", err)
  if (serverProcess) serverProcess.kill("SIGTERM")
  process.exit(1)
})
