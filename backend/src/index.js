import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import { createServer } from "node:http"
import { Server } from "socket.io"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"
import path from "node:path"
import { env } from "./config/env.js"
import { connectDb } from "./db/connect.js"
import { errorHandler } from "./middleware/errorHandler.js"
import { sanitizeMiddleware } from "./middleware/sanitize.js"
import { requireAuth } from "./middleware/auth.js"
import { OrganizationMember } from "./models/Organization.js"
import { Task } from "./models/Task.js"
import authRoutes from "./routes/auth.routes.js"
import organizationRoutes from "./routes/organizations.routes.js"
import projectRoutes from "./routes/projects.routes.js"
import taskRoutes from "./routes/tasks.routes.js"
import notificationRoutes from "./routes/notifications.routes.js"
import analyticsRoutes from "./routes/analytics.routes.js"
import searchRoutes from "./routes/search.routes.js"
import userRoutes from "./routes/users.routes.js"
import calendarRoutes from "./routes/calendar.routes.js"

await connectDb()

const app = express()
const server = createServer(app)

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8443",
  "http://127.0.0.1:8443",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]
if (env.clientOrigin && !allowedOrigins.includes(env.clientOrigin)) {
  allowedOrigins.push(env.clientOrigin)
}

const corsOriginHandler = (origin, callback) => {
  if (!origin) return callback(null, true)
  if (
    allowedOrigins.includes(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return callback(null, true)
  }
  callback(new Error("CORS policy does not allow access from this origin"))
}

const io = new Server(server, {
  cors: {
    origin: corsOriginHandler,
    credentials: true,
  },
})

app.set("io", io)

io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.cookie
        ?.split(";")
        .find((c) => c.trim().startsWith("accessToken="))
        ?.split("=")[1]
    if (!token) return next(new Error("Unauthorized"))
    const payload = jwt.verify(token, env.jwtAccessSecret)
    socket.userId = payload.sub
    socket.join(`user:${payload.sub}`)

    const orgId = socket.handshake.auth?.organizationId
    if (orgId && mongoose.isValidObjectId(orgId)) {
      const isMember = await OrganizationMember.exists({
        organizationId: orgId,
        userId: payload.sub,
        status: "Active",
      })
      if (isMember) {
        socket.join(`org:${orgId}`)
      }
    }
    next()
  } catch {
    next(new Error("Unauthorized"))
  }
})

io.on("connection", (socket) => {
  socket.on("joinOrganization", async (organizationId) => {
    if (!organizationId || !mongoose.isValidObjectId(organizationId)) return
    const isMember = await OrganizationMember.exists({
      organizationId,
      userId: socket.userId,
      status: "Active",
    })
    if (isMember) {
      socket.join(`org:${organizationId}`)
    }
  })
})

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

const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(generalLimiter)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
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
    const filePath = path.join(process.cwd(), "uploads", filename)
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
api.use("/auth/verify-email", authLimiter)

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
app.get("/health", (_req, res) => res.json({ ok: true }))
app.get("/api/v1/health", (_req, res) => res.json({ ok: true }))
app.use(errorHandler)

server.listen(env.port, () => {
  console.log(`WorkFlow API listening on http://localhost:${env.port}`)
})
