import { Router } from "express"
import mongoose from "mongoose"
import { Notification } from "../models/Notification.js"
import { requireAuth, requireOrganization } from "../middleware/auth.js"
import { serializeNotification } from "../services/serializers.js"

const router = Router()

router.use(requireAuth, requireOrganization)

router.get("/", async (req, res, next) => {
  try {
    const notifications = await Notification.find({
      organizationId: req.organization._id,
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(50)
    res.json({
      notifications: notifications.map(serializeNotification),
      unreadCount: notifications.filter((n) => n.unread).length,
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
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user._id,
      organizationId: req.organization._id,
    })
    if (!notification) return res.status(404).json({ message: "Not found" })
    notification.unread = req.body.unread ?? false
    await notification.save()
    res.json(serializeNotification(notification))
  } catch (error) {
    next(error)
  }
})

router.post("/read-all", async (req, res, next) => {
  try {
    await Notification.updateMany(
      {
        organizationId: req.organization._id,
        userId: req.user._id,
        unread: true,
      },
      { unread: false },
    )
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export default router
