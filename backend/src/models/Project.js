import mongoose from "mongoose"

const projectSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, default: "Planning" },
    color: { type: String, default: "#6366F1" },
    dueDate: { type: Date },
    archived: { type: Boolean, default: false },
    favoriteBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
)

projectSchema.index({ organizationId: 1, slug: 1 }, { unique: true })
projectSchema.index({ organizationId: 1, updatedAt: -1 })
projectSchema.index({ organizationId: 1, archived: 1 })

export const Project = mongoose.model("Project", projectSchema)
