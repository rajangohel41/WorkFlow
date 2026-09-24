import mongoose from "mongoose"

const checklistItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    done: { type: Boolean, default: false },
  },
  { _id: true },
)

const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number },
    mimeType: { type: String },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
)

const taskSchema = new mongoose.Schema(
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
    displayId: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Backlog", "Todo", "In Progress", "In Review", "Done"],
      default: "Backlog",
      index: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Urgent"],
      default: "Medium",
    },
    label: { type: String, default: "General" },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    dueDate: { type: Date },
    checklist: [checklistItemSchema],
    attachments: [attachmentSchema],
    commentCount: { type: Number, default: 0 },
    fileCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
)

taskSchema.index({ organizationId: 1, displayId: 1 }, { unique: true })
taskSchema.index({ organizationId: 1, projectId: 1, status: 1 })
taskSchema.index({ organizationId: 1, updatedAt: -1 })
taskSchema.index({ organizationId: 1, assigneeId: 1 })

export const Task = mongoose.model("Task", taskSchema)

export const TaskCounter = mongoose.model(
  "TaskCounter",
  new mongoose.Schema({
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      unique: true,
    },
    seq: { type: Number, default: 100 },
  }),
)

export async function nextTaskDisplayId(organizationId) {
  const counter = await TaskCounter.findOneAndUpdate(
    { organizationId },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  )
  return `WF-${counter.seq}`
}
