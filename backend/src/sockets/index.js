import { Server } from "socket.io"
import mongoose from "mongoose"
import { createAdapter } from "@socket.io/redis-adapter"
import Redis from "ioredis"
import { verifyAccessToken } from "../utils/tokens.js"
import { User } from "../models/User.js"
import { OrganizationMember } from "../models/Organization.js"
import { corsOriginHandler } from "../app.js"

let redisPub = null
let redisSub = null

/**
 * Get active Redis pub/sub clients if initialized
 */
export function getRedisClients() {
  return { pub: redisPub, sub: redisSub }
}

/**
 * Safely clean up Redis connections and close socket server
 */
export async function closeSocketServer(io) {
  if (io) {
    try {
      await new Promise((resolve) => io.close(resolve))
    } catch {}
  }
  if (redisPub) {
    try {
      await redisPub.quit()
    } catch {}
    redisPub = null
  }
  if (redisSub) {
    try {
      await redisSub.quit()
    } catch {}
    redisSub = null
  }
}

/**
 * Initialize Socket.IO server with authentication, multi-tenant rooms,
 * and optional Redis adapter for multi-instance / serverless cross-instance sync.
 *
 * @param {import("node:http").Server} server
 * @param {import("express").Application} [app]
 * @returns {Server}
 */
export function initSocketServer(server, app) {
  const isProduction = process.env.NODE_ENV === "production"
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING

  if (isProduction && !redisUrl && !process.env.ALLOW_IN_MEMORY_SOCKETS_IN_PROD) {
    throw new Error(
      "[Socket.IO Production Blocker] REDIS_URL is required in production for cross-instance WebSocket synchronization across Vercel Functions. Configure REDIS_URL with an Upstash or Redis connection string.",
    )
  }

  const io = new Server(server, {
    cors: {
      origin: corsOriginHandler,
      credentials: true,
    },
    transports: ["websocket", "polling"],
  })

  // Configure Redis Pub/Sub adapter if REDIS_URL is provided (crucial for multi-instance Vercel functions)
  if (redisUrl) {
    try {
      if (!redisPub) {
        redisPub = new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          lazyConnect: true,
          retryStrategy: (times) => Math.min(times * 100, 3000),
        })
        redisPub.on("error", (err) => console.warn("[Socket.IO] Redis pub client error:", err.message))

        redisSub = redisPub.duplicate()
        redisSub.on("error", (err) => console.warn("[Socket.IO] Redis sub client error:", err.message))

        redisPub.connect().catch((err) => console.warn("[Socket.IO] Redis pub connect warning:", err.message))
        redisSub.connect().catch((err) => console.warn("[Socket.IO] Redis sub connect warning:", err.message))
      }
      io.adapter(createAdapter(redisPub, redisSub))
    } catch (err) {
      if (isProduction) {
        throw new Error(`[Socket.IO] Failed to initialize Redis adapter in production: ${err.message}`)
      }
      console.warn("[Socket.IO] Redis adapter initialization error, continuing with in-memory adapter:", err.message)
    }
  }

  if (app) {
    app.set("io", io)
  }


  // Socket.IO authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.cookie
          ?.split(";")
          .find((c) => c.trim().startsWith("accessToken="))
          ?.split("=")[1]
      if (!token) return next(new Error("Unauthorized"))
      const payload = verifyAccessToken(token)
      const user = await User.findById(payload.sub)
      if (!user) return next(new Error("Unauthorized"))
      if (
        payload.v !== undefined &&
        user.tokenVersion !== undefined &&
        payload.v < user.tokenVersion
      ) {
        return next(new Error("Unauthorized"))
      }
      socket.userId = payload.sub
      socket.user = user
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
        for (const room of socket.rooms) {
          if (room.startsWith("org:") && room !== `org:${organizationId}`) {
            socket.leave(room)
          }
        }
        socket.join(`org:${organizationId}`)
      }
    })

    socket.on("leaveOrganization", (organizationId) => {
      if (organizationId) {
        socket.leave(`org:${organizationId}`)
      }
    })

    socket.on("joinProject", async (projectId) => {
      if (!projectId || !mongoose.isValidObjectId(projectId)) return
      const { Project } = await import("../models/Project.js")
      const project = await Project.findById(projectId).lean()
      if (!project) return
      const isMember = await OrganizationMember.exists({
        organizationId: project.organizationId,
        userId: socket.userId,
        status: "Active",
      })
      if (isMember) {
        socket.join(`project:${projectId}`)
      }
    })
  })

  return io
}
