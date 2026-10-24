# Security Policy & Implementation Report

This document details the security architecture, threat model mitigations, and verified security controls implemented in WorkFlow.

---

## 1. Authentication & Session Management

- **Dual-Token System**:
  - **Access Tokens**: Short-lived (15 minutes by default), signed with `JWT_ACCESS_SECRET`.
  - **Refresh Tokens**: Long-lived (7 days by default), signed with `JWT_REFRESH_SECRET`.
  - Stored in `httpOnly`, `SameSite=Lax` cookies, with optional `Authorization: Bearer <token>` header support for API clients.
- **Session Revocation & Invalidation**:
  - The `User` model maintains an integer `tokenVersion`.
  - Every access and refresh token carries `tokenVersion`.
  - Calling `/api/v1/auth/logout-all` or updating a password via `/api/v1/auth/change-password` or `/api/v1/auth/reset-password` increments `tokenVersion`, instantly invalidating all outstanding tokens across every device.
- **Credential Storage**:
  - Passwords are salted and hashed using Argon2. Password hashes are never selected by default in Mongoose schemas (`select: false`).
- **Environment Token Protection**:
  - Development convenience tokens (`devResetToken`, `devInviteToken`) are gated behind `process.env.NODE_ENV !== "production"`. In production mode, these fields are omitted from all HTTP responses.
- **Password Recovery**:
  - Reset tokens are cryptographically random, expire after one hour, are excluded from normal user queries, and are cleared after use. Because WorkFlow has no email delivery, production password recovery requires an administrator to arrange token delivery out of band; reset tokens are never returned by production API responses.

---

## 2. Multi-Tenancy & Tenant Isolation (IDOR / BOLA Prevention)

- **Strict Tenant Scoping**:
  - All organization-owned resources (`Project`, `Task`, `Comment`, `Attachment`, `Notification`, `Activity`, `Invitation`) store an explicit `organizationId`.
  - Every tenant route passes through `requireTenant` middleware, which verifies that the requesting user possesses an active membership in the requested organization.
  - Queries are explicitly filtered by `organizationId`. Client-supplied IDs in request bodies cannot override the authenticated organization context.
- **Resource Ownership Verification**:
  - Route handlers perform resource lookups with compound conditions (e.g. `{ _id: taskId, organizationId: req.organization._id }`).
  - Accessing or modifying a resource belonging to Organization B using an account from Organization A yields an immediate `404 Not Found` or `403 Forbidden`.

---

## 3. Role-Based Access Control (RBAC)

Supported Roles:

1. **Owner**: Organization creator with full operational and administrative privileges.
2. **Admin**: Can manage projects, tasks, members, and organization settings, with strict restrictions:
   - Admins cannot modify or demote the Owner.
   - Admins cannot transfer ownership.
   - Non-owner users cannot escalate their own role or promote other users beyond their own privilege tier.
3. **Manager**: Can create, edit, and organize projects and assign tasks.
4. **Member**: Standard team member capable of managing assigned tasks, updating checklists, and participating in comments.
5. **Viewer**: Read-only access to projects, tasks, and discussions.

- **Assignee-Only Task Status Transitions**:
  - ONLY the currently assigned user may change a task's status.
  - Organization Owners, Admins, Managers, and task creators cannot bypass this rule unless the task is assigned to them.
  - If a task is unassigned, status transitions are blocked for all users until assignment occurs.
  - Enforced atomically at the database layer to prevent concurrent race-condition overrides.

---

## 4. Input Validation & Injection Mitigation

- **NoSQL Injection Sanitization**:
  - Middleware sanitizes incoming `req.body`, `req.query`, and `req.params`, filtering dangerous MongoDB operators (`$gt`, `$ne`, `$where`, `$regex`, etc.).
  - Search queries that intentionally use regular expressions escape special regex characters prior to execution to prevent ReDoS or query manipulation.
- **BSON / ObjectId Validation**:
  - Route parameters expecting MongoDB ObjectIds are validated before querying. Malformed ObjectIds return `400 Bad Request` or `404 Not Found` rather than causing unhandled CastErrors or 500 crashes.
- **Mass Assignment Protection**:
  - Sensitive internal fields (`organizationId`, `ownerId`, `createdBy`, `role`, `tokenVersion`, `passwordHash`) are stripped or assigned exclusively by server logic, ignoring client-provided payloads.

---

## 5. File Upload & Storage Security

- **Strict Extension & MIME Validation**:
  - Uploads are validated against an allowlist of safe extensions (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.pdf`, `.txt`, `.csv`, `.docx`, `.xlsx`, `.pptx`, `.zip`) and verified MIME types.
  - Executable scripts (`.exe`, `.sh`, `.bat`, etc.) and spoofed extensions are rejected.
- **File Size Restrictions & 4.5 MB Function Limit Bypass**:
  - File uploads are capped at 10 MB per attachment.
  - For serverless hosting on Vercel, direct client uploads to `@vercel/blob` are authorized via short-lived, scoped client tokens generated by `POST /api/v1/tasks/:taskId/attachments/upload-intent`. This allows up to 10 MB uploads without hitting the 4.5 MB Vercel Function payload limit.
  - The completion endpoint `POST /api/v1/tasks/:taskId/attachments/complete` validates that the destination pathname matches the task context and verifies the blob existence and size via `@vercel/blob` `head()` before recording the attachment.
- **Protected Private File Access**:
  - Attachment files are never served through an unauthenticated public static directory or bare public URLs.
  - Downloads route through `GET /uploads/:filename`, requiring valid authentication (`requireAuth`) and active organization membership verification (`OrganizationMember.exists`).
  - Private blobs are fetched using Vercel Blob `get()` with private access and streamed directly through the authorized function with strict security headers: `Content-Disposition`, `X-Content-Type-Options: nosniff`, and `Cache-Control: private, no-cache, no-store, must-revalidate`.
- **Safe Cleanup**:
  - Deleting an attachment purges it from Vercel Blob (`del()`) or deletes the file from local disk.

---

## 6. Real-Time Communication Security (Socket.IO)

- **Handshake Authentication**:
  - Connections authenticate during handshake via JWT cookies or authorization headers.
- **Room Isolation & Redis Adapter**:
  - Sockets can only join organization rooms (`org:<orgId>`) after server-side verification of active membership.
  - Multi-instance deployments use an authenticated Redis Pub/Sub adapter to ensure cross-instance delivery while maintaining strict tenant room boundaries.
  - Member removal or token revocation immediately evicts the user's socket from organization rooms.

---

## 7. Network & Transport Security

- **CORS Allowlist**:
  - Strict origin validation matching `CLIENT_ORIGIN` with `credentials: true`. Wildcards (`*`) with credentials are prohibited.
  - In production mode, arbitrary `*.vercel.app` domains and unauthorized localhost origins are rejected.
- **HTTP Security Headers**:
  - `helmet` middleware is configured with standard security headers.
- **Rate Limiting**:
  - Endpoint-level rate limiting is enforced on sensitive routes (`/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/forgot-password`).
- **Database Network Security (MongoDB Atlas)**:
  - **Egress & Network Access**: In standard Vercel serverless tiers, egress IPs are dynamic. If `0.0.0.0/0` is allowed in Atlas Network Access, exposure is mitigated through defense-in-depth:
    - **Credential Separation**: Staging credentials access only the staging database (`workflow_staging`); production credentials access only `workflow`.
    - **Role Least Privilege**: Application users are restricted to `readWrite` on their assigned database without administrative rights (`clusterAdmin`, `atlasAdmin`).
    - **Strong Authentication**: SCRAM-SHA-256 authentication with high-entropy (>32 character) secret passwords.
    - **In-Transit Encryption**: TLS 1.3 encryption enforced on all connection strings (`tls=true`).
  - **Static Egress / Private Networking**: In enterprise environments, Vercel Secure Compute provides dedicated static outbound IP addresses for strict IP allowlisting in Atlas, or containerized deployments utilize AWS PrivateLink / VPC Peering.

---

## 8. Verified Security Test Results

The automated regression suite verifies all critical security and isolation boundaries across 8 backend test suites (94 test cases / 103 assertions, 100% pass rate):

1. **`backend/tests/qa_security_audit.test.js`** (30 Tests):
   - Strict CORS rejection of unauthorized origins
   - Unauthenticated & cross-tenant attachment download rejection
   - Malformed/executable file upload rejection
   - Valid file upload and authenticated download verification
   - Physical file cleanup upon attachment deletion
   - NoSQL injection operator filtering
   - Malformed ObjectId / CastError resilience
   - Multi-tenant project, task, comment, and member isolation
   - Admin privilege escalation prevention around Owner role
   - Self-promotion prevention
   - Single-device logout and logout-all session revocation
   - Password change token invalidation
   - Unauthorized Socket.IO organization room rejection
   - Result: **30 / 30 Passed**

2. **`backend/tests/auth_registration.test.js`** (2 Tests):
   - Instant registration and session bootstrap without token leakage
   - Password reset token hashed with SHA-256 and single-use invalidation
   - Result: **2 / 2 Passed**

3. **`backend/tests/e2e_business_flow.test.js`** (1 Test Scenario / 12 Flow Steps):
   - Comprehensive multi-step integration: user creation, organization bootstrap, project creation, task workflow, comments, attachments, dashboard analytics, and post-logout persistence
   - Result: **1 / 1 Passed**

4. **`backend/tests/assignee_status_rbac.test.js`** (12 Tests):
   - Only assigned user can change task status
   - Creator, Admin, and Owner 403 rejection when not assigned
   - Unassigned task protection
   - Reassignment permission transfer
   - Atomic race-condition prevention
   - Result: **12 / 12 Passed**

5. **`backend/tests/concurrency_stale_writes.test.js`** (10 Tests / 12 Assertions):
   - Stale write conflict rejection (409 Conflict)
   - Concurrent comment integrity
   - Tenant isolation on socket room joins
   - Reconnection blocking after room eviction
   - Cross-tenant task assignment rejection
   - Result: **10 / 10 Passed**

6. **`backend/tests/persistence_writeback.test.js`** (1 Test):
   - MongoDB persistence and state preservation across server reloads
   - Result: **1 / 1 Passed**

7. **`backend/tests/collab_realtime_e2e.test.js`** (30 Tests):
   - Full collaborative workflow, team invites, role demotions, notifications, and real-time events.
   - Result: **30 / 30 Passed**

8. **`backend/tests/vercel_runtime_verification.test.js`** (8 Test Groups / 17 Assertions):
   - Serverless entrypoint validation and HTTP health checks
   - Private blob streaming via `get()` with security headers
   - Direct client upload intent & oversized/invalid-type rejection up to 10 MB
   - Multi-client Socket.IO tenant isolation
   - Production Redis requirement guard
   - Result: **8 / 8 Passed**
