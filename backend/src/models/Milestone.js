import mongoose from "mongoose"

const milestoneSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["UPCOMING", "IN_PROGRESS", "COMPLETED"],
      default: "UPCOMING",
      index: true,
    },
    dueDate: { type: Date },
    completedAt: { type: Date },
    position: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

milestoneSchema.index({ organizationId: 1, projectId: 1, position: 1 })

export const Milestone = mongoose.model("Milestone", milestoneSchema)