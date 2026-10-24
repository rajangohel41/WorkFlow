import assert from "node:assert"
import { createServer } from "node:http"
import mongoose from "mongoose"
import { app } from "../src/app.js"
import { connectDb } from "../src/db/connect.js"

let server = null
let startedOurServer = false
const TEST_PORT = process.env.WORKFLOW_TEST_PORT ? Number(process.env.WORKFLOW_TEST_PORT) : 5105
let BASE_URL = `http://localhost:${TEST_PORT}`

async function ensureServer() {
  try {
    const probe = await fetch("http://localhost:5000/api/v1/health")
    if (probe.ok) {
      BASE_URL = "http://localhost:5000"
      return
    }
  } catch {}

  await connectDb()
  server = createServer(app)
  await new Promise((resolve) => server.listen(TEST_PORT, resolve))
  startedOurServer = true
  BASE_URL = `http://localhost:${TEST_PORT}`
}

async function api(endpoint, options = {}) {
  const headers = { ...options.headers }
  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
    options.body = JSON.stringify(options.body)
  }
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
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


async function runE2E() {
  await ensureServer()
  console.log("=== STARTING FULL END-TO-END BUSINESS FLOW TEST ===")

  const unique = Date.now()
  const userEmail = `e2e-user-${unique}@workflow.io`
  const password = "StrongPassword123!"

  // 1. Register
  console.log("Step 1: Registering new user...");
  const regRes = await api("/api/v1/auth/register", {
    method: "POST",
    body: { name: "E2E Test User", email: userEmail, password },
  })
  assert.strictEqual(regRes.status, 201)
  assert.strictEqual(regRes.data.user.email, userEmail)
  let token = getCookie(regRes.headers, "accessToken")

  // 2. Login
  console.log("Step 2: Logging in...");
  const loginRes = await api("/api/v1/auth/login", {
    method: "POST",
    body: { email: userEmail, password },
  })
  assert.strictEqual(loginRes.status, 200)
  token = getCookie(loginRes.headers, "accessToken")

  // 3. Create Organization
  console.log("Step 3: Creating organization...");
  const orgRes = await api("/api/v1/auth/onboarding", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { workspaceName: "E2E Enterprise Corp", workspaceSlug: `e2e-enterprise-${unique}` },
  })
  assert.strictEqual(orgRes.status, 201)
  const orgId = orgRes.data.organization.id
  assert.ok(orgId)

  // 4. Create Project
  console.log("Step 4: Creating project...");
  const projRes = await api("/api/v1/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "x-organization-id": orgId },
    body: {
      name: "Core Platform V2",
      description: "Next-gen platform redesign and implementation",
      status: "In Progress",
      dueDate: "2026-12-31",
    },
  })
  assert.strictEqual(projRes.status, 201)
  const projectId = projRes.data.id || projRes.data._id
  assert.ok(projectId)

  // 5. Create Task
  console.log("Step 5: Creating task...");
  const taskRes = await api("/api/v1/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "x-organization-id": orgId },
    body: {
      title: "Implement SSO Auth Provider",
      description: "Support SAML 2.0 and OIDC",
      projectId,
      status: "Backlog",
      priority: "Urgent",
      assigneeEmail: userEmail,
      dueDate: "2026-11-15",
    },
  })
  assert.strictEqual(taskRes.status, 201)
  const taskId = taskRes.data.id
  assert.strictEqual(taskRes.data.title, "Implement SSO Auth Provider")
  assert.strictEqual(taskRes.data.status, "Backlog")
  assert.strictEqual(taskRes.data.assignee.email, userEmail)

  // 6. Kanban Workflow Transitions: Backlog -> Todo -> In Progress -> In Review -> Done
  console.log("Step 6: Executing Kanban column transitions...");
  const stages = ["Todo", "In Progress", "In Review", "Done"]
  for (const nextStatus of stages) {
    const patchRes = await api(`/api/v1/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "x-organization-id": orgId },
      body: { status: nextStatus },
    })
    assert.strictEqual(patchRes.status, 200)
    assert.strictEqual(patchRes.data.status, nextStatus)
  }

  // 7. Add & Toggle Checklist Items
  console.log("Step 7: Adding checklist items...");
  const checklist = [
    { title: "Define SAML spec", done: true },
    { title: "Configure Okta & Azure AD", done: true },
    { title: "Write E2E security tests", done: false },
  ]
  const checkRes = await api(`/api/v1/tasks/${taskId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "x-organization-id": orgId },
    body: { checklist },
  })
  assert.strictEqual(checkRes.status, 200)
  assert.strictEqual(checkRes.data.checklist.length, 3)

  // 8. Add Comments
  console.log("Step 8: Adding task comment...");
  const commentRes = await api(`/api/v1/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "x-organization-id": orgId },
    body: { text: "SAML and OIDC endpoints are fully operational!" },
  })
  assert.strictEqual(commentRes.status, 201)
  assert.strictEqual(commentRes.data.commentsList.length, 1)

  // 9. Upload Attachment
  console.log("Step 9: Uploading attachment...");
  const formData = new FormData()
  const blob = new Blob(["# Architecture Spec\nSAML 2.0 SP-initiated"], { type: "text/plain" })
  formData.append("file", blob, "architecture-spec.txt")

  const uploadRes = await fetch(`${BASE_URL}/api/v1/tasks/${taskId}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "x-organization-id": orgId },
    body: formData,
  })
  assert.strictEqual(uploadRes.status, 201)
  const uploadedTask = await uploadRes.json()
  assert.strictEqual(uploadedTask.attachments.length, 1)

  // 10. Check Analytics
  console.log("Step 10: Checking dashboard & overview analytics...");
  const dashRes = await api("/api/v1/analytics/dashboard", {
    headers: { Authorization: `Bearer ${token}`, "x-organization-id": orgId },
  })
  assert.strictEqual(dashRes.status, 200)
  assert.strictEqual(dashRes.data.stats.activeProjects, 1)
  assert.strictEqual(dashRes.data.stats.completedTasks, 1)

  const overviewRes = await api("/api/v1/analytics/overview", {
    headers: { Authorization: `Bearer ${token}`, "x-organization-id": orgId },
  })
  assert.strictEqual(overviewRes.status, 200)
  assert.strictEqual(overviewRes.data.byStatus.Done, 1)

  // 11. Logout
  console.log("Step 11: Logging out...");
  const logoutRes = await api("/api/v1/auth/logout", { method: "POST" })
  assert.strictEqual(logoutRes.status, 200)

  // 12. Login again & Verify Persistence
  console.log("Step 12: Logging in again and verifying data persistence...");
  const loginAgain = await api("/api/v1/auth/login", {
    method: "POST",
    body: { email: userEmail, password },
  })
  assert.strictEqual(loginAgain.status, 200)
  const newToken = getCookie(loginAgain.headers, "accessToken")

  const persistedTask = await api(`/api/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${newToken}`, "x-organization-id": orgId },
  })
  assert.strictEqual(persistedTask.status, 200)
  assert.strictEqual(persistedTask.data.title, "Implement SSO Auth Provider")
  assert.strictEqual(persistedTask.data.status, "Done")
  assert.strictEqual(persistedTask.data.checklist.length, 3)
  assert.strictEqual(persistedTask.data.commentsList.length, 1)
  assert.strictEqual(persistedTask.data.attachments.length, 1)

  console.log("=== FULL END-TO-END BUSINESS FLOW VERIFIED SUCCESSFULLY ===")
}

try {
  await runE2E()
} catch (err) {
  console.error("E2E test failed:", err)
  process.exitCode = 1
} finally {
  if (server && startedOurServer) {
    await new Promise((resolve) => server.close(resolve))
    await mongoose.disconnect()
  }
  process.exit(process.exitCode || 0)
}
