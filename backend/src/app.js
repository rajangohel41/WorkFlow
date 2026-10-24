import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import path from "node:path"
import fs from "node:fs"
import { env } from "./config/env.js"
import { connectDb } from "./db/connect.js"
import { errorHandler } from "./middleware/errorHandler.js"
import { sanitizeMiddleware } from "./middleware/sanitize.js"
import { requireAuth } from "./middleware/auth.js"
import { OrganizationMember } from "./models/Organization.js"
import { Task } from "./models/Task.js"
import { streamPrivateBlob, isBlobStorageConfigured } from "./services/storage.js"

import authRoutes from "./routes/auth.routes.js"
import organizationRoutes from "./routes/organizations.routes.js"
import projectRoutes from "./routes/projects.routes.js"
import taskRoutes from "./routes/tasks.routes.js"
import notificationRoutes from "./routes/notifications.routes.js"
import analyticsRoutes from "./routes/analytics.routes.js"
import searchRoutes from "./routes/search.routes.js"
import userRoutes from "./routes/users.routes.js"
import calendarRoutes from "./routes/calendar.routes.js"

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8443",
  "http://127.0.0.1:8443",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]

const allowedOrigins = process.env.NODE_ENV === "production" ? [] : [...defaultAllowedOrigins]
if (Array.isArray(env.allowedOrigins)) {
  for (const origin of env.allowedOrigins) {
    if (origin && !allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin)
    }
  }
}

// Scoped preview origin regex: requires explicit pattern in production; no wildcard *.vercel.app permitted
const vercelPreviewRegex = env.vercelPreviewPattern
  ? new RegExp(env.vercelPreviewPattern)
  : null

export const corsOriginHandler = (origin, callback) => {
  if (!origin) return callback(null, true)

  // Explicitly configured origins (e.g. exact production domain)
  if (allowedOrigins.includes(origin)) {
    return callback(null, true)
  }

  // Development localhost allowance
  if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return callback(null, true)
  }

  // Scoped Vercel Preview domain (only if ALLOW_VERCEL_PREVIEWS is enabled AND scoped pattern is configured)
  if (env.allowVercelPreviews && vercelPreviewRegex && vercelPreviewRegex.test(origin)) {
    return callback(null, true)
  }

  callback(new Error("CORS policy does not allow access from this origin"))
}


const app = express()

app.set("trust proxy", 1)
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(
  cors({
    origin: corsOriginHandler,
    credentials: true,
  }),
)

app.use(express.json({ limit: "2mb" }))
app.use(cookieParser())
app.use(sanitizeMiddleware)

// Ensure MongoDB connection is initialized before handling requests (crucial for serverless environments)
app.use(async (_req, _res, next) => {
  try {
    await connectDb()
    next()
  } catch (error) {
    next(error)
  }
})

const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
})
app.use(generalLimiter)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { message: "Too many authentication attempts, please try again later" },
})

// Protected multi-tenant attachment access
app.get("/uploads/:filename", requireAuth, async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename)
    const task = await Task.findOne({
      "attachments.url": `/uploads/${filename}`,
    })
    if (!task) {
      return res.status(404).json({ message: "File not found" })
    }
    const isMember = await OrganizationMember.exists({
      organizationId: task.organizationId,
      userId: req.user._id,
      status: "Active",
    })
    if (!isMember) {
      return res.status(403).json({ message: "Unauthorized to access this attachment" })
    }
    const attachment = (task.attachments || []).find((a) => a.url === `/uploads/${filename}`)
    if (!attachment) {
      return res.status(404).json({ message: "Attachment not found on task" })
    }

    // Stream private blob securely through authorized function (never redirect to bare private URL)
    if (attachment.blobUrl && isBlobStorageConfigured()) {
      const streamed = await streamPrivateBlob(attachment.blobUrl, res, attachment)
      if (streamed) return
      return res.status(404).json({ message: "Attachment object not found in storage" })
    }

    const uploadDir = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads")
    const filePath = path.resolve(uploadDir, filename)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found on disk" })
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(attachment.name || filename)}"; filename*=UTF-8''${encodeURIComponent(attachment.name || filename)}"`,
    )
    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate")
    res.sendFile(filePath)
  } catch (error) {
    next(error)
  }
})


const api = express.Router()
api.use("/auth/login", authLimiter)
api.use("/auth/register", authLimiter)
api.use("/auth/forgot-password", authLimiter)
api.use("/auth/reset-password", authLimiter)

api.use("/auth", authRoutes)
api.use("/organizations", organizationRoutes)
api.use("/projects", projectRoutes)
api.use("/tasks", taskRoutes)
api.use("/notifications", notificationRoutes)
api.use("/analytics", analyticsRoutes)
api.use("/search", searchRoutes)
api.use("/users", userRoutes)
api.use("/calendar", calendarRoutes)

app.use("/api/v1", api)

app.get("/health", (_req, res) => res.json({ ok: true, status: "healthy" }))
app.get("/api/v1/health", (_req, res) => res.json({ ok: true, status: "healthy" }))
app.get("/", (_req, res) => res.json({ name: "WorkFlow API", version: "1.0.0", status: "healthy" }))

app.use(errorHandler)

export default app
export { app }
