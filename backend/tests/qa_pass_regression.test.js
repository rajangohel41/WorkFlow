import assert from "node:assert/strict"
import { createServer } from "node:http"
import mongoose from "mongoose"
import { app } from "../src/app.js"
import { connectDb } from "../src/db/connect.js"
import { User } from "../src/models/User.js"
import { Organization, OrganizationMember } from "../src/models/Organization.js"
import { Project } from "../src/models/Project.js"
import { Task } from "../src/models/Task.js"

const TEST_PORT = Number(process.env.WORKFLOW_TEST_PORT || 5108)
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

async function run() {
  await connectDb()
  server = createServer(app)
  await new Promise((resolve) => server.listen(TEST_PORT, resolve))

  console.log("\n==================================================")
  console.log("=== QA PASS REGRESSION TEST SUITE (6 CRITICAL BUGS) ===")
  console.log("==================================================\n")

  const unique = Date.now()
  const emailA = `qa_owner_${unique}@workflow.test`
  const emailB = `qa_member_${unique}@workflow.test`
  const password = "ValidPassword123!"

  console.log("[SETUP] Registering test accounts...")
  const regResA = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "QA Owner", email: emailA, password }),
  })
  assert.equal(regResA.status, 201)
  const tokenA = regResA.data.accessToken
  const orgA = regResA.data.organization

  const regResB = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "QA Dev", email: emailB, password }),
  })
  assert.equal(regResB.status, 201)
  const userB = regResB.data.user

  // Add User B as active member of Org A
  await OrganizationMember.create({
    organizationId: orgA.id,
    userId: userB.id,
    role: "Member",
    status: "Active",
  })

  // ---------------------------------------------------------------------
  // TEST 1: Project Due Date Does Not Save (Bug 1)
  // Reproduction:
  // - Create a project named "QA Test Project".
  // - Set its due date to 15 December 2026.
  // - Save the project.
  // - The due date appears as "Not set" everywhere.
  // ---------------------------------------------------------------------
  console.log("\n[TEST 1] Project Due Date persistence (Create -> List -> Detail)")

  const dueTarget = "2026-12-15"
  const createProjRes = await request("/projects", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "X-Organization-Id": orgA.id,
    },
    body: JSON.stringify({
      name: "QA Test Project",
      description: "Testing due date persistence",
      status: "Planning",
      due: dueTarget, // Passed by frontend modal
    }),
  })

  assert.equal(createProjRes.status, 201, "Project creation should succeed with 201")
  const createdProject = createProjRes.data
  assert.equal(createdProject.name, "QA Test Project")
  assert.notEqual(createdProject.due, "Not set", "Due date must not be 'Not set'")
  assert.equal(createdProject.due, "Dec 15", "Due date formatted string must be 'Dec 15'")
  assert.ok(createdProject.dueDate, "Raw dueDate field must be returned")
  assert.equal(
    new Date(createdProject.dueDate).toISOString().slice(0, 10),
    "2026-12-15",
    "Stored dueDate must match calendar date 2026-12-15",
  )
  console.log("  [PASS] 1a: Project created and due date saved correctly (Dec 15)")

  // 1b: Verify in project list
  const listProjRes = await request("/projects", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "X-Organization-Id": orgA.id,
    },
  })
  assert.equal(listProjRes.status, 200)
  const foundInList = listProjRes.data.projects.find((p) => p.name === "QA Test Project")
  assert.ok(foundInList, "Project must exist in list")
  assert.equal(foundInList.due, "Dec 15", "List view must show 'Dec 15'")
  console.log("  [PASS] 1b: Project list returns correct due date 'Dec 15'")

  // 1c: Verify in project detail
  const detailProjRes = await request(`/projects/${createdProject.id}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "X-Organization-Id": orgA.id,
    },
  })
  assert.equal(detailProjRes.status, 200)
  assert.equal(detailProjRes.data.due, "Dec 15", "Detail view must show 'Dec 15'")
  console.log("  [PASS] 1c: Project detail returns correct due date 'Dec 15'")

  // 1d: Update due date via PATCH
  const patchProjRes = await request(`/projects/${createdProject.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "X-Organization-Id": orgA.id,
    },
    body: JSON.stringify({
      due: "2026-12-25",
    }),
  })
  assert.equal(patchProjRes.status, 200)
  assert.equal(patchProjRes.data.due, "Dec 25", "Updated due date must format as 'Dec 25'")
  console.log("  [PASS] 1d: Project due date update via PATCH succeeds")

  // ---------------------------------------------------------------------
  // TEST 2: Rapid Task Quick Edits (Bug 2 Backend Intended Fields Only)
  // ---------------------------------------------------------------------
  console.log("\n[TEST 2] Backend updates modify only intended fields (Concurrent rapid edits)")

  const taskCreateRes = await request("/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "X-Organization-Id": orgA.id,
    },
    body: JSON.stringify({
      title: "Concurrent Edit Task",
      projectId: createdProject.id,
      priority: "Low",
      status: "Todo",
    }),
  })
  assert.equal(taskCreateRes.status, 201)
  const targetTask = taskCreateRes.data

  // Simulate rapid edits: Request 1 changes assignee, Request 2 changes priority
  const [resAssignee, resPriority] = await Promise.all([
    request(`/tasks/${targetTask.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "X-Organization-Id": orgA.id,
      },
      body: JSON.stringify({
        assigneeEmail: emailB,
      }),
    }),
    request(`/tasks/${targetTask.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "X-Organization-Id": orgA.id,
      },
      body: JSON.stringify({
        priority: "High",
      }),
    }),
  ])

  // Inspect database document directly
  const finalTask = await Task.findOne({ _id: targetTask._id })
  assert.equal(finalTask.priority, "High", "Priority must be 'High' — not overwritten by assignee edit")
  assert.equal(
    finalTask.assigneeId.toString(),
    userB.id,
    "Assignee must be User B — not overwritten by priority edit",
  )
  console.log("  [PASS] 2: Concurrent field edits preserved both changes without overwriting each other")

  // ---------------------------------------------------------------------
  // TEST 3: Auth Session Survival on Refresh / New Tab via HttpOnly Cookie
  // ---------------------------------------------------------------------
  console.log("\n[TEST 3] Session survival on refresh and new tab via cookie")

  const cookies = regResA.headers.getSetCookie?.() || [regResA.headers.get("set-cookie") || ""]
  const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ")

  // GET /auth/me with NO Authorization header, only cookie
  const refreshSimRes = await request("/auth/me", {
    method: "GET",
    headers: {
      Cookie: cookieHeader,
    },
  })
  assert.equal(refreshSimRes.status, 200, "/auth/me must succeed with cookies alone")
  assert.equal(refreshSimRes.data.user.email, emailA.toLowerCase())
  console.log("  [PASS] 3: Session successfully restored via cookie session")

  // ---------------------------------------------------------------------
  // TEST 4: Logout invalidation & protected route protection
  // ---------------------------------------------------------------------
  console.log("\n[TEST 4] Logout session invalidation")

  const logoutRes = await request("/auth/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      Cookie: cookieHeader,
    },
  })
  assert.equal(logoutRes.status, 200)

  // Subsequent request with old token must be 401
  const postLogoutRes = await request("/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${tokenA}`,
    },
  })
  assert.equal(postLogoutRes.status, 401, "Protected route after logout must return 401")
  console.log("  [PASS] 4: Session properly invalidated; protected routes reject former session")

  console.log("\n==================================================")
  console.log("ALL QA PASS REGRESSION TESTS PASSED SUCCESSFULLY!")
  console.log("==================================================\n")

  server.close()
  process.exit(0)
}

run().catch((err) => {
  console.error("QA Pass regression test failed:", err)
  if (server) server.close()
  process.exit(1)
})
