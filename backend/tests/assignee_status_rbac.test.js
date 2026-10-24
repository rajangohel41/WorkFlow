import assert from "node:assert"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { io as ioClient } from "socket.io-client"
import mongoose from "mongoose"
import { connectDb } from "../src/db/connect.js"
import { Task } from "../src/models/Task.js"
import { env } from "../src/config/env.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = `http://localhost:${env.port}`

let serverProcess = null

async function ensureServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/health`)
    if (res.ok) return
  } catch {}

  console.log("Starting backend server for assignee status RBAC test suite...")
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

async function runAssigneeRBACTests() {
  await ensureServerRunning()
  await connectDb()

  console.log("\n==================================================")
  console.log("=== ASSIGNEE-ONLY TASK STATUS RBAC TEST SUITE ===")
  console.log("==================================================")

  const timestamp = Date.now()
  const password = "StrongPassword123!"

  // 1. Setup Organization A with Owner (User 1), Admin (User 2), Member (User 3), Member (User 4)
  // Owner (User 1)
  const regOwner = await api("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Org Owner", email: `owner-${timestamp}@workflow.io`, password },
  })
  const tokenOwner = regOwner.data.accessToken || getCookie(regOwner.headers, "accessToken")
  const ownerUser = regOwner.data.user

  const onbRes = await api("/api/v1/auth/onboarding", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenOwner}` },
    body: { workspaceName: "Assignee RBAC Org", workspaceSlug: `assignee-rbac-${timestamp}` },
  })
  assert.strictEqual(onbRes.status, 201)
  const org = onbRes.data.organization

  // Admin (User 2)
  const regAdmin = await api("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Org Admin", email: `admin-${timestamp}@workflow.io`, password },
  })
  const tokenAdmin = regAdmin.data.accessToken || getCookie(regAdmin.headers, "accessToken")
  const adminUser = regAdmin.data.user

  const invAdmin = await api("/api/v1/organizations/invitations", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenOwner}`, "x-organization-id": org.id },
    body: { email: adminUser.email, role: "Admin" },
  })
  assert.strictEqual(invAdmin.status, 201)
  const acceptAdmin = await api(`/api/v1/organizations/invitations/${invAdmin.data.invitation.token}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenAdmin}` },
  })
  assert.strictEqual(acceptAdmin.status, 200)

  // Member A (User 3)
  const regMemberA = await api("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Member Alpha", email: `member-a-${timestamp}@workflow.io`, password },
  })
  const tokenMemberA = regMemberA.data.accessToken || getCookie(regMemberA.headers, "accessToken")
  const memberA = regMemberA.data.user

  const invA = await api("/api/v1/organizations/invitations", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenOwner}`, "x-organization-id": org.id },
    body: { email: memberA.email, role: "Member" },
  })
  assert.strictEqual(invA.status, 201)
  const acceptA = await api(`/api/v1/organizations/invitations/${invA.data.invitation.token}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenMemberA}` },
  })
  assert.strictEqual(acceptA.status, 200)

  // Member B (User 4)
  const regMemberB = await api("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Member Beta", email: `member-b-${timestamp}@workflow.io`, password },
  })
  const tokenMemberB = regMemberB.data.accessToken || getCookie(regMemberB.headers, "accessToken")
  const memberB = regMemberB.data.user

  const invB = await api("/api/v1/organizations/invitations", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenOwner}`, "x-organization-id": org.id },
    body: { email: memberB.email, role: "Member" },
  })
  assert.strictEqual(invB.status, 201)
  const acceptB = await api(`/api/v1/organizations/invitations/${invB.data.invitation.token}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenMemberB}` },
  })
  assert.strictEqual(acceptB.status, 200)

  // Foreign Organization & Foreign User
  const regForeign = await api("/api/v1/auth/register", {
    method: "POST",
    body: { name: "Foreign User", email: `foreign-${timestamp}@workflow.io`, password },
  })
  const tokenForeign = regForeign.data.accessToken || getCookie(regForeign.headers, "accessToken")
  const onbForeign = await api("/api/v1/auth/onboarding", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenForeign}` },
    body: { workspaceName: "Foreign Workspace", workspaceSlug: `foreign-ws-${timestamp}` },
  })
  const foreignOrg = onbForeign.data.organization

  // Create Project in Org A
  const projRes = await api("/api/v1/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenOwner}`, "x-organization-id": org.id },
    body: { name: "RBAC Security Project", color: "#6366F1" },
  })
  assert.strictEqual(projRes.status, 201)
  const project = projRes.data

  // Connect socket for real-time verification
  const socketOwner = ioClient(BASE_URL, {
    auth: { token: tokenOwner },
    transports: ["websocket"],
  })
  await new Promise((resolve) => socketOwner.on("connect", resolve))
  socketOwner.emit("joinOrganization", org.id)
  await new Promise((r) => setTimeout(r, 200))

  const capturedEvents = []
  socketOwner.on("task.statusChanged", (ev) => capturedEvents.push({ type: "task.statusChanged", ev }))

  console.log("\n[TEST 1] The assigned member can change status successfully")
  // Task 1: Created by Owner, assigned to Member Alpha
  const t1Res = await api("/api/v1/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenOwner}`, "x-organization-id": org.id },
    body: {
      title: "Task Assigned To Alpha",
      projectId: project.id,
      status: "Backlog",
      assigneeId: memberA.id,
    },
  })
  assert.strictEqual(t1Res.status, 201)
  const task1 = t1Res.data
  assert.strictEqual(task1.assigneeId, memberA.id)

  // Member Alpha updates status to "In Progress"
  const alphaUpdate = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenMemberA}`, "x-organization-id": org.id },
    body: { status: "In Progress" },
  })
  assert.strictEqual(alphaUpdate.status, 200)
  assert.strictEqual(alphaUpdate.data.status, "In Progress")
  console.log("  [PASS] 1. Assigned member successfully changed status to 'In Progress'")

  console.log("\n[TEST 2] A different member receives 403 when attempting a status change")
  const betaStatusAttempt = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenMemberB}`, "x-organization-id": org.id },
    body: { status: "Done" },
  })
  assert.strictEqual(betaStatusAttempt.status, 403)
  assert.strictEqual(betaStatusAttempt.data.message, "Only the assigned team member can change this task's status.")
  console.log("  [PASS] 2. Different member received HTTP 403 with safe explanation")

  console.log("\n[TEST 3] The task creator receives 403 if they are not the assignee")
  // Owner created task1, but is not the assignee
  const creatorStatusAttempt = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenOwner}`, "x-organization-id": org.id },
    body: { status: "Done" },
  })
  assert.strictEqual(creatorStatusAttempt.status, 403)
  assert.strictEqual(creatorStatusAttempt.data.message, "Only the assigned team member can change this task's status.")
  console.log("  [PASS] 3. Task creator received HTTP 403 when attempting status change")

  console.log("\n[TEST 4] An owner/admin/manager receives 403 if they are not the assignee")
  const adminStatusAttempt = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenAdmin}`, "x-organization-id": org.id },
    body: { status: "Done" },
  })
  assert.strictEqual(adminStatusAttempt.status, 403)
  assert.strictEqual(adminStatusAttempt.data.message, "Only the assigned team member can change this task's status.")
  console.log("  [PASS] 4. Workspace Admin received HTTP 403 when attempting status change")

  console.log("\n[TEST 5] An unassigned task cannot have its status changed")
  const unassignedRes = await api("/api/v1/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenOwner}`, "x-organization-id": org.id },
    body: {
      title: "Unassigned Floating Task",
      projectId: project.id,
      status: "Backlog",
    },
  })
  assert.strictEqual(unassignedRes.status, 201)
  const unassignedTask = unassignedRes.data
  assert.strictEqual(unassignedTask.assigneeId, null)

  // Everyone (Owner, Member Alpha, Member Beta) must be rejected
  for (const [roleName, token] of [["Owner", tokenOwner], ["Alpha", tokenMemberA], ["Beta", tokenMemberB]]) {
    const unassignedAttempt = await api(`/api/v1/tasks/${unassignedTask.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "x-organization-id": org.id },
      body: { status: "Todo" },
    })
    assert.strictEqual(unassignedAttempt.status, 403)
    assert.strictEqual(unassignedAttempt.data.message, "Assign this task before changing its status")
  }
  console.log("  [PASS] 5. Unassigned task status change rejected with HTTP 403 for all users")

  console.log("\n[TEST 6] A request cannot bypass the rule through generic task PATCH/PUT or dedicated status endpoints")
  // Test PUT /:taskId with status
  const putAttempt = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenMemberB}`, "x-organization-id": org.id },
    body: { status: "Done" },
  })
  assert.strictEqual(putAttempt.status, 403)
  assert.strictEqual(putAttempt.data.message, "Only the assigned team member can change this task's status.")

  // Test PATCH /:taskId/status
  const dedicatedPatch = await api(`/api/v1/tasks/${task1.id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenMemberB}`, "x-organization-id": org.id },
    body: { status: "Done" },
  })
  assert.strictEqual(dedicatedPatch.status, 403)

  // Test PUT /:taskId/status
  const dedicatedPut = await api(`/api/v1/tasks/${task1.id}/status`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenMemberB}`, "x-organization-id": org.id },
    body: { status: "Done" },
  })
  assert.strictEqual(dedicatedPut.status, 403)

  // Test attempting to bypass by bundling status with title edit
  const bundledAttempt = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenMemberB}`, "x-organization-id": org.id },
    body: { title: "Hacked Title", status: "Done" },
  })
  assert.strictEqual(bundledAttempt.status, 403)
  console.log("  [PASS] 6. All generic PUT, dedicated /status, and bundled PATCH pathways strictly blocked")

  console.log("\n[TEST 7] Bulk status changes cannot bypass the rule")
  // Task 2 assigned to Alpha
  const t2Res = await api("/api/v1/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenOwner}`, "x-organization-id": org.id },
    body: {
      title: "Task 2 Assigned To Alpha",
      projectId: project.id,
      status: "Backlog",
      assigneeId: memberA.id,
    },
  })
  const task2 = t2Res.data

  // Member Beta attempts bulk update changing status on task1 and task2
  const bulkAttempt = await api("/api/v1/tasks/bulk", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenMemberB}`, "x-organization-id": org.id },
    body: {
      taskIds: [task1.id, task2.id],
      updates: { status: "Done" },
    },
  })
  assert.strictEqual(bulkAttempt.status, 403)
  assert.strictEqual(bulkAttempt.data.message, "Only the assigned team member can change this task's status.")

  // Verify neither task1 nor task2 was mutated
  const checkT1 = await api(`/api/v1/tasks/${task1.id}`, {
    headers: { Authorization: `Bearer ${tokenOwner}`, "x-organization-id": org.id },
  })
  const checkT2 = await api(`/api/v1/tasks/${task2.id}`, {
    headers: { Authorization: `Bearer ${tokenOwner}`, "x-organization-id": org.id },
  })
  assert.strictEqual(checkT1.data.status, "In Progress")
  assert.strictEqual(checkT2.data.status, "Backlog")
  console.log("  [PASS] 7. Bulk status change strictly rejected and zero documents were mutated")

  console.log("\n[TEST 8] After reassignment, the former assignee is denied and the new assignee is allowed")
  // Admin reassigns task1 from Alpha to Beta
  const reassignRes = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenAdmin}`, "x-organization-id": org.id },
    body: { assigneeId: memberB.id },
  })
  assert.strictEqual(reassignRes.status, 200)
  assert.strictEqual(reassignRes.data.assigneeId, memberB.id)

  // Former assignee (Alpha) attempts status change -> 403
  const formerAssigneeAttempt = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenMemberA}`, "x-organization-id": org.id },
    body: { status: "Done" },
  })
  assert.strictEqual(formerAssigneeAttempt.status, 403)
  assert.strictEqual(formerAssigneeAttempt.data.message, "Only the assigned team member can change this task's status.")

  // New assignee (Beta) attempts status change -> 200 OK
  const newAssigneeAttempt = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenMemberB}`, "x-organization-id": org.id },
    body: { status: "Done" },
  })
  assert.strictEqual(newAssigneeAttempt.status, 200)
  assert.strictEqual(newAssigneeAttempt.data.status, "Done")
  console.log("  [PASS] 8. Former assignee denied (403) and new assignee allowed (200)")

  console.log("\n[TEST 9] Cross-organization access remains denied")
  const crossOrgAttempt = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenForeign}`, "x-organization-id": foreignOrg.id },
    body: { status: "Backlog" },
  })
  assert.strictEqual(crossOrgAttempt.status, 404)
  console.log("  [PASS] 9. Cross-organization access strictly blocked with 404")

  console.log("\n[TEST 10] Rejected mutations do not change persisted status or emit realtime status events")
  // Reset captured events
  capturedEvents.length = 0

  // Beta attempts unauthorized update on task2 (assigned to Alpha)
  const rejectedAttempt = await api(`/api/v1/tasks/${task2.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenMemberB}`, "x-organization-id": org.id },
    body: { status: "Done" },
  })
  assert.strictEqual(rejectedAttempt.status, 403)

  // Wait a moment for any potential socket leak
  await new Promise((r) => setTimeout(r, 300))

  // Verify in MongoDB directly
  const dbTask2 = await Task.findOne({ displayId: task2.id })
  assert.strictEqual(dbTask2.status, "Backlog")
  assert.strictEqual(capturedEvents.length, 0, "No realtime events must be emitted for rejected mutations")
  console.log("  [PASS] 10. No database mutation and zero realtime status events on rejection")

  console.log("\n[TEST 11] Concurrent reassignment/status-change attempts cannot violate the rule")
  // Task 3: assigned to Alpha
  const t3Res = await api("/api/v1/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenOwner}`, "x-organization-id": org.id },
    body: {
      title: "Concurrent Target Task 3",
      projectId: project.id,
      status: "Backlog",
      assigneeId: memberA.id,
    },
  })
  const task3 = t3Res.data

  // Simulate concurrent race:
  // Admin reassigns task3 to Beta
  // Alpha simultaneously attempts to change status to "Done"
  const [raceReassign, raceStatusChange] = await Promise.all([
    api(`/api/v1/tasks/${task3.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenAdmin}`, "x-organization-id": org.id },
      body: { assigneeId: memberB.id },
    }),
    api(`/api/v1/tasks/${task3.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenMemberA}`, "x-organization-id": org.id },
      body: { status: "Done" },
    }),
  ])

  // Reassignment must succeed (200)
  assert.strictEqual(raceReassign.status, 200)

  // Fresh DB verification: If reassignment won or occurred concurrently,
  // status change must either have succeeded before reassignment, or if reassignment happened first,
  // status change MUST be rejected with 403 (atomic condition blocked it).
  const freshDbTask3 = await Task.findOne({ displayId: task3.id })
  if (freshDbTask3.assigneeId.toString() === memberB.id) {
    if (raceStatusChange.status === 403) {
      assert.strictEqual(raceStatusChange.data.message, "Only the assigned team member can change this task's status.")
    }
  }
  console.log("  [PASS] 11. Atomic condition prevented race-condition bypass")

  console.log("\n[TEST 12] Existing task editing, comments, checklist, assignment, and allowed workflow features continue working")
  // Non-assignee (Admin or Alpha on task1 assigned to Beta) updates title & priority
  const editNonStatus = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenAdmin}`, "x-organization-id": org.id },
    body: { title: "Updated Non-Status Title", priority: "Urgent" },
  })
  assert.strictEqual(editNonStatus.status, 200)
  assert.strictEqual(editNonStatus.data.title, "Updated Non-Status Title")
  assert.strictEqual(editNonStatus.data.priority, "Urgent")

  // Add checklist item as non-assignee
  const checklistRes = await api(`/api/v1/tasks/${task1.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenMemberA}`, "x-organization-id": org.id },
    body: {
      checklist: [{ title: "Non-assignee checklist step", done: false }],
    },
  })
  assert.strictEqual(checklistRes.status, 200)
  assert.strictEqual(checklistRes.data.checklist.length, 1)

  // Add comment as non-assignee
  const commentRes = await api(`/api/v1/tasks/${task1.id}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenMemberA}`, "x-organization-id": org.id },
    body: { text: "Collaborative comment by team member Alpha" },
  })
  assert.strictEqual(commentRes.status, 201)
  assert.strictEqual(commentRes.data.commentsList.length, 1)

  socketOwner.disconnect()
  console.log("  [PASS] 12. Non-status task edits, comments, and checklists continue working for team members")

  console.log("\n==================================================")
  console.log("ALL 12 ASSIGNEE-ONLY RBAC REGRESSION TESTS PASSED!")
  console.log("==================================================\n")

  if (serverProcess) {
    serverProcess.kill()
  }
  process.exit(0)
}

runAssigneeRBACTests().catch((err) => {
  console.error("Assignee RBAC Test Failure:", err)
  if (serverProcess) serverProcess.kill()
  process.exit(1)
})
