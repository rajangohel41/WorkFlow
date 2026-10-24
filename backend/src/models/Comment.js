import mongoose from "mongoose"

const commentSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true },
)

commentSchema.index({ taskId: 1, createdAt: 1 })
commentSchema.index({ organizationId: 1, taskId: 1, createdAt: 1 })
commentSchema.index({ organizationId: 1, projectId: 1, createdAt: 1 })

export const Comment = mongoose.model("Comment", commentSchema)
