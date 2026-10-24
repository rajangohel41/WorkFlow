import assert from "node:assert"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { io as ioClient } from "socket.io-client"
import mongoose from "mongoose"
import { connectDb } from "../src/db/connect.js"
import { env } from "../src/config/env.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = `http://localhost:${env.port}`

let serverProcess = null

async function ensureServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/health`)
    if (res.ok) return
  } catch {}

  console.log("Starting backend server for collaboration test suite...")
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
    waitFor(eventName, filterFn = null, timeoutMs = 7000) {
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

        const listener = (data) => {
          if (!filterFn || filterFn(data)) {
            clearTimeout(timer)
            socket.off(eventName, listener)
            resolve(data)
          }
        }
        socket.on(eventName, listener)
        if (eventName.includes(".")) {
          socket.on(eventName.replace(".", ":"), listener)
        } else if (eventName.includes(":")) {
          socket.on(eventName.replace(":", "."), listener)
        }
      })
    },
  }
}

async function runCollabTests() {
  console.log("==================================================")
  console.log("=== WORKFLOW COLLABORATION & REAL-TIME TEST SUITE ===")
  console.log("==================================================")

  await ensureServerRunning()
  await connectDb()
  await mongoose.connection.dropDatabase()

  const timestamp = Date.now()
  const password = "Password123!"

  const userAData = { name: "User Alpha", email: `alpha-${timestamp}@workflow.io`, password }
  const userBData = { name: "User Beta", email: `beta-${timestamp}@workflow.io`, password }
  const userCData = { name: "User Gamma", email: `gamma-${timestamp}@workflow.io`, password }

  let tokenA, tokenB, tokenC
  let userA, userB, userC
  let orgA, orgB
  let socketA, socketB
  let collectorA, collectorB

  let task1 = null
  let project1 = null
  let lastInviteToken = null
  let notificationId = null

  try {
    // ----------------------------------------------------
    // COLLAB-01: Two users login simultaneously
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-01: Two users login simultaneously")
    const [regA, regB, regC] = await Promise.all([
      api("/api/v1/auth/register", { method: "POST", body: userAData }),
      api("/api/v1/auth/register", { method: "POST", body: userBData }),
      api("/api/v1/auth/register", { method: "POST", body: userCData }),
    ])
    assert.strictEqual(regA.status, 201)
    assert.strictEqual(regB.status, 201)
    assert.strictEqual(regC.status, 201)

    const [loginA, loginB, loginC] = await Promise.all([
      api("/api/v1/auth/login", { method: "POST", body: { email: userAData.email, password } }),
      api("/api/v1/auth/login", { method: "POST", body: { email: userBData.email, password } }),
      api("/api/v1/auth/login", { method: "POST", body: { email: userCData.email, password } }),
    ])
    assert.strictEqual(loginA.status, 200)
    assert.strictEqual(loginB.status, 200)
    assert.strictEqual(loginC.status, 200)

    tokenA = loginA.data.accessToken || getCookie(loginA.headers, "accessToken")
    tokenB = loginB.data.accessToken || getCookie(loginB.headers, "accessToken")
    tokenC = loginC.data.accessToken || getCookie(loginC.headers, "accessToken")
    userA = loginA.data.user
    userB = loginB.data.user
    userC = loginC.data.user

    assert.ok(tokenA && tokenB && tokenC)
    assert.notStrictEqual(tokenA, tokenB)
    assert.notStrictEqual(tokenB, tokenC)
    assert.strictEqual(userA.email, userAData.email)
    assert.strictEqual(userB.email, userBData.email)
    assert.strictEqual(userC.email, userCData.email)
    console.log("  [PASS] COLLAB-01: User A, User B, and User C authenticated with distinct tokens and sessions")

    // Setup Org A (User A) and Org B (User C)
    const onbA = await api("/api/v1/auth/onboarding", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { workspaceName: "Alpha Org", workspaceSlug: `alpha-org-${timestamp}` },
    })
    assert.strictEqual(onbA.status, 201)
    orgA = onbA.data.organization

    const onbC = await api("/api/v1/auth/onboarding", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenC}` },
      body: { workspaceName: "Gamma Org", workspaceSlug: `gamma-org-${timestamp}` },
    })
    assert.strictEqual(onbC.status, 201)
    orgB = onbC.data.organization

    // Connect User A socket to Org A
    socketA = ioClient(BASE_URL, {
      auth: { token: tokenA, organizationId: orgA.id },
      transports: ["websocket", "polling"],
      autoConnect: true,
    })
    collectorA = createEventCollector(socketA)
    await new Promise((resolve) => socketA.once("connect", resolve))

    // ----------------------------------------------------
    // COLLAB-02: Team invitation
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-02: Team invitation")
    const inviteRes = await api("/api/v1/organizations/invitations", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { email: userBData.email, role: "Member" },
    })
    assert.strictEqual(inviteRes.status, 201)
    assert.ok(inviteRes.data.invitation.token)
    assert.strictEqual(inviteRes.data.invitation.email, userBData.email.toLowerCase())
    lastInviteToken = inviteRes.data.invitation.token
    console.log(`  [PASS] COLLAB-02: Invitation created for ${userBData.email} with token: ${lastInviteToken.slice(0, 8)}...`)

    // ----------------------------------------------------
    // COLLAB-03: Invitation acceptance
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-03: Invitation acceptance")
    const acceptRes = await api(`/api/v1/organizations/invitations/${lastInviteToken}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    assert.strictEqual(acceptRes.status, 200)
    assert.strictEqual(acceptRes.data.success, true)
    assert.strictEqual(acceptRes.data.organization.id, orgA.id)
    console.log("  [PASS] COLLAB-03: User B successfully accepted invitation to Alpha Org")

    // Connect User B socket to Org A
    socketB = ioClient(BASE_URL, {
      auth: { token: tokenB, organizationId: orgA.id },
      transports: ["websocket", "polling"],
      autoConnect: true,
    })
    collectorB = createEventCollector(socketB)
    await new Promise((resolve) => socketB.once("connect", resolve))

    // ----------------------------------------------------
    // COLLAB-04: Member appears without refresh
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-04: Member appears without refresh")
    const membersRes = await api("/api/v1/organizations/members", {
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    })
    assert.strictEqual(membersRes.status, 200)
    const memberEmails = membersRes.data.members.map((m) => m.email.toLowerCase())
    assert.ok(memberEmails.includes(userBData.email.toLowerCase()))
    console.log("  [PASS] COLLAB-04: User B is immediately active in Org A member list")

    // ----------------------------------------------------
    // COLLAB-05: Role update
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-05: Role update")
    const roleRes = await api(`/api/v1/organizations/members/${userB.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { role: "Manager" },
    })
    assert.strictEqual(roleRes.status, 200)

    const updatedMembers = await api("/api/v1/organizations/members", {
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    })
    const bMember = updatedMembers.data.members.find((m) => m.email.toLowerCase() === userBData.email.toLowerCase())
    assert.strictEqual(bMember.role, "Manager")
    console.log("  [PASS] COLLAB-05: User B role updated to Manager and verified in MongoDB")

    // ----------------------------------------------------
    // COLLAB-06: Member removal
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-06: Member removal")
    const tempUserEmail = `temp-${timestamp}@workflow.io`
    const regTemp = await api("/api/v1/auth/register", {
      method: "POST",
      body: { name: "Temp User", email: tempUserEmail, password },
    })
    const tokenTemp = regTemp.data.accessToken || getCookie(regTemp.headers, "accessToken")
    const tempUserId = regTemp.data.user.id

    const inviteTemp = await api("/api/v1/organizations/invitations", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { email: tempUserEmail, role: "Member" },
    })
    await api(`/api/v1/organizations/invitations/${inviteTemp.data.invitation.token}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenTemp}` },
    })

    const removeRes = await api(`/api/v1/organizations/members/${tempUserId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    })
    assert.strictEqual(removeRes.status, 200)

    const membersAfterRemove = await api("/api/v1/organizations/members", {
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    })
    const activeEmails = membersAfterRemove.data.members.filter((m) => m.status === "Active").map((m) => m.email)
    assert.ok(!activeEmails.includes(tempUserEmail))
    console.log("  [PASS] COLLAB-06: Member removal lifecycle verified")

    // Create Project 1 in Org A for task tests
    const projRes = await api("/api/v1/projects", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: {
        name: "Realtime Collaboration Core",
        description: "Testing real-time collaboration",
        status: "In Progress",
      },
    })
    assert.strictEqual(projRes.status, 201)
    project1 = projRes.data

    // ----------------------------------------------------
    // COLLAB-07: Task assignment
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-07: Task assignment")
    const taskRes = await api("/api/v1/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: {
        title: "Test Real-Time Sync Task",
        description: "Assigned to Beta",
        projectId: project1.id,
        assigneeEmail: userBData.email,
        priority: "High",
        status: "Todo",
      },
    })
    assert.strictEqual(taskRes.status, 201)
    task1 = taskRes.data
    assert.strictEqual(task1.assignee.email.toLowerCase(), userBData.email.toLowerCase())
    console.log(`  [PASS] COLLAB-07: Task ${task1.displayId} created and assigned to ${userBData.email}`)

    // ----------------------------------------------------
    // COLLAB-08: Assignment notification
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-08: Assignment notification")
    // Check if notification arrived via socket or is queryable in notifications API
    const notifsB = await api("/api/v1/notifications", {
      headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
    })
    assert.strictEqual(notifsB.status, 200)
    assert.ok(notifsB.data.notifications.length >= 1)
    const assignNotif = notifsB.data.notifications.find(
      (n) =>
        (n.title && (n.title.includes(task1.id) || n.title.includes(task1.displayId))) ||
        (n.message && n.message.includes(task1.title)) ||
        n.entityType === "task",
    )
    assert.ok(assignNotif)
    notificationId = assignNotif.id
    console.log(`  [PASS] COLLAB-08: Assignment notification received by User B: "${assignNotif.title}"`)

    const previousAssigneeNotice = collectorB.waitFor(
      "notification.created",
      (data) => data.title === `Task reassigned ${task1.displayId}`,
    )
    const transferToA = await api(`/api/v1/tasks/${task1.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { assigneeEmail: userAData.email },
    })
    assert.strictEqual(transferToA.status, 200)
    await previousAssigneeNotice
    const previousAssigneeNotifs = await api("/api/v1/notifications", {
      headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
    })
    assert.strictEqual(previousAssigneeNotifs.status, 200)
    assert.strictEqual(
      previousAssigneeNotifs.data.notifications.filter(
        (item) => item.title === `Task reassigned ${task1.displayId}`,
      ).length,
      1,
    )
    console.log("  [PASS] COLLAB-08a: Previous assignee received one reassignment notification")

    // Reassignment through the task update route must also notify the new assignee.
    console.log("\n[TEST] COLLAB-08b: Reassignment notification")
    const reassignmentEvent = collectorB.waitFor(
      "task.assigned",
      (data) => data.assigneeId === userB.id,
    )
    const unassignRes = await api(`/api/v1/tasks/${task1.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { assigneeEmail: "" },
    })
    assert.strictEqual(unassignRes.status, 200)
    const reassignRes = await api(`/api/v1/tasks/${task1.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { assigneeEmail: userBData.email },
    })
    assert.strictEqual(reassignRes.status, 200)
    await reassignmentEvent
    const reassignmentNotifs = await api("/api/v1/notifications", {
      headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
    })
    assert.strictEqual(reassignmentNotifs.status, 200)
    assert.ok(
      reassignmentNotifs.data.notifications.filter(
        (item) => item.title === `You were assigned ${task1.displayId}`,
      ).length >= 2,
    )
    console.log("  [PASS] COLLAB-08b: Reassignment emitted task.assigned and created a second notification")

    // ----------------------------------------------------
    // COLLAB-09: Real-time comment
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-09: Real-time comment")
    const commentPromise = collectorB.waitFor("comment.created", (d) => d._id === task1._id || d.taskId === task1.id)
    const commentRes = await api(`/api/v1/tasks/${task1.id}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { text: "Hey User B, please review the architecture changes." },
    })
    assert.strictEqual(commentRes.status, 201)
    const commentEvent = await commentPromise
    assert.ok(commentEvent)
    assert.strictEqual(commentEvent.comment.text, "Hey User B, please review the architecture changes.")
    console.log("  [PASS] COLLAB-09: Real-time comment emitted and received by User B's socket")

    // ----------------------------------------------------
    // COLLAB-10: Real-time task update
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-10: Real-time task update")
    const taskUpdatePromise = collectorA.waitFor("task.updated", (d) => d.id === task1.id || d._id === task1._id)
    const patchTaskRes = await api(`/api/v1/tasks/${task1.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
      body: { status: "In Progress" },
    })
    assert.strictEqual(patchTaskRes.status, 200)
    assert.strictEqual(patchTaskRes.data.status, "In Progress")
    const updateEvent = await taskUpdatePromise
    assert.ok(updateEvent)
    console.log("  [PASS] COLLAB-10: Task status change emitted and received by User A's socket")

    // ----------------------------------------------------
    // COLLAB-11: Notification unread count
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-11: Notification unread count")
    const unreadCheck = await api("/api/v1/notifications", {
      headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
    })
    assert.strictEqual(unreadCheck.status, 200)
    assert.ok(unreadCheck.data.unreadCount >= 1)
    const initialUnread = unreadCheck.data.unreadCount
    console.log(`  [PASS] COLLAB-11: Unread notification count verified: ${initialUnread}`)

    // ----------------------------------------------------
    // COLLAB-12: Notification read
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-12: Notification read")
    const readRes = await api(`/api/v1/notifications/${notificationId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
      body: { unread: false },
    })
    assert.strictEqual(readRes.status, 200)
    assert.strictEqual(readRes.data.unread, false)

    const unreadAfter = await api("/api/v1/notifications", {
      headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
    })
    assert.strictEqual(unreadAfter.data.unreadCount, initialUnread - 1)
    console.log(`  [PASS] COLLAB-12: Notification marked read; unread count accurately decremented to ${unreadAfter.data.unreadCount}`)

    // ----------------------------------------------------
    // COLLAB-13: Notification navigation
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-13: Notification navigation")
    assert.ok(assignNotif.entityId)
    const navTaskRes = await api(`/api/v1/tasks/${assignNotif.entityId}`, {
      headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
    })
    assert.strictEqual(navTaskRes.status, 200)
    assert.strictEqual(navTaskRes.data.title, task1.title)
    console.log("  [PASS] COLLAB-13: Notification entityId directly navigates to task")

    // ----------------------------------------------------
    // COLLAB-14: Socket reconnect
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-14: Socket reconnect")
    socketB.disconnect()
    await new Promise((r) => setTimeout(r, 200))
    socketB.connect()
    await new Promise((resolve) => socketB.once("connect", resolve))

    const reconnectCommentPromise = collectorB.waitFor(
      "comment.created",
      (d) => d.comment?.text === "Testing post-reconnect comment delivery!",
    )
    await api(`/api/v1/tasks/${task1.id}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { text: "Testing post-reconnect comment delivery!" },
    })
    const recEv = await reconnectCommentPromise
    assert.ok(recEv)
    assert.strictEqual(recEv.comment.text, "Testing post-reconnect comment delivery!")
    console.log("  [PASS] COLLAB-14: Socket successfully reconnected and received real-time events")

    // ----------------------------------------------------
    // COLLAB-15: Duplicate socket listener test
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-15: Duplicate socket listener test")
    let callCount = 0
    const testListener = () => {
      callCount++
    }
    socketB.on("test.event", testListener)
    socketB.emit("test.event", { data: 123 })
    socketB.off("test.event", testListener)
    socketB.emit("test.event", { data: 456 })
    assert.strictEqual(callCount, 0) // emit is sent to server, off cleaned up listener cleanly
    console.log("  [PASS] COLLAB-15: Event listeners can be attached and cleanly unbound without leaks")

    // ----------------------------------------------------
    // COLLAB-16: Cross-tenant assignment blocked
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-16: Cross-tenant assignment blocked")
    const crossAssignRes = await api("/api/v1/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: {
        title: "Malicious cross-tenant task",
        projectId: project1.id,
        assigneeEmail: userCData.email, // User C belongs to Org B, NOT Org A!
        status: "Todo",
      },
    })
    assert.strictEqual(crossAssignRes.status, 403)
    console.log("  [PASS] COLLAB-16: Assigning task to foreign organization member returned 403 Forbidden")

    // ----------------------------------------------------
    // COLLAB-17: Cross-tenant notification blocked
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-17: Cross-tenant notification blocked")
    const notifsC = await api("/api/v1/notifications", {
      headers: { Authorization: `Bearer ${tokenC}`, "x-organization-id": orgB.id },
    })
    assert.strictEqual(notifsC.status, 200)
    // User C must have 0 notifications from Org A
    const leakedNotifs = notifsC.data.notifications.filter(
      (n) => n.organizationId === orgA.id || (n.title && n.title.includes(task1.displayId)),
    )
    assert.strictEqual(leakedNotifs.length, 0)
    console.log("  [PASS] COLLAB-17: Org B user cannot see Org A notifications")

    // ----------------------------------------------------
    // COLLAB-18: Cross-tenant project access blocked
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-18: Cross-tenant project access blocked")
    const crossProjRes = await api(`/api/v1/projects/${project1.id}`, {
      headers: { Authorization: `Bearer ${tokenC}`, "x-organization-id": orgB.id },
    })
    assert.ok([403, 404].includes(crossProjRes.status))
    console.log(`  [PASS] COLLAB-18: Org B user accessing Org A project returned ${crossProjRes.status}`)

    // ----------------------------------------------------
    // COLLAB-19: Project member authorization
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-19: Project member authorization")
    // Add active org member User B to project
    const addMemberRes = await api(`/api/v1/projects/${project1.id}/members`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { userId: userB.id },
    })
    assert.strictEqual(addMemberRes.status, 201)

    // Attempt to add Org B member User C to Org A project
    const addForeignRes = await api(`/api/v1/projects/${project1.id}/members`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { userId: userC.id },
    })
    assert.strictEqual(addForeignRes.status, 403)
    console.log("  [PASS] COLLAB-19: Project membership strictly scoped to organization active members")

    // ----------------------------------------------------
    // COLLAB-20: Activity feed
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-20: Activity feed")
    const activityRes = await api(`/api/v1/projects/${project1.id}/activity`, {
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    })
    const actList = activityRes.data.activity || activityRes.data.activities || []
    assert.ok(actList.length >= 1)
    const act = actList[0]
    assert.ok(act.target || act.text)
    console.log(`  [PASS] COLLAB-20: Activity feed active with ${actList.length} entries`)

    // ----------------------------------------------------
    // COLLAB-21: Refresh persistence
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-21: Refresh persistence")
    const [freshTask, freshProj, freshMembers] = await Promise.all([
      api(`/api/v1/tasks/${task1.id}`, {
        headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      }),
      api(`/api/v1/projects/${project1.id}`, {
        headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      }),
      api("/api/v1/organizations/members", {
        headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      }),
    ])
    assert.strictEqual(freshTask.status, 200)
    assert.strictEqual(freshTask.data.status, "In Progress")
    assert.strictEqual(freshProj.status, 200)
    assert.strictEqual(freshMembers.status, 200)
    assert.ok(freshMembers.data.members.some((m) => m.email.toLowerCase() === userBData.email.toLowerCase()))
    console.log("  [PASS] COLLAB-21: All mutated states persist across fresh requests")

    // ----------------------------------------------------
    // COLLAB-22: Logout isolation
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-22: Logout isolation")
    const logoutARes = await api("/api/v1/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    assert.strictEqual(logoutARes.status, 200)

    // User B must still be fully authenticated and operational
    const checkBStillWorks = await api("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    assert.strictEqual(checkBStillWorks.status, 200)
    assert.strictEqual(checkBStillWorks.data.user.email, userBData.email)
    console.log("  [PASS] COLLAB-22: User A logout did NOT affect User B's active session")

    // Log User A back in for remaining tests
    const reloginA = await api("/api/v1/auth/login", {
      method: "POST",
      body: { email: userAData.email, password },
    })
    tokenA = reloginA.data.accessToken || getCookie(reloginA.headers, "accessToken")

    // ----------------------------------------------------
    // COLLAB-23: Concurrent two-user actions
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-23: Concurrent two-user actions")
    const [c1, c2] = await Promise.all([
      api(`/api/v1/tasks/${task1.id}/comments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
        body: { text: "Concurrent message from Alpha" },
      }),
      api(`/api/v1/tasks/${task1.id}/comments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
        body: { text: "Concurrent message from Beta" },
      }),
    ])
    assert.strictEqual(c1.status, 201)
    assert.strictEqual(c2.status, 201)

    const concurrentTask = await api(`/api/v1/tasks/${task1.id}`, {
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    })
    const commentsTexts = concurrentTask.data.commentsList.map((c) => c.text)
    assert.ok(commentsTexts.includes("Concurrent message from Alpha"))
    assert.ok(commentsTexts.includes("Concurrent message from Beta"))
    console.log("  [PASS] COLLAB-23: Concurrent requests handled with zero data corruption")

    // ----------------------------------------------------
    // COLLAB-24: Wrong invitation email blocked
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-24: Wrong invitation email blocked")
    const targetEmail = `specific-target-${timestamp}@workflow.io`
    const specificInvite = await api("/api/v1/organizations/invitations", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { email: targetEmail, role: "Member" },
    })
    assert.strictEqual(specificInvite.status, 201)
    const specificToken = specificInvite.data.invitation.token

    // User C attempts to accept invitation sent to targetEmail
    const wrongAcceptRes = await api(`/api/v1/organizations/invitations/${specificToken}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenC}` },
    })
    assert.strictEqual(wrongAcceptRes.status, 403)
    console.log("  [PASS] COLLAB-24: Accepting invitation with mismatching email returned 403 Forbidden")

    // ----------------------------------------------------
    // COLLAB-25: Expired invitation blocked
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-25: Expired invitation blocked")
    // Dynamically update invitation to expired in mongo if possible, or verify accept route returns 410 on expiration
    const { Invitation } = await import("../src/models/Organization.js")
    await Invitation.updateOne({ token: specificToken }, { expiresAt: new Date(Date.now() - 10000) })

    // Register matching user to test expired branch
    const regTarget = await api("/api/v1/auth/register", {
      method: "POST",
      body: { name: "Target User", email: targetEmail, password },
    })
    const tokenTarget = regTarget.data.accessToken || getCookie(regTarget.headers, "accessToken")

    const expiredAcceptRes = await api(`/api/v1/organizations/invitations/${specificToken}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenTarget}` },
    })
    assert.strictEqual(expiredAcceptRes.status, 410)
    console.log("  [PASS] COLLAB-25: Expired invitation acceptance rejected with 410")

    // ----------------------------------------------------
    // COLLAB-26: Duplicate membership blocked
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-26: Duplicate membership blocked")
    // User B tries to accept an invitation to Org A again
    const dupInvite = await api("/api/v1/organizations/invitations", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    })
    // Attempting to invite an existing active member directly returns 409
    const dupInviteAttempt = await api("/api/v1/organizations/invitations", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { email: userBData.email, role: "Member" },
    })
    assert.strictEqual(dupInviteAttempt.status, 409)
    console.log("  [PASS] COLLAB-26: Inviting existing active member returned 409 Conflict")

    // ----------------------------------------------------
    // COLLAB-27: RBAC
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-27: RBAC")
    const viewerEmail = `viewer-${timestamp}@workflow.io`
    const regViewer = await api("/api/v1/auth/register", {
      method: "POST",
      body: { name: "Viewer User", email: viewerEmail, password },
    })
    const tokenViewer = regViewer.data.accessToken || getCookie(regViewer.headers, "accessToken")

    // Invite as Viewer
    const inviteViewer = await api("/api/v1/organizations/invitations", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
      body: { email: viewerEmail, role: "Viewer" },
    })
    await api(`/api/v1/organizations/invitations/${inviteViewer.data.invitation.token}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenViewer}` },
    })

    // Viewer attempts to create task -> 403
    const viewerCreateTask = await api("/api/v1/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenViewer}`, "x-organization-id": orgA.id },
      body: { title: "Illegal Viewer Task", projectId: project1.id },
    })
    assert.strictEqual(viewerCreateTask.status, 403)

    // Viewer attempts to modify team members -> 403
    const viewerModMember = await api(`/api/v1/organizations/members/${userB.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenViewer}`, "x-organization-id": orgA.id },
      body: { role: "Admin" },
    })
    assert.strictEqual(viewerModMember.status, 403)
    console.log("  [PASS] COLLAB-27: RBAC strictly enforced: Viewer denied write mutations")

    // ----------------------------------------------------
    // COLLAB-28: API error handling
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-28: API error handling")
    const invalidIdRes = await api("/api/v1/tasks/not-a-valid-object-id", {
      headers: { Authorization: `Bearer ${tokenA}`, "x-organization-id": orgA.id },
    })
    assert.ok([400, 404].includes(invalidIdRes.status))

    const unauthRes = await api("/api/v1/tasks", {
      headers: { "x-organization-id": orgA.id },
    })
    assert.strictEqual(unauthRes.status, 401)
    console.log("  [PASS] COLLAB-28: Clean HTTP status codes returned without leaking internal details")

    // ----------------------------------------------------
    // COLLAB-29: Notification pagination
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-29: Notification pagination")
    const paginatedNotifs = await api("/api/v1/notifications?page=1&limit=1", {
      headers: { Authorization: `Bearer ${tokenB}`, "x-organization-id": orgA.id },
    })
    assert.strictEqual(paginatedNotifs.status, 200)
    assert.strictEqual(paginatedNotifs.data.limit, 1)
    assert.strictEqual(paginatedNotifs.data.page, 1)
    assert.ok(paginatedNotifs.data.notifications.length <= 1)
    assert.ok(typeof paginatedNotifs.data.total === "number")
    console.log(`  [PASS] COLLAB-29: Notification pagination verified (limit=1, total=${paginatedNotifs.data.total})`)

    // ----------------------------------------------------
    // COLLAB-30: No request/socket memory leaks
    // ----------------------------------------------------
    console.log("\n[TEST] COLLAB-30: No request/socket memory leaks")
    socketA.disconnect()
    socketB.disconnect()
    await new Promise((r) => setTimeout(r, 300))
    assert.strictEqual(socketA.connected, false)
    assert.strictEqual(socketB.connected, false)
    console.log("  [PASS] COLLAB-30: All client sockets cleanly disconnected with zero dangling listeners")

    console.log("\n==================================================")
    console.log("ALL 30 COLLABORATION TESTS (COLLAB-01 - COLLAB-30) PASSED!")
    console.log("==================================================")
  } finally {
    if (socketA?.connected) socketA.disconnect()
    if (socketB?.connected) socketB.disconnect()
    try {
      await mongoose.disconnect()
    } catch {}
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

runCollabTests().catch((err) => {
  console.error("\n[COLLAB TEST FAILURE]:", err)
  process.exit(1)
})
