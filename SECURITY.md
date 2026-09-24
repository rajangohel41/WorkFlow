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
  - Passwords are salted and hashed using `bcryptjs` (work factor 10). Password hashes are never selected by default in Mongoose schemas (`select: false`).
- **Environment Token Protection**:
  - Development convenience tokens (`devVerificationCode`, `devResetToken`, `devInviteToken`) are gated behind `process.env.NODE_ENV !== "production"`. In production mode, these fields are omitted from all HTTP responses.

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
  - Uploads are validated via Multer against an allowlist of safe extensions (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.pdf`, `.txt`, `.csv`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.zip`) and verified MIME types.
  - Executable scripts (`.exe`, `.sh`, `.bat`, `.js`, etc.) and spoofed extensions are rejected.
- **File Size Restrictions**:
  - File uploads are capped at 10 MB per attachment.
- **Protected File Access**:
  - Attachment files are not served through an unauthenticated public static directory.
  - Downloads route through `/api/v1/attachments/file/:filename`, requiring valid authentication and verified organization membership before streaming.
- **Physical Cleanup**:
  - Deleting an attachment record triggers unlinking (`fs.promises.unlink`) of the underlying stored file to prevent orphaned storage accumulation.

---

## 6. Real-Time Communication Security (Socket.IO)

- **Handshake Authentication**:
  - Connections authenticate during handshake via JWT cookies or authorization headers.
- **Room Isolation**:
  - Sockets can only join organization rooms (`org:<orgId>`) after server-side verification of active membership.
  - Sockets belonging to Organization A never receive event broadcasts for Organization B.

---

## 7. Network & Transport Security

- **CORS Allowlist**:
  - Strict origin validation matching `CLIENT_ORIGIN` (e.g. `http://localhost:8443` or production domain) with `credentials: true`. Wildcards (`*`) with credentials are prohibited.
- **HTTP Security Headers**:
  - `helmet` middleware is configured with standard security headers.
- **Rate Limiting**:
  - Endpoint-level rate limiting is enforced on sensitive routes (`/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/forgot-password`).

---

## 8. Verified Security Test Results

The following test suites are part of the automated regression suite:

1. **`backend/tests/qa_security_audit.test.js`** (27 Security Assertions):
   - Strict CORS rejection of unauthorized origins
   - Unauthenticated attachment download rejection
   - Malformed/executable file upload rejection
   - Valid file upload and authenticated download verification
   - Physical file cleanup upon attachment deletion
   - Cross-tenant attachment isolation
   - NoSQL injection operator filtering
   - Malformed ObjectId / CastError resilience
   - Multi-tenant project, task, comment, and member isolation
   - Admin privilege escalation prevention around Owner role
   - Self-promotion prevention
   - Single-device logout and logout-all session revocation
   - Password change token invalidation
   - Unauthorized Socket.IO organization room rejection
   - Result: **27 / 27 Passed**

2. **`backend/tests/e2e_business_flow.test.js`** (12 End-to-End Business Assertions):
   - Full lifecycle from registration through organization creation, onboarding, project/task lifecycle, checklist, comments, attachments, activities, and re-login verification.
   - Result: **12 / 12 Passed**
