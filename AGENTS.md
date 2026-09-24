# WorkFlow — Engineering Guidelines

Multi-tenant project-management SaaS application built with React, Vite, Tailwind CSS, Express, and MongoDB.

## Development Setup

The project uses **npm** exclusively across both frontend and backend.

### Backend (`/backend`)
- Run development server: `npm run dev` (starts on port 5000 with watch mode)
- Start production server: `npm start`
- Run test suite: `npm test`

### Frontend (`/frontend`)
- Run development server: `npm run dev` (Vite dev server)
- Build production bundle: `npm run build`
- Preview production build: `npm run preview`

## Canonical Architecture

```
WorkFlow/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── api/          # Axios/fetch API clients with interceptors
│   │   ├── components/   # Modular, domain-driven UI components
│   │   ├── hooks/        # Custom React hooks (auth, socket, queries)
│   │   ├── layouts/      # App and Auth layouts
│   │   ├── pages/        # Route views
│   │   ├── providers/    # Context providers (Auth, Query, Socket)
│   │   ├── services/     # API request services
│   │   ├── store/        # Zustand global stores
│   │   ├── App.jsx       # Route declarations
│   │   ├── index.css     # Tailwind CSS styles & design tokens
│   │   └── main.jsx      # React entrypoint
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   ├── config/       # Environment, DB, and CORS configuration
│   │   ├── middleware/   # Auth, tenant, rate limiter, error handling
│   │   ├── models/       # Mongoose schemas with compound indexes
│   │   ├── routes/       # Express route handlers
│   │   ├── sockets/      # Socket.IO authenticated rooms and handlers
│   │   ├── utils/        # Token management, password hashing, serializers
│   │   ├── app.js        # Express app initialization
│   │   └── index.js      # Server entrypoint
│   ├── tests/            # Automated security and business flow tests
│   ├── uploads/          # Authenticated file attachments
│   └── package.json
├── README.md
└── SECURITY.md
```

## Core Standards
- **Pure JavaScript**: No TypeScript files or dependencies.
- **npm Only**: Do not use or commit pnpm, yarn, or bun configuration.
- **Security First**: All organization data is strictly scoped. NoSQL injection sanitization, authenticated downloads, and JWT versioning are enforced.
- **Visual Fidelity**: Preserve existing design system, colors, spacing, and UX flows.
