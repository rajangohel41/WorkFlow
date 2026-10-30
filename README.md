# WorkFlow

> High-velocity, multi-tenant project management SaaS inspired by Linear and Jira. Built with modern JavaScript (React 19, Vite, Tailwind CSS v4, Express 5, Socket.IO, and MongoDB), featuring strict tenant isolation, real-time collaboration, and enterprise-grade role-based access control.

---

## Highlights & Implemented Features

- **Strict Multi-Tenancy**: Organization-scoped data models for workspaces, projects, tasks, comments, attachments, notifications, and activities.
- **Assignee-Only Status Transitions**: Strict business rule where only the task's currently assigned user may change its status, enforced atomically on the backend with optimistic client UI feedback.
- **Real-Time Collaboration**: Socket.IO authenticated tenant-isolated rooms with multi-instance Redis adapter support for horizontal scaling and serverless runtimes.
- **Optimistic Concurrency Control**: Document versioning (`version` counter) on tasks to detect and prevent silent stale-write overwrites during concurrent edits.
- **Secure File Storage & Direct Uploads**:
  - Direct client uploads to Vercel Blob via presigned client tokens, bypassing the serverless 4.5 MB Function body limit up to 10 MB.
  - Private blob streaming through authorized endpoints (`/uploads/:filename`) ensuring unauthenticated and cross-tenant downloads are strictly blocked.
  - Local disk fallback storage for self-hosted and development setups.
- **Dual-Token Authentication**:
  - Short-lived JWT access tokens (15m) and long-lived refresh tokens (7d) in `httpOnly` secure cookies with `tokenVersion` session invalidation.
- **Granular RBAC**: Strict role boundaries (`Owner`, `Admin`, `Manager`, `Member`, `Viewer`) preventing privilege escalation and unauthorized project mutations.
- **Dynamic Browser Branding**: Dynamic route titles and SVG branding.

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │             React 19 Client             │
                      │  (Vite 8 + Tailwind v4 + React Query)   │
                      └────────────────────┬────────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        │ HTTP REST (/api/v1)   WebSocket (WS)│
                        ▼                                     ▼
      ┌───────────────────────────────────────────────────────────────┐
      │                   Express 5 + Socket.IO Server                │
      │        (Standalone Node.js Service or Vercel Function)         │
      │  - Auth & Token Revocation Middleware                         │
      │  - Multi-Tenant Scoping & RBAC Middleware                     │
      │  - NoSQL Sanitization & Rate Limiters                         │
      └──────────────┬──────────────────┬─────────────────┬───────────┘
                     │                  │                 │
                     ▼                  ▼                 ▼
          ┌────────────────────┐ ┌───────────────┐ ┌───────────────┐
          │   MongoDB Atlas    │ │ Redis Pub/Sub │ │  Vercel Blob  │
          │ (Indexed Tenancy)  │ │   (Adapter)   │ │(Private Files)│
          └────────────────────┘ └───────────────┘ └───────────────┘
```

---

## Technology Stack

| Layer | Technology | Key Capabilities |
| :--- | :--- | :--- |
| **Frontend Framework** | **React 19** + **Vite 8** | Modern client-side rendering with instant HMR and optimized chunking |
| **Styling** | **Tailwind CSS v4** | CSS-first configuration and design tokens |
| **State & Cache** | **Zustand** + **TanStack Query v5** | Persistent client session store with automatic server-state synchronization |
| **Backend Framework** | **Node.js 20+** + **Express 5** | RESTful modular API architecture using ES Modules |
| **Realtime Engine** | **Socket.IO 4** | Authenticated rooms, tenant isolation, and Redis Pub/Sub adapter |
| **Database & ODM** | **MongoDB** + **Mongoose 8** | Compound indexes, tenant queries, and atomic concurrency guards |
| **File Storage** | **@vercel/blob** / **Local Disk** | Private cloud object storage streaming with direct client token flow |
| **Security Layer** | **Argon2** + **Helmet** + **Express Rate Limit** | Hardened security headers, rate limiting, and NoSQL injection filters |

---

## Repository Structure

```
WorkFlow/
├── .github/
│   └── workflows/ci.yml      # Automated GitHub Actions test & build pipeline
├── frontend/
│   ├── public/               # Favicon SVG and public static assets
│   ├── src/
│   │   ├── api/              # Axios/Fetch client with automatic token refreshing
│   │   ├── components/       # Domain UI components (TaskDrawer, Board, Modals)
│   │   ├── hooks/            # Custom React hooks (queries, sockets, route title)
│   │   ├── layouts/          # App and Auth dashboard layouts
│   │   ├── pages/            # Route views (Dashboard, Board, Tasks, Team, Analytics)
│   │   ├── services/         # Typed domain API client services
│   │   ├── store/            # Zustand global authentication and workspace store
│   │   ├── App.jsx           # Route declarations
│   │   └── main.jsx          # React entrypoint
│   ├── tests/                # Frontend component & automation test suites
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── api/                  # Vercel serverless HTTP entrypoint
│   ├── src/
│   │   ├── config/           # Environment validation and CORS setup
│   │   ├── db/               # MongoDB connection and seed routines
│   │   ├── middleware/       # Auth, RBAC, tenant isolation, and sanitization
│   │   ├── models/           # Mongoose schemas with compound indexes
│   │   ├── routes/           # REST API routes (/api/v1/...)
│   │   ├── services/         # Storage (Vercel Blob), serializers, notifications
│   │   ├── sockets/          # Socket.IO room lifecycle and Redis pub/sub
│   │   ├── app.js            # Express app assembly and error handling
│   │   └── index.js          # Persistent server entrypoint
│   ├── tests/                # Automated security, RBAC, and concurrency test suites
│   └── package.json
├── README.md
└── SECURITY.md
```

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher
- **MongoDB**: Local Community Server (`mongodb://127.0.0.1:27017`) or MongoDB Atlas URI

### 1. Configure Environment Variables

Copy the example environment files for both backend and frontend:

```bash
# Backend configuration
cp backend/.env.example backend/.env

# Frontend configuration
cp frontend/.env.example frontend/.env
```

#### Backend Environment Variables (`backend/.env`)

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | API server listen port | `5000` |
| `NODE_ENV` | Runtime environment | `development` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/workflow` |
| `CLIENT_ORIGIN` | Allowed CORS origin(s) | `http://localhost:8443` |
| `JWT_ACCESS_SECRET` | Secret for access token signing | Minimum 32 random characters |
| `JWT_REFRESH_SECRET` | Secret for refresh token signing | Minimum 32 random characters |
| `REDIS_URL` | Redis connection URI (Optional in dev, required for serverless multi-instance) | `rediss://default:pass@host:6379` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for cloud attachments (Optional, defaults to local disk) | `vercel_blob_rw_...` |

#### Frontend Environment Variables (`frontend/.env`)

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `VITE_API_URL` | Base URL for REST API | `/api/v1` or `http://localhost:5000/api/v1` |
| `VITE_SOCKET_URL` | Base URL for Socket.IO realtime server | `http://localhost:5000` |

---

### 2. Run Locally

#### Backend Server
```bash
cd backend
npm install
npm run dev
```
The API server starts on `http://localhost:5000`. Health check: `http://localhost:5000/api/v1/health`.

#### Frontend Client
```bash
cd frontend
npm install
npm run dev
```
The frontend starts on `http://localhost:8443` (or configured port).

---

## Automated Test Suites

WorkFlow includes comprehensive automated test suites covering security, authorization, real-time collaboration, and browser UI workflows. All tests run against an isolated test database (`workflow_test`).

### Run Backend Tests
```bash
cd backend
npm test
```

Included backend test suites (94 total test cases across 8 suites, 100% pass rate):
- **`qa_security_audit.test.js`** (30 tests): NoSQL injection filtering, malformed ObjectIds, CORS origin rejection, path traversal prevention, role boundaries.
- **`auth_registration.test.js`** (2 tests): Instant registration/login bootstrap and cryptographic SHA-256 password reset session invalidation.
- **`e2e_business_flow.test.js`** (1 test scenario, 12 steps): Complete end-to-end integration flow from user registration through Kanban transitions, attachments, and persistence.
- **`collab_realtime_e2e.test.js`** (30 tests): Real-time collaboration, invitations, notifications, member lifecycle, and multi-user room events.
- **`concurrency_stale_writes.test.js`** (10 tests / 12 assertions): Optimistic version locking, concurrent comment integrity, stale write rejection, and socket room tenant isolation.
- **`persistence_writeback.test.js`** (1 test): Database mutation durability and state preservation across server reloads.
- **`assignee_status_rbac.test.js`** (12 tests): Strict assignee-only task status transitions, unassigned task protections, atomic race condition prevention.
- **`vercel_runtime_verification.test.js`** (8 test groups / 17 assertions): Serverless entrypoint validation, private blob streaming via `get()`, direct client upload authorization up to 10 MB, and multi-client socket delivery.

### Run Frontend Tests & Build
```bash
cd frontend
npm test
npm run build
```

Included frontend test suites (37 tests across 3 suites, 100% pass rate):
- **`browser_branding.test.js`** (6 tests): Route title resolution, favicon metadata, and Vercel routing configurations.
- **`assignee_status_ui.test.js`** (7 tests): UI permission guards, disabled state tooltips, and optimistic rollback on 403.
- **`frontend_automation.test.js`** (24 tests): End-to-end user workflows, project creation, task management, checklist toggling, and analytics.

---

## Deployment Guidelines

WorkFlow is designed to support both persistent container hosting (e.g., Render, Railway, AWS ECS) and serverless deployment (Vercel).

### Deploying to Vercel
1. **Frontend**: Set Root Directory to `frontend`. Build Command: `npm run build`, Output Directory: `dist`. SPA rewrites are pre-configured in `frontend/vercel.json`.
2. **Backend**: Set Root Directory to `backend`. The serverless function entrypoint is configured in `backend/api/index.js` via `backend/vercel.json`.
3. **Storage & Realtime**:
   - Link a Vercel Blob store to populate `BLOB_READ_WRITE_TOKEN`.
   - Provide an Upstash Redis connection string via `REDIS_URL` for cross-instance WebSocket event propagation.
4. **MongoDB Atlas Network Security**:
   - **Dynamic Serverless Egress**: Vercel Serverless Functions execute across dynamic multi-region IP pools. If configuring `0.0.0.0/0` in Atlas Network Access, you must strictly implement defense-in-depth:
     - **Database User Separation**: Separate database credentials for staging vs. production.
     - **Least Privilege**: The application database user must be restricted to `readWrite` on the specific database (`workflow` or `workflow_staging`), with no administrative roles.
     - **Strong Authentication**: Require SCRAM-SHA-256 with long, random passwords.
     - **Transport Security**: Enforce TLS 1.3 encryption on the connection string.
   - **Restricted Egress Alternatives**: For enterprise setups requiring network-level IP allowlisting, use **Vercel Secure Compute** to assign dedicated outbound IP addresses to serverless functions, or deploy the backend in a containerized environment (AWS ECS/Render) with VPC Peering or AWS PrivateLink to MongoDB Atlas.

---

## Project Roadmap

- [x] Multi-tenant organization workspace separation
- [x] Strict assignee-only task status change authorization
- [x] Real-time updates via Socket.IO with multi-instance Redis adapter
- [x] Direct client uploads to Vercel Blob with private streaming
- [x] Optimistic concurrency control for task editing
- [ ] Email notifications via Resend / SendGrid
- [ ] SAML 2.0 / Single Sign-On (SSO) enterprise integrations
- [ ] GitHub & GitLab pull request synchronization

<!-- Deployment trigger -->

---

## License

This project is licensed under the MIT License.
