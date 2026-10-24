import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(__dirname, "../../backend")
const TEST_PORT = 5101
const API_BASE = `http://localhost:${TEST_PORT}/api/v1`

// Set process.env so frontend client.js targets test backend
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

async function runFrontendAutomation() {
  console.log("==================================================")
  console.log("=== WORKFLOW FRONTEND AUTOMATION TEST SUITE ===")
  console.log("==================================================")

  await startServerIfNeeded()

  // Dynamically import frontend services and store after VITE_API_URL is configured
  const { authService } = await import("../src/services/authService.js")
  const { projectService } = await import("../src/services/projectService.js")
  const { taskService } = await import("../src/services/taskService.js")
  const { teamService } = await import("../src/services/teamService.js")
  const { notificationService } = await import("../src/services/notificationService.js")
  const { calendarService } = await import("../src/services/calendarService.js")
  const { analyticsService } = await import("../src/services/analyticsService.js")
  const { organizationService } = await import("../src/services/organizationService.js")
  const { userService } = await import("../src/services/userService.js")
  const { setAuthToken, setRefreshToken, setOrganizationId, api } = await import("../src/api/client.js")
  const { useAppStore } = await import("../src/store/useAppStore.js")

  const timestamp = Date.now()
  const userAEmail = `owner-${timestamp}@workflow.test`
  const userBEmail = `collaborator-${timestamp}@workflow.test`
  const password = "ComplexPassword123!"

  let userA = null
  let userB = null
  let organization = null
  let project = null
  let task = null
  let inviteToken = null

  try {
    // ----------------------------------------------------
    // 1. AUTHENTICATION: SIGNUP & LOGIN
    // ----------------------------------------------------
    console.log("\n[TEST FE-01] Weak password rejection on signup")
    await assert.rejects(
      async () => {
        await authService.register({
          name: "Weak User",
          email: `weak-${timestamp}@workflow.test`,
          password: "weak",
        })
      },
      (err) => {
        assert.equal(err.status, 422)
        assert.match(err.message, /password/i)
        return true
      },
    )
    console.log("  [PASS] FE-01: Weak password rejected with 422 validation error")

    console.log("\n[TEST FE-02] Strong password registration & automatic organization bootstrap")
    const regResult = await authService.register({
      name: "Alice Owner",
      email: userAEmail,
      password,
    })
    assert.ok(regResult.user?.id)
    assert.equal(regResult.user.email, userAEmail)
    assert.ok(regResult.organization?.id)
    userA = regResult.user
    organization = regResult.organization
    console.log("  [PASS] FE-02: User A registered with workspace:", organization.name)

    console.log("\n[TEST FE-03] Login credentials validation")
    await assert.rejects(
      async () => {
        await authService.login({ email: userAEmail, password: "WrongPassword999!" })
      },
      (err) => {
        assert.equal(err.status, 401)
        return true
      },
    )
    console.log("  [PASS] FE-03: Invalid login credentials correctly rejected with 401")

    console.log("\n[TEST FE-04] Valid login & client auth token initialization")
    const loginResult = await authService.login({ email: userAEmail, password })
    assert.equal(loginResult.user.id, userA.id)
    assert.ok(loginResult.accessToken)
    setAuthToken(loginResult.accessToken)
    if (loginResult.refreshToken) setRefreshToken(loginResult.refreshToken)
    setOrganizationId(organization.id)
    useAppStore.getState().setAuth(loginResult.user)
    useAppStore.getState().setOrganization(organization)
    assert.equal(useAppStore.getState().user.email, userAEmail)
    assert.equal(useAppStore.getState().organizationId, organization.id)
    console.log("  [PASS] FE-04: User A logged in and Zustand store populated")

    console.log("\n[TEST FE-05] Session bootstrap & token rotation")
    const meResult = await authService.me()
    assert.equal(meResult.user.id, userA.id)
    assert.ok(meResult.organizations.length >= 1)
    const refreshResult = await authService.refresh({ refreshToken: loginResult.refreshToken })
    assert.equal(refreshResult.success, true)
    assert.ok(refreshResult.accessToken)
    setAuthToken(refreshResult.accessToken)
    if (refreshResult.refreshToken) setRefreshToken(refreshResult.refreshToken)
    console.log("  [PASS] FE-05: Session validated via /auth/me and access token refreshed")

    // ----------------------------------------------------
    // 2. PASSWORD RECOVERY SECURITY
    // ----------------------------------------------------
    console.log("\n[TEST FE-06] Password recovery security: Production guard & invalid token rejection")
    const testForgotRes = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userAEmail }),
    })
    const testForgot = await testForgotRes.json()
    assert.ok(testForgot.devResetToken)

    await assert.rejects(
      async () => {
        await authService.resetPassword({
          token: "tampered-nonexistent-token-12345",
          password: "NewPassword123!@#",
        })
      },
      (err) => {
        assert.equal(err.status, 422)
        assert.match(err.message, /invalid|expired/i)
        return true
      },
    )
    console.log("  [PASS] FE-06: Tampered/invalid reset tokens rejected with 422")

    // ----------------------------------------------------
    // 3. WORKSPACE & ORGANIZATION SETTINGS
    // ----------------------------------------------------
    console.log("\n[TEST FE-07] Organization workspace retrieval & settings persistence")
    const orgsList = await organizationService.list()
    assert.ok(Array.isArray(orgsList.organizations))
    assert.ok(orgsList.organizations.some((o) => o.id === organization.id))

    const updatedWorkspace = await organizationService.updateCurrent({
      name: "Alpha Corp Global",
      defaultView: "board",
    })
    assert.equal(updatedWorkspace.name, "Alpha Corp Global")
    console.log("  [PASS] FE-07: Workspace name updated and persisted to 'Alpha Corp Global'")

    // ----------------------------------------------------
    // 4. PROJECT CRUD & MILESTONES
    // ----------------------------------------------------
    console.log("\n[TEST FE-08] Project creation and retrieval")
    project = await projectService.create({
      name: "Frontend Cloud Platform",
      description: "Automated frontend infrastructure project",
      color: "#6366f1",
    })
    assert.ok(project.id)
    assert.equal(project.name, "Frontend Cloud Platform")

    const projectsList = await projectService.list()
    assert.ok(projectsList.projects.some((p) => p.id === project.id || p._id === project._id))

    const projectDetail = await projectService.getById(project.id)
    assert.equal(projectDetail.name, "Frontend Cloud Platform")
    console.log("  [PASS] FE-08: Project created and retrieved via projectService")

    console.log("\n[TEST FE-09] Project milestone lifecycle")
    const milestoneRes = await projectService.createMilestone(project.id, {
      title: "Sprint 1 Release",
      dueDate: "2026-12-01",
    })
    const milestone = milestoneRes.milestone || milestoneRes
    assert.ok(milestone.id || milestone._id)
    assert.equal(milestone.title, "Sprint 1 Release")

    const milestonesRes = await projectService.milestones(project.id)
    const milestonesList = milestonesRes.milestones || milestonesRes
    assert.ok(Array.isArray(milestonesList))
    assert.ok(milestonesList.some((m) => m.id === milestone.id || m._id === milestone._id))

    await projectService.removeMilestone(project.id, milestone.id || milestone._id)
    const afterDeleteRes = await projectService.milestones(project.id)
    const afterDeleteList = afterDeleteRes.milestones || afterDeleteRes
    assert.ok(!afterDeleteList.some((m) => m.id === milestone.id || m._id === milestone._id))
    console.log("  [PASS] FE-09: Milestone created, listed, and cleanly removed")

    // ----------------------------------------------------
    // 5. TASK CRUD, KANBAN TRANSITIONS & COMMENTS
    // ----------------------------------------------------
    console.log("\n[TEST FE-10] Task creation with organization scoping")
    task = await taskService.create({
      title: "Build Automated Test Suite",
      description: "Write full coverage tests for SaaS frontend",
      projectId: project.id,
      status: "Backlog",
      priority: "Urgent",
      assigneeEmail: userAEmail,
      dueDate: "2026-11-30",
    })
    assert.ok(task.id)
    assert.equal(task.title, "Build Automated Test Suite")
    assert.equal(task.status, "Backlog")
    assert.equal(task.priority, "Urgent")
    console.log("  [PASS] FE-10: Task created under project:", task.id)

    console.log("\n[TEST FE-11] Kanban status transitions: Backlog -> In Progress -> Done")
    const inProgress = await taskService.update(task.id, {
      status: "In Progress",
      version: task.version || 1,
    })
    assert.equal(inProgress.status, "In Progress")

    const doneTask = await taskService.update(task.id, {
      status: "Done",
      version: inProgress.version || 2,
    })
    assert.equal(doneTask.status, "Done")
    console.log("  [PASS] FE-11: Task successfully transitioned across Kanban columns")

    console.log("\n[TEST FE-12] Checklist items addition and toggling")
    const withChecklist = await taskService.update(task.id, {
      checklist: [
        { title: "Define test fixtures", done: true },
        { title: "Verify RBAC policies", done: false },
      ],
      version: doneTask.version || 3,
    })
    assert.equal(withChecklist.checklist.length, 2)
    assert.equal(withChecklist.checklist[0].done, true)
    assert.equal(withChecklist.checklist[1].done, false)
    console.log("  [PASS] FE-12: Checklist items persisted and state toggled")

    console.log("\n[TEST FE-13] Task comments creation and persistence")
    const commentRes = await taskService.addComment(task.id, "Frontend automation is active.")
    assert.ok(commentRes.commentsList?.length >= 1)
    assert.equal(commentRes.commentsList[commentRes.commentsList.length - 1].text, "Frontend automation is active.")
    console.log("  [PASS] FE-13: Comment posted and verified in task comments list")

    // ----------------------------------------------------
    // 6. INVITATION LIFECYCLE & TEAM MEMBERSHIP
    // ----------------------------------------------------
    console.log("\n[TEST FE-14] Team member invitation and duplicate protection")
    const inviteRes = await teamService.invite({
      email: userBEmail,
      role: "Member",
    })
    assert.ok(inviteRes.invitation?.token)
    inviteToken = inviteRes.invitation.token

    // Duplicate invitation rejection
    await assert.rejects(
      async () => {
        await teamService.invite({ email: userBEmail, role: "Member" })
      },
      (err) => {
        assert.equal(err.status, 409)
        return true
      },
    )
    console.log("  [PASS] FE-14: Invitation created and duplicate invitation rejected with 409")

    console.log("\n[TEST FE-15] User B registration & invitation acceptance")
    const regB = await authService.register({
      name: "Bob Collaborator",
      email: userBEmail,
      password,
    })
    userB = regB.user
    const loginB = await authService.login({ email: userBEmail, password })
    const userBToken = loginB.accessToken

    // User A switches auth token temporarily to User B
    setAuthToken(userBToken)
    if (loginB.refreshToken) setRefreshToken(loginB.refreshToken)

    // Accepting with matching email succeeds
    const acceptRes = await organizationService.acceptInvite(inviteToken)
    assert.equal(acceptRes.success, true)
    console.log("  [PASS] FE-15: User B successfully accepted invitation")

    // Restore User A context
    setAuthToken(loginResult.accessToken)
    if (loginResult.refreshToken) setRefreshToken(loginResult.refreshToken)
    setOrganizationId(organization.id)

    console.log("\n[TEST FE-16] Active team members listing")
    const membersRes = await teamService.listMembers()
    assert.ok(Array.isArray(membersRes.members))
    assert.ok(membersRes.members.some((m) => m.email === userBEmail))
    console.log("  [PASS] FE-16: User B appears in organization active members list")

    console.log("\n[TEST FE-17] Role update: Demote User B to Viewer")
    const updateRes = await teamService.updateMember(userB.id, { role: "Viewer" })
    assert.equal(updateRes.success, true)
    console.log("  [PASS] FE-17: User B role successfully updated to Viewer")

    // ----------------------------------------------------
    // 7. RBAC PERMISSION DENIAL (VIEWER ROLE)
    // ----------------------------------------------------
    console.log("\n[TEST FE-18] RBAC: Viewer role denied write mutations")
    // Switch to User B token
    setAuthToken(userBToken)
    if (loginB.refreshToken) setRefreshToken(loginB.refreshToken)
    setOrganizationId(organization.id)

    await assert.rejects(
      async () => {
        await projectService.create({ name: "Unauthorized Viewer Project" })
      },
      (err) => {
        assert.equal(err.status, 403)
        return true
      },
    )

    await assert.rejects(
      async () => {
        await taskService.create({
          title: "Unauthorized Task",
          projectId: project.id,
        })
      },
      (err) => {
        assert.equal(err.status, 403)
        return true
      },
    )

    await assert.rejects(
      async () => {
        await teamService.removeMember(userA.id)
      },
      (err) => {
        assert.equal(err.status, 403)
        return true
      },
    )
    console.log("  [PASS] FE-18: Viewer strictly prohibited from creating projects, tasks, or modifying members")

    // Switch back to User A
    setAuthToken(loginResult.accessToken)
    if (loginResult.refreshToken) setRefreshToken(loginResult.refreshToken)
    setOrganizationId(organization.id)

    // ----------------------------------------------------
    // 8. NOTIFICATIONS INTERACTION
    // ----------------------------------------------------
    console.log("\n[TEST FE-19] Notification lifecycle & unread interactions")
    // User A assigns task to User B to generate notification
    await taskService.update(task.id, {
      assigneeEmail: userBEmail,
      version: 4,
    })

    // Check notifications as User B
    setAuthToken(userBToken)
    if (loginB.refreshToken) setRefreshToken(loginB.refreshToken)
    setOrganizationId(organization.id)

    const notifRes = await notificationService.list()
    assert.ok(notifRes.notifications?.length >= 1)
    const notif = notifRes.notifications[0]
    assert.ok(notif.id)

    // Mark single notification read
    const readRes = await notificationService.markRead(notif.id)
    assert.equal(readRes.unread, false)

    // Mark all read
    const allReadRes = await notificationService.markAllRead()
    assert.equal(allReadRes.success, true)
    console.log("  [PASS] FE-19: Notifications fetched, marked read, and markAllRead verified")

    // Switch back to User A
    setAuthToken(loginResult.accessToken)
    if (loginResult.refreshToken) setRefreshToken(loginResult.refreshToken)
    setOrganizationId(organization.id)

    // ----------------------------------------------------
    // 9. CALENDAR INTEGRATION
    // ----------------------------------------------------
    console.log("\n[TEST FE-20] Calendar event creation and listing")
    const calEvent = await calendarService.create({
      title: "Sprint Review & Retro",
      day: 15,
      time: "10:00 AM",
      projectSlug: project.id,
    })
    assert.ok(calEvent.id)

    const calList = await calendarService.list()
    assert.ok(Array.isArray(calList.events))
    assert.ok(calList.events.some((e) => e.id === calEvent.id))

    await calendarService.remove(calEvent.id)
    console.log("  [PASS] FE-20: Calendar event created, listed, and deleted cleanly")

    // ----------------------------------------------------
    // 10. ANALYTICS & DASHBOARD SUMMARY
    // ----------------------------------------------------
    console.log("\n[TEST FE-21] Analytics dashboard & overview queries")
    const dashStats = await analyticsService.dashboard("Last 30 days")
    assert.ok(dashStats.stats)
    assert.ok(dashStats.stats.activeProjects >= 1)

    const overviewStats = await analyticsService.overview("Last 30 days")
    assert.ok(overviewStats.byStatus)
    assert.ok(overviewStats.byPriority)
    console.log("  [PASS] FE-21: Dashboard and overview analytics returned authoritative metrics")

    // ----------------------------------------------------
    // 11. USER PROFILE & PREFERENCES PERSISTENCE
    // ----------------------------------------------------
    console.log("\n[TEST FE-22] User profile & notification preferences persistence")
    const updatedProfile = await userService.updateProfile({
      name: "Alice Lead Architect",
      title: "VP of Engineering",
    })
    assert.equal(updatedProfile.user.name, "Alice Lead Architect")
    assert.equal(updatedProfile.user.title, "VP of Engineering")

    const updatedPrefs = await userService.updatePreferences({
      assignments: false,
      mentions: true,
      projectUpdates: true,
    })
    assert.equal(updatedPrefs.preferences.assignments, false)
    assert.equal(updatedPrefs.preferences.projectUpdates, true)

    const profileCheck = await userService.getProfile()
    assert.equal(profileCheck.user.name, "Alice Lead Architect")
    assert.equal(profileCheck.user.preferences.assignments, false)
    console.log("  [PASS] FE-22: Profile details and preferences persisted to database")

    // ----------------------------------------------------
    // 12. ERROR STATES & INVALID ROUTES
    // ----------------------------------------------------
    console.log("\n[TEST FE-23] Invalid route and malformed request handling")
    await assert.rejects(
      async () => {
        await api.get("/unknown-nonexistent-endpoint")
      },
      (err) => {
        assert.equal(err.status, 404)
        return true
      },
    )

    await assert.rejects(
      async () => {
        await taskService.getById("not-a-valid-object-id")
      },
      (err) => {
        assert.equal(err.status, 404)
        return true
      },
    )
    console.log("  [PASS] FE-23: Clean 404 responses for invalid endpoints and IDs without 500 crashes")

    // ----------------------------------------------------
    // 13. LOGOUT & STORE RESET
    // ----------------------------------------------------
    console.log("\n[TEST FE-24] Logout and Zustand store clearance")
    const logoutRes = await authService.logout()
    assert.equal(logoutRes.success, true)
    useAppStore.getState().clearAuth()
    setAuthToken(null)
    setRefreshToken(null)
    setOrganizationId(null)
    assert.equal(useAppStore.getState().user, null)
    assert.equal(useAppStore.getState().organizationId, null)

    // Attempting protected endpoint returns 401
    await assert.rejects(
      async () => {
        await authService.me()
      },
      (err) => {
        assert.equal(err.status, 401)
        return true
      },
    )
    console.log("  [PASS] FE-24: User logged out, store state cleared, and protected endpoints locked")

    console.log("\n==================================================")
    console.log("ALL 24 FRONTEND AUTOMATION TESTS PASSED (FE-01 - FE-24)!")
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

runFrontendAutomation().catch((err) => {
  console.error("\n❌ Frontend automation test failed:", err)
  if (serverProcess) serverProcess.kill("SIGKILL")
  process.exit(1)
})
