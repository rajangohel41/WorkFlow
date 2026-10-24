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
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    // The actor who triggered this notification (optional)
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    title: { type: String, required: true },
    meta: { type: String, default: "" },
    message: { type: String, default: "" },
    type: { type: String },
    unread: { type: Boolean, default: true },
    entityType: {
      type: String,
      enum: ["task", "project", "comment", "member", "invitation", "system"],
    },
    entityId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true },
)

// Ensure recipientId and message are populated from userId/meta if not provided
notificationSchema.pre("save", function (next) {
  if (!this.recipientId && this.userId) {
    this.recipientId = this.userId
  }
  if (!this.message && (this.meta || this.title)) {
    this.message = this.meta || this.title
  }
  if (!this.type && this.entityType) {
    this.type = this.entityType
  }
  next()
})

// Compound query index for fetching a user's notifications in order
notificationSchema.index({ organizationId: 1, userId: 1, unread: 1, createdAt: -1 })
notificationSchema.index({ organizationId: 1, recipientId: 1, createdAt: -1 })
notificationSchema.index({ organizationId: 1, userId: 1, createdAt: -1 })
notificationSchema.index({ userId: 1, unread: 1, createdAt: -1 })
// TTL: auto-remove notifications older than 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })

export const Notification = mongoose.model("Notification", notificationSchema)
