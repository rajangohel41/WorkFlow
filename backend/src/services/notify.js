import { Notification } from "../models/Notification.js"

export async function createNotification(io, {
  organizationId,
  userId,
  title,
  meta,
  entityType,
  entityId,
}) {
  const notification = await Notification.create({
    organizationId,
    userId,
    title,
    meta,
    entityType,
    entityId,
    unread: true,
  })
  if (io) {
    io.to(`user:${userId}`).emit("notification.created", {
      id: notification._id.toString(),
      title,
      meta,
      unread: true,
    })
  }
  return notification
}

export function emitOrgEvent(io, organizationId, event, payload) {
  if (io) io.to(`org:${organizationId}`).emit(event, payload)
}
