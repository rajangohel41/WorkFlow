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

export const Activity = mongoose.model("Activity", activitySchema)
