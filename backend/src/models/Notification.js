import mongoose from "mongoose"

const notificationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    meta: { type: String, default: "" },
    unread: { type: Boolean, default: true },
    entityType: { type: String, enum: ["task", "project", "comment", "member", "system"] },
    entityId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true },
)

notificationSchema.index({ organizationId: 1, userId: 1, unread: 1, createdAt: -1 })

export const Notification = mongoose.model("Notification", notificationSchema)
