import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import { createServer } from "node:http"
import { Server } from "socket.io"
import jwt from "jsonwebtoken"
import { env } from "./config/env.js"
import { connectDb } from "./db/connect.js"
import { errorHandler } from "./middleware/errorHandler.js"
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

const corsOriginHandler = (origin, callback) => {
  callback(null, true)
}

const io = new Server(server, {
  cors: {
    origin: corsOriginHandler,
    credentials: true,
  },
})

app.set("io", io)

io.use((socket, next) => {
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
    if (orgId) socket.join(`org:${orgId}`)
    next()
  } catch {
    next(new Error("Unauthorized"))
  }
})

io.on("connection", (socket) => {
  socket.on("joinOrganization", (organizationId) => {
    socket.join(`org:${organizationId}`)
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
app.use("/uploads", express.static("uploads"))
app.use(express.json({ limit: "2mb" }))
app.use(cookieParser())
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
)

const api = express.Router()
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
app.use(errorHandler)

server.listen(env.port, () => {
  console.log(`WorkFlow API listening on http://localhost:${env.port}`)
})
