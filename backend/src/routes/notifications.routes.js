import { Router } from "express"
import mongoose from "mongoose"
import { Notification } from "../models/Notification.js"
import { requireAuth } from "../middleware/auth.js"
import { serializeNotification } from "../services/serializers.js"
import { emitUserEvent } from "../services/notify.js"

const router = Router()

router.use(requireAuth)

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
    const skip = (page - 1) * limit

    const orgId = req.headers["x-organization-id"] || req.cookies?.organizationId
    const filter = { userId: req.user._id }
    if (orgId && orgId !== "null") {
      filter.$or = [
        { organizationId: orgId },
        { entityType: "invitation" },
      ]
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, unread: true }),
    ])

    res.json({
      notifications: notifications.map(serializeNotification),
      unreadCount,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    })
  } catch (error) {
    next(error)
  }
})

router.patch("/:id/read", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid notification ID" })
    }
    const orgId = req.headers["x-organization-id"] || req.cookies?.organizationId
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user._id,
      ...(orgId && orgId !== "null"
        ? { $or: [{ organizationId: orgId }, { entityType: "invitation" }] }
        : {}),
    })
    if (!notification) return res.status(404).json({ message: "Not found" })
    notification.unread = req.body.unread ?? false
    await notification.save()

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      ...(orgId && orgId !== "null" ? { organizationId: orgId } : {}),
      unread: true,
    })

    const io = req.app.get("io")
    emitUserEvent(io, req.user._id.toString(), "notification.read", {
      id: notification._id.toString(),
      unread: notification.unread,
      unreadCount,
    })

    res.json(serializeNotification(notification))
  } catch (error) {
    next(error)
  }
})

router.post("/read-all", async (req, res, next) => {
  try {
    const orgId = req.headers["x-organization-id"] || req.cookies?.organizationId
    const filter = {
      userId: req.user._id,
      ...(orgId && orgId !== "null"
        ? { $or: [{ organizationId: orgId }, { entityType: "invitation" }] }
        : {}),
      unread: true,
    }
    await Notification.updateMany(
      filter,
      { unread: false },
    )

    const io = req.app.get("io")
    emitUserEvent(io, req.user._id.toString(), "notification.read", {
      all: true,
      unreadCount: 0,
    })

    res.json({ success: true, unreadCount: 0 })
  } catch (error) {
    next(error)
  }
})

export default router
