import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(__dirname, "../../backend")
const TEST_PORT = 5101
const API_BASE = `http://localhost:${TEST_PORT}/api/v1`

process.env.VITE_API_URL = API_BASE

let serverProcess = null

async function isServerRunning() {
  try {
    const res = await fetch(`http://localhost:${TEST_PORT}/health`)
    return res.ok
  } catch {
    return false
  }
}

async function startServerIfNeeded() {
  if (await isServerRunning()) return

  serverProcess = spawn(process.execPath, ["src/index.js"], {
    cwd: backendRoot,
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "test",
      WORKFLOW_TEST_PORT: String(TEST_PORT),
      MONGODB_TEST_URI: process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/workflow_test",
    },
  })

  const start = Date.now()
  while (Date.now() - start < 15000) {
    if (await isServerRunning()) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error("Failed to start backend test server on port " + TEST_PORT)
}

async function runAssigneeStatusUITests() {
  console.log("==================================================")
  console.log("=== FRONTEND ASSIGNEE STATUS UI & RBAC TESTS ===")
  console.log("==================================================")

  await startServerIfNeeded()

  const { getTaskStatusPermission } = await import("../src/utils/taskPermissions.js")
  const { authService } = await import("../src/services/authService.js")
  const { projectService } = await import("../src/services/projectService.js")
  const { taskService } = await import("../src/services/taskService.js")
  const { teamService } = await import("../src/services/teamService.js")
  const { setAuthToken, setRefreshToken, setOrganizationId } = await import("../src/api/client.js")
  const { useAppStore } = await import("../src/store/useAppStore.js")

  const timestamp = Date.now()
  const userAEmail = `assignee-ui-a-${timestamp}@workflow.test`
  const userBEmail = `assignee-ui-b-${timestamp}@workflow.test`
  const password = "ComplexPassword123!"

  let userA = null
  let userB = null
  let organization = null
  let project = null
  let task = null

  try {
    // ----------------------------------------------------
    // 1. UNIT TESTS: getTaskStatusPermission
    // ----------------------------------------------------
    console.log("\n[TEST FE-UI-01] getTaskStatusPermission unit checks")
    const currentUser = { id: "user-123", email: "alice@workflow.io" }

    // Case A: Unassigned task
    const unassignedTask = { id: "WF-1", status: "Backlog", assigneeId: null, assignee: null }
    const unassignedPerm = getTaskStatusPermission(unassignedTask, currentUser)
    assert.equal(unassignedPerm.canChange, false)
    assert.equal(unassignedPerm.reason, "Assign this task before changing its status")
    assert.equal(unassignedPerm.isUnassigned, true)

    // Case B: Task assigned to another user
    const otherUserTask = {
      id: "WF-2",
      status: "Backlog",
      assigneeId: "user-999",
      assignee: { id: "user-999", email: "bob@workflow.io" },
    }
    const otherPerm = getTaskStatusPermission(otherUserTask, currentUser)
    assert.equal(otherPerm.canChange, false)
    assert.equal(otherPerm.reason, "Only the assigned team member can change this task's status.")
    assert.equal(otherPerm.isUnassigned, false)

    // Case C: Task assigned to current user by assigneeId
    const myTaskById = {
      id: "WF-3",
      status: "Backlog",
      assigneeId: "user-123",
      assignee: { id: "user-123", email: "alice@workflow.io" },
    }
    const myPermById = getTaskStatusPermission(myTaskById, currentUser)
    assert.equal(myPermById.canChange, true)
    assert.equal(myPermById.reason, "")

    // Case D: Task assigned to current user by assignee email match
    const myTaskByEmail = {
      id: "WF-4",
      status: "Backlog",
      assigneeId: null,
      assignee: { name: "Alice", email: "Alice@Workflow.io" },
    }
    const myPermByEmail = getTaskStatusPermission(myTaskByEmail, currentUser)
    assert.equal(myPermByEmail.canChange, true)
    assert.equal(myPermByEmail.reason, "")
    console.log("  [PASS] FE-UI-01: getTaskStatusPermission correctly classifies unassigned, other, and assigned states")

    // ----------------------------------------------------
    // 2. BACKEND / FRONTEND INTEGRATION SETUP
    // ----------------------------------------------------
    console.log("\n[TEST FE-UI-02] Environment bootstrap & users setup")
    const regA = await authService.register({
      name: "Alice Owner",
      email: userAEmail,
      password,
    })
    userA = regA.user
    organization = regA.organization

    const loginA = await authService.login({ email: userAEmail, password })
    const tokenA = loginA.accessToken
    setAuthToken(tokenA)
    setOrganizationId(organization.id)
    useAppStore.getState().setAuth(userA)
    useAppStore.getState().setOrganization(organization)

    // Create Project
    const projRes = await projectService.create({
      name: "Assignee UI Project",
      color: "#6366F1",
    })
    project = projRes.project || projRes

    // Invite User B as Member
    const invB = await teamService.invite({
      email: userBEmail,
      role: "Member",
    })
    const regB = await authService.register({
      name: "Bob Collaborator",
      email: userBEmail,
      password,
    })
    userB = regB.user
    const loginB = await authService.login({ email: userBEmail, password })
    const tokenB = loginB.accessToken

    setAuthToken(tokenB)
    await (await import("../src/services/organizationService.js")).organizationService.acceptInvite(invB.invitation.token)
    console.log("  [PASS] FE-UI-02: Organization and team members bootstrapped")

    // ----------------------------------------------------
    // 3. UNASSIGNED TASK RESTRICTION
    // ----------------------------------------------------
    console.log("\n[TEST FE-UI-03] Unassigned task status change disabled in UI and rejected by backend")
    setAuthToken(tokenA)
    setOrganizationId(organization.id)
    useAppStore.getState().setAuth(userA)

    const unassignedTaskDoc = await taskService.create({
      title: "UI Unassigned Task",
      projectId: project.id,
      status: "Backlog",
    })

    const uiPermUnassigned = getTaskStatusPermission(unassignedTaskDoc, userA)
    assert.equal(uiPermUnassigned.canChange, false)
    assert.equal(uiPermUnassigned.reason, "Assign this task before changing its status")

    // Backend rejection
    await assert.rejects(
      async () => {
        await taskService.update(unassignedTaskDoc.id, { status: "Todo" })
      },
      (err) => {
        assert.equal(err.status, 403)
        assert.equal(err.message, "Assign this task before changing its status")
        return true
      },
    )
    console.log("  [PASS] FE-UI-03: Unassigned task status change is disabled with tooltip and rejected with 403")

    // ----------------------------------------------------
    // 4. NON-ASSIGNEE STATUS RESTRICTION & EXPLANATION
    // ----------------------------------------------------
    console.log("\n[TEST FE-UI-04] Non-assignee status change disabled in UI and rejected by backend")
    // Task assigned to User A
    const assignedTask = await taskService.create({
      title: "Assigned To Alice",
      projectId: project.id,
      status: "Backlog",
      assigneeId: userA.id,
    })

    // Check from perspective of User B
    const uiPermUserB = getTaskStatusPermission(assignedTask, userB)
    assert.equal(uiPermUserB.canChange, false)
    assert.equal(uiPermUserB.reason, "Only the assigned team member can change this task's status.")

    // User B attempts to change status via client service -> HTTP 403
    setAuthToken(tokenB)
    setOrganizationId(organization.id)
    useAppStore.getState().setAuth(userB)

    await assert.rejects(
      async () => {
        await taskService.update(assignedTask.id, { status: "In Progress" })
      },
      (err) => {
        assert.equal(err.status, 403)
        assert.equal(err.message, "Only the assigned team member can change this task's status.")
        return true
      },
    )
    console.log("  [PASS] FE-UI-04: Non-assignee receives disabled UI explanation and 403 Forbidden")

    // ----------------------------------------------------
    // 5. OPTIMISTIC UPDATE ROLLBACK ON 403
    // ----------------------------------------------------
    console.log("\n[TEST FE-UI-05] Optimistic update rollback after 403 Forbidden response")
    // Simulate frontend query cache and optimistic update
    let cachedTask = { ...assignedTask, status: "Backlog" }
    const previousSnapshot = { ...cachedTask }

    // User triggers optimistic update to "Done"
    cachedTask = { ...cachedTask, status: "Done" }
    assert.equal(cachedTask.status, "Done")

    // Mutation triggers API call and receives 403
    try {
      await taskService.update(assignedTask.id, { status: "Done" })
      assert.fail("Should have thrown 403")
    } catch (err) {
      assert.equal(err.status, 403)
      // Rollback to previous snapshot
      cachedTask = { ...previousSnapshot }
    }

    assert.equal(cachedTask.status, "Backlog")
    console.log("  [PASS] FE-UI-05: Optimistic state rolled back cleanly to 'Backlog' after 403")

    // ----------------------------------------------------
    // 6. ASSIGNED USER STATUS TRANSITION SUCCEEDS
    // ----------------------------------------------------
    console.log("\n[TEST FE-UI-06] Assigned user status change enabled and succeeds")
    setAuthToken(tokenA)
    setOrganizationId(organization.id)
    useAppStore.getState().setAuth(userA)

    const uiPermUserA = getTaskStatusPermission(assignedTask, userA)
    assert.equal(uiPermUserA.canChange, true)

    const updatedTask = await taskService.update(assignedTask.id, { status: "In Progress" })
    assert.equal(updatedTask.status, "In Progress")
    console.log("  [PASS] FE-UI-06: Assigned member successfully moved task to 'In Progress'")

    // ----------------------------------------------------
    // 7. REASSIGNMENT TRANSFERS STATUS PERMISSION
    // ----------------------------------------------------
    console.log("\n[TEST FE-UI-07] Reassignment transfers permission from former to new assignee")
    // Alice reassigns task to Bob
    const reassignedTask = await taskService.update(assignedTask.id, { assigneeId: userB.id })
    assert.equal(reassignedTask.assigneeId, userB.id)

    // Check Alice: now disabled
    const permAliceAfter = getTaskStatusPermission(reassignedTask, userA)
    assert.equal(permAliceAfter.canChange, false)
    assert.equal(permAliceAfter.reason, "Only the assigned team member can change this task's status.")

    // Check Bob: now enabled
    const permBobAfter = getTaskStatusPermission(reassignedTask, userB)
    assert.equal(permBobAfter.canChange, true)

    // Bob can now update status
    setAuthToken(tokenB)
    setOrganizationId(organization.id)
    useAppStore.getState().setAuth(userB)

    const bobUpdated = await taskService.update(assignedTask.id, { status: "Done" })
    assert.equal(bobUpdated.status, "Done")
    console.log("  [PASS] FE-UI-07: Reassignment immediately shifted UI and backend status rights to Bob")

    console.log("\n==================================================")
    console.log("ALL 7 FRONTEND ASSIGNEE STATUS UI TESTS PASSED!")
    console.log("==================================================")
  } finally {
    try {
      const { connectDb } = await import("../../backend/src/db/connect.js")
      const { User } = await import("../../backend/src/models/User.js")
      const { Organization, OrganizationMember } = await import("../../backend/src/models/Organization.js")
      const { Project } = await import("../../backend/src/models/Project.js")
      const { Task } = await import("../../backend/src/models/Task.js")
      const mongoose = (await import("mongoose")).default
      await connectDb()
      if (organization?.id) {
        await Task.deleteMany({ organizationId: organization.id })
        await Project.deleteMany({ organizationId: organization.id })
        await OrganizationMember.deleteMany({ organizationId: organization.id })
        await Organization.deleteOne({ _id: organization.id })
      }
      if (userAEmail) await User.deleteOne({ email: userAEmail })
      if (userBEmail) await User.deleteOne({ email: userBEmail })
      await mongoose.disconnect()
    } catch {}

    if (serverProcess) {
      serverProcess.kill("SIGTERM")
    }
  }
}

runAssigneeStatusUITests().catch((err) => {
  console.error("\n❌ Frontend Assignee Status UI test failed:", err)
  if (serverProcess) serverProcess.kill("SIGKILL")
  process.exit(1)
})
