import mongoose from "mongoose"

const activitySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    text: { type: String, required: true },
    target: { type: String, default: "" },
  },
  { timestamps: true },
)

activitySchema.index({ organizationId: 1, createdAt: -1 })
activitySchema.index({ organizationId: 1, target: 1, createdAt: -1 })

export const Activity = mongoose.model("Activity", activitySchema)
