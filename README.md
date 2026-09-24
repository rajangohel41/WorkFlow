# WorkFlow

> Modern, multi-tenant project management SaaS inspired by Linear, Jira, and Slack. Built for high-velocity engineering teams with real-time collaboration, role-based access control, and strict tenant isolation.

---

## Architecture Overview

WorkFlow is organized as a clean decoupled full-stack JavaScript application:

- **Frontend (`/frontend`)**:
  - React 19 + Vite 8
  - Tailwind CSS v4
  - React Router v7
  - Zustand (state management) + TanStack React Query v5 (data caching)
  - Socket.IO client (live events)
  - Lucide React (icons)
  - Pure JavaScript/JSX (No TypeScript, zero mock services in production)

- **Backend (`/backend`)**:
  - Node.js (ES Modules) + Express 5
  - MongoDB + Mongoose 8
  - Socket.IO 4 (tenant-authenticated real-time rooms)
  - JWT authentication (access & refresh tokens with `tokenVersion` revocation)
  - Strict security layers (Helmet, rate limiting, NoSQL sanitization, BSON validation, authenticated file streaming)

---

## Directory Structure

```
WorkFlow/
├── frontend/
│   ├── public/             # Static public assets
│   ├── src/
│   │   ├── api/            # API client instances and interceptors
│   │   ├── components/     # UI components (common, modals, boards, drawers)
│   │   ├── hooks/          # Custom hooks (auth, sockets, queries)
│   │   ├── layouts/        # Application and auth layout containers
│   │   ├── pages/          # Primary views (Dashboard, Projects, Tasks, etc.)
│   │   ├── providers/      # React context providers
│   │   ├── services/       # Service wrappers for endpoints
│   │   ├── store/          # Global client state (Zustand)
│   │   ├── App.jsx         # App router and view mounting
│   │   ├── index.css       # Tailwind CSS v4 styling & tokens
│   │   └── main.jsx        # App entrypoint
│   ├── index.html          # Clean HTML shell
│   ├── package.json        # Dependencies & scripts
│   └── vite.config.js      # Clean Vite configuration
├── backend/
│   ├── src/
│   │   ├── config/         # Environment and DB configuration
│   │   ├── middleware/     # Auth, RBAC, tenant isolation, sanitization
│   │   ├── models/         # Database schemas with compound indexes
│   │   ├── routes/         # REST API routes (/api/v1/...)
│   │   ├── sockets/        # Socket.IO room lifecycle and event handlers
│   │   ├── utils/          # Token helpers, password hashing, serializers
│   │   ├── app.js          # Express app setup and middleware pipeline
│   │   └── index.js        # Server listener and socket attachment
│   ├── tests/              # Automated security regression and E2E suites
│   ├── uploads/            # Local attachment storage (protected)
│   ├── package.json        # Dependencies & scripts
│   └── package-lock.json
├── .gitignore
├── README.md
└── SECURITY.md
```

---

## Getting Started

### Prerequisites
- **Node.js**: v20 or higher
- **npm**: v10 or higher (Strictly **npm only**; pnpm and yarn are not used)
- **MongoDB**: Community Server running locally on `mongodb://127.0.0.1:27017` or a MongoDB Atlas URI

### 1. Environment Configuration

Copy example environment files:

```bash
# Frontend
cp frontend/.env.example frontend/.env

# Backend
cp backend/.env.example backend/.env
```

Review and update variables:
- **`backend/.env`**:
  ```env
  PORT=5000
  MONGODB_URI=mongodb://127.0.0.1:27017/workflow
  CLIENT_ORIGIN=http://localhost:8443
  JWT_ACCESS_SECRET=your-super-secret-access-key-min-32-chars
  JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
  JWT_ACCESS_EXPIRES=15m
  JWT_REFRESH_EXPIRES=7d
  ```
- **`frontend/.env`**:
  ```env
  VITE_API_URL=http://localhost:5000/api/v1
  VITE_SOCKET_URL=http://localhost:5000
  ```

### 2. Backend Setup & Run

```bash
cd backend
npm install
npm run dev
```
The backend starts at `http://localhost:5000`.
Health endpoint: `GET http://localhost:5000/api/v1/health`

### 3. Frontend Setup & Run

```bash
cd frontend
npm install
npm run dev
```
The frontend dev server runs at `http://localhost:8443` (or configured `$PORT`).

---

## Available npm Scripts

### Backend (`cd backend`)
- `npm run dev`: Starts the API server with `--watch` auto-reloading.
- `npm start`: Starts the production server.
- `npm test`: Runs the security regression test suite.

### Frontend (`cd frontend`)
- `npm run dev`: Starts Vite local development server.
- `npm run build`: Bundles the application for production into `dist/`.
- `npm run preview`: Previews the production build locally.

---

## Authentication & Authorization Model

1. **Tokens & Cookies**:
   - Access tokens (short-lived, 15m) and refresh tokens (7d) are issued as `httpOnly`, `SameSite=Lax` cookies.
   - Bearer token header (`Authorization: Bearer <token>`) is also supported for headless/API clients.
2. **Session Invalidation**:
   - Every user model contains a `tokenVersion` integer.
   - Logout from all devices or password changes increment `tokenVersion`, instantly invalidating all active sessions.
3. **Multi-Tenant Isolation**:
   - Every project, task, comment, notification, and attachment belongs strictly to an `organizationId`.
   - The `requireTenant` middleware enforces active membership and tenant context on every request.
4. **Role-Based Access Control (RBAC)**:
   - Supported roles: `Owner`, `Admin`, `Manager`, `Member`, `Viewer`.
   - Privilege escalation safeguards: Admins cannot demote or modify the Owner without explicit ownership transfer; members cannot promote themselves or alter roles.

---

## API Endpoints Summary (`/api/v1`)

| Endpoint Prefix | Description | Auth Required |
|---|---|---|
| `/auth` | Register, login, refresh, logout, session revocation, verification | Public / Protected |
| `/organizations` | Multi-tenant organization CRUD, members, invitations | Protected |
| `/projects` | Project management, statuses, priorities | Protected (Tenant) |
| `/tasks` | Tasks, Kanban columns, checklist, assignment | Protected (Tenant) |
| `/comments` | Task discussion threads with author deletion checks | Protected (Tenant) |
| `/attachments` | File upload, metadata, and authenticated file downloads | Protected (Tenant) |
| `/notifications`| User and organization activity alerts | Protected |
| `/activities` | Organization audit trail | Protected (Tenant) |
| `/analytics` | Sprint and task metric aggregation | Protected (Tenant) |
| `/health` | Server and database liveness checks | Public |

---

## Security & Regression Testing

The test suite runs against a live or test MongoDB instance and validates critical business logic and security boundaries.

Run tests:
```bash
cd backend
npm test
node tests/e2e_business_flow.test.js
```

Covered security checks:
- Multi-tenant isolation (IDOR/BOLA prevention between Org A and Org B)
- Strict CORS validation
- CastError / BSON error handling (invalid ObjectIds return 400, never 500)
- NoSQL operator injection sanitization (`$gt`, `$ne`, `$where`, etc.)
- Multer file extension and MIME type allowlisting
- Authenticated download streaming (`/uploads/:filename`)
- Owner/Admin role boundary enforcement
- Session revocation on logout-all and password change

---

## Limitations & Production Considerations

1. **Local File Storage**:
   - Attachments are stored locally under `backend/uploads/` with UUID-prefixed file names.
   - For multi-instance horizontal scaling, replace the local filesystem storage with an S3-compatible object store (e.g. AWS S3, Cloudflare R2, MinIO).
2. **Email Delivery**:
   - In non-production environments (`NODE_ENV !== "production"`), verification codes and reset tokens are conveniently returned in the API responses for testing.
   - In production (`NODE_ENV === "production"`), dev tokens are stripped and real SMTP/SES/SendGrid integration should be wired.
3. **Database Indexing**:
   - Compound indexes are configured on tenant models (e.g., `{ organizationId: 1, projectId: 1, status: 1 }`). Ensure proper production sizing for MongoDB.
