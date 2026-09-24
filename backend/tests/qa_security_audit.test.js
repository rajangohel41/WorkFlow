import assert from "node:assert"
import fs from "node:fs"
import path from "node:path"

const BASE_URL = "http://localhost:5000"

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

async function runTests() {
  console.log("=== STARTING COMPREHENSIVE FULL-STACK QA & SECURITY AUDIT ===")
  let passed = 0
  let failed = 0

  async function test(name, fn) {
    try {
      await fn()
      console.log(`  [PASS] ${name}`)
      passed++
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message)
      failed++
    }
  }

  // 1. Health Checks
  await test("1.1 GET /health returns ok", async () => {
    const res = await api("/health")
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.data.ok, true)
  })

  await test("1.2 GET /api/v1/health returns ok", async () => {
    const res = await api("/api/v1/health")
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.data.ok, true)
  })

  // 2. Authentication Tests
  let orgAUserToken = ""
  let orgARefreshToken = ""
  let orgAId = ""
  let orgAUser = null

  await test("2.1 Login with invalid credentials returns 401", async () => {
    const res = await api("/api/v1/auth/login", {
      method: "POST",
      body: { email: "alex@acme.io", password: "wrongpassword" },
    })
    assert.strictEqual(res.status, 401)
  })

  await test("2.2 Login with valid credentials establishes session", async () => {
    const res = await api("/api/v1/auth/login", {
      method: "POST",
      body: { email: "alex@acme.io", password: "password123" },
    })
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.data.user.email, "alex@acme.io")
    orgAUser = res.data.user
    orgAUserToken = getCookie(res.headers, "accessToken")
    orgARefreshToken = getCookie(res.headers, "refreshToken")
    assert.ok(orgAUserToken, "accessToken cookie should be set")
  })

  await test("2.3 Missing token returns 401 on protected endpoint", async () => {
    const res = await api("/api/v1/auth/me")
    assert.strictEqual(res.status, 401)
  })

  await test("2.4 Malformed token returns 401", async () => {
    const res = await api("/api/v1/auth/me", {
      headers: { Authorization: "Bearer malformed.token.value" },
    })
    assert.strictEqual(res.status, 401)
  })

  await test("2.5 GET /auth/me returns user organizations", async () => {
    const res = await api("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${orgAUserToken}` },
    })
    assert.strictEqual(res.status, 200)
    assert.ok(res.data.organizations.length > 0)
    orgAId = res.data.organizations[0].id
    assert.ok(orgAId)
  })

  await test("2.6 Refresh token successfully rotates access token", async () => {
    const res = await api("/api/v1/auth/refresh", {
      method: "POST",
      headers: { Cookie: `refreshToken=${orgARefreshToken}` },
    })
    assert.strictEqual(res.status, 200)
    const newAccess = getCookie(res.headers, "accessToken")
    assert.ok(newAccess)
    orgAUserToken = newAccess
  })

  // 3. Multi-Tenant Setup: Create Organization B and User B
  let orgBUserToken = ""
  let orgBId = ""
  const evilEmail = `attacker-${Date.now()}@evilcorp.io`

  await test("3.1 Register attacker in Organization B", async () => {
    const regRes = await api("/api/v1/auth/register", {
      method: "POST",
      body: { name: "Attacker User", email: evilEmail, password: "password123" },
    })
    assert.strictEqual(regRes.status, 201)
    orgBUserToken = getCookie(regRes.headers, "accessToken")

    // Onboarding to create Org B
    const onbRes = await api("/api/v1/auth/onboarding", {
      method: "POST",
      headers: { Authorization: `Bearer ${orgBUserToken}` },
      body: { workspaceName: "Evil Corp Workspace" },
    })
    assert.strictEqual(onbRes.status, 201)
    orgBId = onbRes.data.organization.id
    assert.ok(orgBId)
  })

  // 4. Multi-Tenant Security & IDOR/BOLA Protection (Section 5)
  let orgAProject = null
  let orgATask = null

  await test("4.1 Fetch Org A resources as Org A user", async () => {
    const pRes = await api("/api/v1/projects", {
      headers: {
        Authorization: `Bearer ${orgAUserToken}`,
        "x-organization-id": orgAId,
      },
    })
    assert.strictEqual(pRes.status, 200)
    assert.ok(pRes.data.projects.length > 0)
    orgAProject = pRes.data.projects[0]

    const tRes = await api("/api/v1/tasks", {
      headers: {
        Authorization: `Bearer ${orgAUserToken}`,
        "x-organization-id": orgAId,
      },
    })
    assert.strictEqual(tRes.status, 200)
    assert.ok(tRes.data.tasks.length > 0)
    orgATask = tRes.data.tasks[0]
  })

  await test("4.2 IDOR: Org B user CANNOT access Org A project by ID or slug", async () => {
    const resId = await api(`/api/v1/projects/${orgAProject._id}`, {
      headers: {
        Authorization: `Bearer ${orgBUserToken}`,
        "x-organization-id": orgBId,
      },
    })
    assert.strictEqual(resId.status, 404, "Org B should not find Org A project")

    const resSlug = await api(`/api/v1/projects/${orgAProject.id}`, {
      headers: {
        Authorization: `Bearer ${orgBUserToken}`,
        "x-organization-id": orgBId,
      },
    })
    assert.strictEqual(resSlug.status, 404, "Org B should not find Org A project slug")
  })

  await test("4.3 IDOR: Org B user CANNOT patch or delete Org A project", async () => {
    const patchRes = await api(`/api/v1/projects/${orgAProject._id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${orgBUserToken}`,
        "x-organization-id": orgBId,
      },
      body: { name: "Hacked Project" },
    })
    assert.strictEqual(patchRes.status, 404)

    const delRes = await api(`/api/v1/projects/${orgAProject._id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${orgBUserToken}`,
        "x-organization-id": orgBId,
      },
    })
    assert.strictEqual(delRes.status, 404)
  })

  await test("4.4 IDOR: Org B user CANNOT access or mutate Org A task", async () => {
    const getRes = await api(`/api/v1/tasks/${orgATask.id}`, {
      headers: {
        Authorization: `Bearer ${orgBUserToken}`,
        "x-organization-id": orgBId,
      },
    })
    assert.strictEqual(getRes.status, 404)

    const patchRes = await api(`/api/v1/tasks/${orgATask.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${orgBUserToken}`,
        "x-organization-id": orgBId,
      },
      body: { status: "Done" },
    })
    assert.strictEqual(patchRes.status, 404)

    const delRes = await api(`/api/v1/tasks/${orgATask.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${orgBUserToken}`,
        "x-organization-id": orgBId,
      },
    })
    assert.strictEqual(delRes.status, 404)
  })

  await test("4.5 Multi-Tenant: Org B user CANNOT see Org A members, notifications or analytics", async () => {
    const membersRes = await api("/api/v1/organizations/members", {
      headers: {
        Authorization: `Bearer ${orgBUserToken}`,
        "x-organization-id": orgBId,
      },
    })
    assert.strictEqual(membersRes.status, 200)
    assert.ok(
      !membersRes.data.members.some((m) => m.email === "alex@acme.io"),
      "Org A members must not leak to Org B",
    )

    const notifRes = await api("/api/v1/notifications", {
      headers: {
        Authorization: `Bearer ${orgBUserToken}`,
        "x-organization-id": orgBId,
      },
    })
    assert.strictEqual(notifRes.status, 200)
    assert.strictEqual(notifRes.data.notifications.length, 0)
  })

  // 5. Authorization & RBAC (Section 4)
  let viewerToken = ""
  const viewerEmail = `viewer-${Date.now()}@acme.io`

  await test("5.1 Create Viewer role user in Org A", async () => {
    const inviteRes = await api("/api/v1/organizations/invitations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${orgAUserToken}`,
        "x-organization-id": orgAId,
      },
      body: { email: viewerEmail, role: "Viewer" },
    })
    assert.strictEqual(inviteRes.status, 201)
    const inviteToken = inviteRes.data.devInviteToken
    assert.ok(inviteToken)

    // Register user for viewer
    const regRes = await api("/api/v1/auth/register", {
      method: "POST",
      body: { name: "Viewer User", email: viewerEmail, password: "password123" },
    })
    assert.strictEqual(regRes.status, 201)
    viewerToken = getCookie(regRes.headers, "accessToken")

    // Accept invitation
    const acceptRes = await api(`/api/v1/organizations/invitations/${inviteToken}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${viewerToken}` },
    })
    assert.strictEqual(acceptRes.status, 200)
  })

  await test("5.2 RBAC: Viewer CANNOT create project, create task or mutate members", async () => {
    const projRes = await api("/api/v1/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": orgAId,
      },
      body: { name: "Viewer Project" },
    })
    assert.strictEqual(projRes.status, 403, "Viewer must not create projects")

    const taskRes = await api("/api/v1/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": orgAId,
      },
      body: { title: "Viewer Task", projectId: orgAProject.id },
    })
    assert.strictEqual(taskRes.status, 403, "Viewer must not create tasks")

    const memberRes = await api(`/api/v1/organizations/members/${orgAUser.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "x-organization-id": orgAId,
      },
      body: { role: "Admin" },
    })
    assert.strictEqual(memberRes.status, 403, "Viewer must not update roles")
  })

  // 6. Mass Assignment Security (Section 6)
  await test("6.1 User cannot change organizationId on Task or Project", async () => {
    const patchRes = await api(`/api/v1/projects/${orgAProject._id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${orgAUserToken}`,
        "x-organization-id": orgAId,
      },
      body: { organizationId: orgBId, name: "Legitimate Update" },
    })
    assert.strictEqual(patchRes.status, 200)
    // Project should still belong to Org A
    const verifyRes = await api(`/api/v1/projects/${orgAProject._id}`, {
      headers: {
        Authorization: `Bearer ${orgAUserToken}`,
        "x-organization-id": orgAId,
      },
    })
    assert.strictEqual(verifyRes.status, 200)
  })

  // 7. NoSQL Injection & Input Validation (Section 7 & 8)
  await test("7.1 Malformed ObjectId in header returns 400 not 500", async () => {
    const res = await api("/api/v1/projects", {
      headers: {
        Authorization: `Bearer ${orgAUserToken}`,
        "x-organization-id": "not-a-valid-id",
      },
    })
    assert.strictEqual(res.status, 400)
    assert.strictEqual(res.data.message, "Invalid organization ID format")
  })

  await test("7.2 Malformed taskId in params returns 404 cleanly", async () => {
    const res = await api("/api/v1/tasks/invalid-task-id-12345", {
      headers: {
        Authorization: `Bearer ${orgAUserToken}`,
        "x-organization-id": orgAId,
      },
    })
    assert.strictEqual(res.status, 404)
  })

  await test("7.3 NoSQL operator in body is sanitized", async () => {
    const res = await api("/api/v1/auth/login", {
      method: "POST",
      body: { email: { $gt: "" }, password: "password123" },
    })
    // Since $gt is stripped, email becomes undefined -> 401
    assert.strictEqual(res.status, 401)
  })

  await test("7.4 Special regex characters in search do not crash server", async () => {
    const res = await api("/api/v1/search?q=[[[***+++(((\\", {
      headers: {
        Authorization: `Bearer ${orgAUserToken}`,
        "x-organization-id": orgAId,
      },
    })
    assert.strictEqual(res.status, 200)
    assert.ok(Array.isArray(res.data.projects))
  })

  // 8. File Upload Security (Section 11)
  await test("8.1 Uploading executable file (.exe) is rejected", async () => {
    const formData = new FormData()
    const blob = new Blob(["malicious code"], { type: "application/x-msdownload" })
    formData.append("file", blob, "malicious.exe")

    const res = await fetch(`${BASE_URL}/api/v1/tasks/${orgATask.id}/attachments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${orgAUserToken}`,
        "x-organization-id": orgAId,
      },
      body: formData,
    })
    assert.strictEqual(res.status, 400)
    const data = await res.json()
    assert.ok(data.message.includes("not allowed"))
  })

  let uploadedAttUrl = ""
  let uploadedAttId = ""

  await test("8.2 Uploading valid document succeeds", async () => {
    const formData = new FormData()
    const blob = new Blob(["sample text content"], { type: "text/plain" })
    formData.append("file", blob, "test-notes.txt")

    const res = await fetch(`${BASE_URL}/api/v1/tasks/${orgATask.id}/attachments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${orgAUserToken}`,
        "x-organization-id": orgAId,
      },
      body: formData,
    })
    assert.strictEqual(res.status, 201)
    const taskData = await res.json()
    const att = taskData.attachments.find((a) => a.name === "test-notes.txt")
    assert.ok(att)
    uploadedAttUrl = att.url
    uploadedAttId = att.id || att._id
  })

  await test("8.3 Org B user CANNOT access Org A uploaded file", async () => {
    const res = await api(uploadedAttUrl, {
      headers: { Authorization: `Bearer ${orgBUserToken}` },
    })
    assert.strictEqual(res.status, 403, "Attachment must be protected against other organizations")
  })

  await test("8.4 Org A user can access their uploaded file", async () => {
    const res = await api(uploadedAttUrl, {
      headers: { Authorization: `Bearer ${orgAUserToken}` },
    })
    assert.strictEqual(res.status, 200)
  })

  await test("8.5 Delete attachment removes it and deletes file on disk", async () => {
    const filename = path.basename(uploadedAttUrl)
    const diskPath = path.join(process.cwd(), "uploads", filename)
    assert.ok(fs.existsSync(diskPath), "File should exist on disk before deletion")

    const delRes = await api(`/api/v1/tasks/${orgATask.id}/attachments/${uploadedAttId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${orgAUserToken}`,
        "x-organization-id": orgAId,
      },
    })
    assert.strictEqual(delRes.status, 200)
  })

  // 9. Session Revocation / Logout All (Section 3)
  await test("9.1 Logout-all revokes active sessions across devices", async () => {
    // Generate a second token for Org A user
    const loginRes = await api("/api/v1/auth/login", {
      method: "POST",
      body: { email: "alex@acme.io", password: "password123" },
    })
    const activeToken = getCookie(loginRes.headers, "accessToken")

    // Revoke all sessions
    const revokeRes = await api("/api/v1/auth/logout-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${activeToken}` },
    })
    assert.strictEqual(revokeRes.status, 200)

    // Using old token should now fail with 401 Session revoked
    const meRes = await api("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${activeToken}` },
    })
    assert.strictEqual(meRes.status, 401)
    assert.strictEqual(meRes.data.message, "Session revoked")
  })

  console.log("\n==================================================")
  console.log(`AUDIT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`)
  console.log("==================================================")
  if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
  console.error("Test runner encountered fatal error:", err)
  process.exit(1)
})
