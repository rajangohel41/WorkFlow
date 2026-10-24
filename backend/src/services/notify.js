import { Notification } from "../models/Notification.js"
import { OrganizationMember } from "../models/Organization.js"

/**
 * Create a persisted notification and emit it to the recipient's socket room.
 *
 * @param {import("socket.io").Server} io
 * @param {{ organizationId, userId, actorId?, title, meta?, message?, entityType?, entityId?, requireActiveMembership? }} params
 */
export async function createNotification(io, {
  organizationId,
  userId,
  actorId,
  title,
  meta,
  message,
  entityType,
  entityId,
  requireActiveMembership = true,
}) {
  // Safety check: only create notifications for valid user + org
  if (!organizationId || !userId) return null

  if (requireActiveMembership) {
    const isMember = await OrganizationMember.exists({
      organizationId,
      userId,
      status: "Active",
    })
    if (!isMember) {
      return null
    }
  }

  const msg = message || meta || title || ""

  const notification = await Notification.create({
    organizationId,
    userId,
    recipientId: userId,
    actorId: actorId || undefined,
    title,
    meta: meta || msg,
    message: msg,
    type: entityType,
    entityType,
    entityId,
    unread: true,
  })

  const payload = {
    id: notification._id.toString(),
    recipientId: userId.toString(),
    userId: userId.toString(),
    organizationId: organizationId.toString(),
    actorId: actorId ? actorId.toString() : undefined,
    title,
    message: msg,
    meta: meta || msg,
    unread: true,
    entityType,
    type: entityType,
    entityId: entityId?.toString(),
    createdAt: notification.createdAt,
  }

  if (io) {
    io.to(`user:${userId}`).emit("notification.created", payload)
    io.to(`user:${userId}`).emit("notification:created", payload)
  }

  return notification
}

/**
 * Emit a real-time event to all members of an organization room.
 * Emits both dot and colon versions of the event name for maximum compatibility.
 */
export function emitOrgEvent(io, organizationId, event, payload) {
  if (!io || !organizationId) return
  io.to(`org:${organizationId}`).emit(event, payload)
  if (event.includes(".")) {
    io.to(`org:${organizationId}`).emit(event.replace(".", ":"), payload)
  } else if (event.includes(":")) {
    io.to(`org:${organizationId}`).emit(event.replace(":", "."), payload)
  }
}

/**
 * Emit a real-time event to all members of a project room.
 */
export function emitProjectEvent(io, projectId, event, payload) {
  if (!io || !projectId) return
  io.to(`project:${projectId}`).emit(event, payload)
  if (event.includes(".")) {
    io.to(`project:${projectId}`).emit(event.replace(".", ":"), payload)
  } else if (event.includes(":")) {
    io.to(`project:${projectId}`).emit(event.replace(":", "."), payload)
  }
}

/**
 * Emit a real-time event to a specific user.
 */
export function emitUserEvent(io, userId, event, payload) {
  if (!io || !userId) return
  io.to(`user:${userId}`).emit(event, payload)
  if (event.includes(".")) {
    io.to(`user:${userId}`).emit(event.replace(".", ":"), payload)
  } else if (event.includes(":")) {
    io.to(`user:${userId}`).emit(event.replace(":", "."), payload)
  }
}
