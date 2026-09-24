import mongoose from "mongoose"

const commentSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true },
)

commentSchema.index({ taskId: 1, createdAt: 1 })
commentSchema.index({ organizationId: 1 })

export const Comment = mongoose.model("Comment", commentSchema)
