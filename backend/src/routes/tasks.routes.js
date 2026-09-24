import { Router } from "express"
import mongoose from "mongoose"
import multer from "multer"
import path from "node:path"
import fs from "node:fs"
import { Task, nextTaskDisplayId } from "../models/Task.js"
import { Project } from "../models/Project.js"
import { User } from "../models/User.js"
import { Comment } from "../models/Comment.js"
import { Activity } from "../models/Activity.js"
import { OrganizationMember } from "../models/Organization.js"
import { requireAuth, requireOrganization, requireRole } from "../middleware/auth.js"
import { serializeTask } from "../services/serializers.js"
import { createNotification, emitOrgEvent } from "../services/notify.js"
import { formatRelative } from "../utils/helpers.js"

const router = Router()

router.use(requireAuth, requireOrganization)

const ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".pdf", ".txt", ".csv", ".docx", ".xlsx", ".pptx", ".zip"
])
const ALLOWED_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/x-zip-compressed"
])

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error(`File type ${ext} is not allowed`))
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    return cb(new Error(`MIME type ${file.mimetype} is not allowed`))
  }
  cb(null, true)
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, "uploads/")
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const sanitizedBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 50)
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `${unique}-${sanitizedBase}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
})

async function loadTaskContext(req) {
  const query = { organizationId: req.organization._id }
  if (mongoose.isValidObjectId(req.params.taskId)) {
    query.$or = [{ displayId: req.params.taskId }, { _id: req.params.taskId }]
  } else {
    query.displayId = req.params.taskId
  }
  const task = await Task.findOne(query)
  if (!task) return null
  const project = await Project.findById(task.projectId)
  return { task, project }
}

async function fullTaskPayload(task, project) {
  const assignee = task.assigneeId
    ? await User.findById(task.assigneeId)
    : null
  const comments = await Comment.find({ taskId: task._id })
    .sort({ createdAt: 1 })
    .populate("authorId")
  const commentsList = comments.map((c) => ({
    id: c._id.toString(),
    author: {
      name: c.authorId.name,
      initials: c.authorId.name
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .slice(0, 2),
      color: "#6366F1",
    },
    text: c.text,
    time: formatRelative(c.createdAt),
  }))
  return serializeTask(task, project, assignee, commentsList)
}

router.get("/", async (req, res, next) => {
  try {
    const {
      search,
      status,
      priority,
      assigneeId,
      projectId,
      page = 1,
      limit = 100,
    } = req.query
    const filter = { organizationId: req.organization._id }
    if (status) filter.status = status
    if (priority) filter.priority = priority
    if (assigneeId) filter.assigneeId = assigneeId
    if (projectId) {
      const pQuery = { organizationId: req.organization._id }
      if (mongoose.isValidObjectId(projectId)) {
        pQuery.$or = [{ slug: projectId }, { _id: projectId }]
      } else {
        pQuery.slug = projectId
      }
      const project = await Project.findOne(pQuery)
      if (project) filter.projectId = project._id
    }
    if (search) filter.title = { $regex: search, $options: "i" }
    const skip = (Number(page) - 1) * Number(limit)
    const [tasks, total] = await Promise.all([
      Task.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(Number(limit)),
      Task.countDocuments(filter),
    ])
    const projects = await Project.find({
      _id: { $in: tasks.map((t) => t.projectId) },
    })
    const projectMap = Object.fromEntries(
      projects.map((p) => [p._id.toString(), p]),
    )
    const assignees = await User.find({
      _id: { $in: tasks.map((t) => t.assigneeId).filter(Boolean) },
    })
    const assigneeMap = Object.fromEntries(
      assignees.map((u) => [u._id.toString(), u]),
    )
    res.json({
      tasks: tasks.map((task) =>
        serializeTask(
          task,
          projectMap[task.projectId.toString()],
          assigneeMap[task.assigneeId?.toString()],
        ),
      ),
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)) || 1,
    })
  } catch (error) {
    next(error)
  }
})

router.post("/", requireRole("Owner", "Admin", "Manager", "Member"), async (req, res, next) => {
  try {
    const {
      title,
      description,
      projectId,
      projectSlug,
      project: projectParam,
      status,
      priority,
      label,
      assigneeEmail,
      assignee,
      dueDate,
      due,
    } = req.body
    if (!title?.trim()) return res.status(422).json({ message: "Title is required" })
    const pTarget = projectSlug || projectId || projectParam
    const pQuery = { organizationId: req.organization._id }
    if (mongoose.isValidObjectId(pTarget)) {
      pQuery.$or = [{ slug: pTarget }, { _id: pTarget }, { name: pTarget }]
    } else {
      pQuery.$or = [{ slug: pTarget }, { name: pTarget }]
    }
    const project = await Project.findOne(pQuery)
    if (!project) return res.status(404).json({ message: "Project not found" })
    let assigneeId
    const emailToFind = assigneeEmail || (typeof assignee === "object" ? assignee?.email : (typeof assignee === "string" && assignee.includes("@") ? assignee : null))
    if (emailToFind) {
      const user = await User.findOne({ email: emailToFind.toLowerCase() })
      if (user) assigneeId = user._id
    } else if (typeof assignee === "string" && assignee.trim()) {
      const user = await User.findOne({ name: assignee.trim() })
      if (user) assigneeId = user._id
    }
    const finalDue = dueDate || due
    const displayId = await nextTaskDisplayId(req.organization._id)
    const task = await Task.create({
      organizationId: req.organization._id,
      projectId: project._id,
      displayId,
      title: title.trim(),
      description: description || "",
      status: status || "Backlog",
      priority: priority || "Medium",
      label: label || "General",
      assigneeId,
      dueDate: finalDue ? new Date(finalDue) : undefined,
      createdBy: req.user._id,
    })
    await Activity.create({
      organizationId: req.organization._id,
      actorId: req.user._id,
      text: "created a new task",
      target: task.title,
    })
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "task.created", {
      id: task.displayId,
    })
    if (assigneeId && assigneeId.toString() !== req.user._id.toString()) {
      await createNotification(io, {
        organizationId: req.organization._id,
        userId: assigneeId,
        title: `You were assigned ${task.displayId}`,
        meta: `${req.user.name} assigned you · Just now`,
        entityType: "task",
        entityId: task._id,
      })
    }
    res.status(201).json(await fullTaskPayload(task, project))
  } catch (error) {
    next(error)
  }
})

router.get("/:taskId", async (req, res, next) => {
  try {
    const ctx = await loadTaskContext(req)
    if (!ctx) return res.status(404).json({ message: "Task not found" })
    res.json(await fullTaskPayload(ctx.task, ctx.project))
  } catch (error) {
    next(error)
  }
})

router.patch("/:taskId", requireRole("Owner", "Admin", "Manager", "Member"), async (req, res, next) => {
  try {
    const ctx = await loadTaskContext(req)
    if (!ctx) return res.status(404).json({ message: "Task not found" })
    const { task, project } = ctx
    const prevStatus = task.status
    const fields = [
      "title",
      "description",
      "status",
      "priority",
      "label",
      "checklist",
    ]
    for (const field of fields) {
      if (req.body[field] !== undefined) task[field] = req.body[field]
    }
    if (req.body.dueDate !== undefined) {
      task.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null
    } else if (req.body.due !== undefined) {
      task.dueDate = req.body.due ? new Date(req.body.due) : null
    }
    if (req.body.assigneeEmail !== undefined) {
      if (!req.body.assigneeEmail) task.assigneeId = undefined
      else {
        const user = await User.findOne({
          email: req.body.assigneeEmail.toLowerCase(),
        })
        if (user) task.assigneeId = user._id
      }
    } else if (req.body.assignee !== undefined) {
      if (!req.body.assignee) task.assigneeId = undefined
      else if (typeof req.body.assignee === "object" && req.body.assignee.email) {
        const user = await User.findOne({ email: req.body.assignee.email.toLowerCase() })
        if (user) task.assigneeId = user._id
      } else if (typeof req.body.assignee === "string" && req.body.assignee.includes("@")) {
        const user = await User.findOne({ email: req.body.assignee.toLowerCase() })
        if (user) task.assigneeId = user._id
      } else if (typeof req.body.assignee === "string" && req.body.assignee.trim()) {
        const user = await User.findOne({ name: req.body.assignee.trim() })
        if (user) task.assigneeId = user._id
      }
    }
    if (req.body.projectId || req.body.project) {
      const pTarget = req.body.projectId || req.body.project
      const pQuery = { organizationId: req.organization._id }
      if (mongoose.isValidObjectId(pTarget)) {
        pQuery.$or = [{ slug: pTarget }, { _id: pTarget }, { name: pTarget }]
      } else {
        pQuery.$or = [{ slug: pTarget }, { name: pTarget }]
      }
      const newProj = await Project.findOne(pQuery)
      if (newProj) task.projectId = newProj._id
    }
    await task.save()
    if (prevStatus !== task.status) {
      await Activity.create({
        organizationId: req.organization._id,
        actorId: req.user._id,
        text: "moved task to",
        target: task.status,
      })
    }
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "task.updated", {
      id: task.displayId,
      status: task.status,
    })
    if (task.status !== prevStatus) {
      emitOrgEvent(io, req.organization._id.toString(), "task.statusChanged", {
        id: task.displayId,
        status: task.status,
      })
    }
    res.json(await fullTaskPayload(task, project))
  } catch (error) {
    next(error)
  }
})

router.delete("/:taskId", requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const ctx = await loadTaskContext(req)
    if (!ctx) return res.status(404).json({ message: "Task not found" })
    await Comment.deleteMany({ taskId: ctx.task._id })
    await ctx.task.deleteOne()
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "task.deleted", {
      id: ctx.task.displayId,
    })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.post("/:taskId/duplicate", requireRole("Owner", "Admin", "Manager", "Member"), async (req, res, next) => {
  try {
    const ctx = await loadTaskContext(req)
    if (!ctx) return res.status(404).json({ message: "Task not found" })
    const displayId = await nextTaskDisplayId(req.organization._id)
    const copy = await Task.create({
      organizationId: ctx.task.organizationId,
      projectId: ctx.task.projectId,
      displayId,
      title: `Copy of ${ctx.task.title}`,
      description: ctx.task.description,
      status: ctx.task.status,
      priority: ctx.task.priority,
      label: ctx.task.label,
      assigneeId: ctx.task.assigneeId,
      dueDate: ctx.task.dueDate,
      checklist: ctx.task.checklist,
      createdBy: req.user._id,
    })
    res.status(201).json(await fullTaskPayload(copy, ctx.project))
  } catch (error) {
    next(error)
  }
})

router.get("/:taskId/comments", async (req, res, next) => {
  try {
    const ctx = await loadTaskContext(req)
    if (!ctx) return res.status(404).json({ message: "Task not found" })
    res.json({ comments: (await fullTaskPayload(ctx.task, ctx.project)).commentsList })
  } catch (error) {
    next(error)
  }
})

router.post("/:taskId/comments", requireRole("Owner", "Admin", "Manager", "Member"), async (req, res, next) => {
  try {
    const ctx = await loadTaskContext(req)
    if (!ctx) return res.status(404).json({ message: "Task not found" })
    const { text } = req.body
    if (!text?.trim()) return res.status(422).json({ message: "Comment required" })
    const comment = await Comment.create({
      taskId: ctx.task._id,
      organizationId: req.organization._id,
      authorId: req.user._id,
      text: text.trim(),
    })
    ctx.task.commentCount += 1
    await ctx.task.save()
    await Activity.create({
      organizationId: req.organization._id,
      actorId: req.user._id,
      text: "commented on",
      target: ctx.task.title,
    })
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "comment.created", {
      taskId: ctx.task.displayId,
    })
    res.status(201).json(await fullTaskPayload(ctx.task, ctx.project))
  } catch (error) {
    next(error)
  }
})

router.delete("/:taskId/comments/:commentId", async (req, res, next) => {
  try {
    const ctx = await loadTaskContext(req)
    if (!ctx) return res.status(404).json({ message: "Task not found" })
    const comment = await Comment.findOne({
      _id: req.params.commentId,
      taskId: ctx.task._id,
    })
    if (!comment) return res.status(404).json({ message: "Comment not found" })
    if (
      comment.authorId.toString() !== req.user._id.toString() &&
      !["Owner", "Admin"].includes(req.membership?.role)
    ) {
      return res.status(403).json({ message: "Not permitted to delete this comment" })
    }
    await comment.deleteOne()
    ctx.task.commentCount = Math.max(0, (ctx.task.commentCount || 1) - 1)
    await ctx.task.save()
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "comment.deleted", {
      taskId: ctx.task.displayId,
    })
    res.json(await fullTaskPayload(ctx.task, ctx.project))
  } catch (error) {
    next(error)
  }
})

router.post(
  "/:taskId/attachments",
  requireRole("Owner", "Admin", "Manager", "Member"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      const ctx = await loadTaskContext(req)
      if (!ctx) return res.status(404).json({ message: "Task not found" })
      if (!req.file) return res.status(422).json({ message: "No file uploaded" })

      const attachment = {
        name: req.file.originalname,
        url: `/uploads/${req.file.filename}`,
        size: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy: req.user._id,
      }
      ctx.task.attachments = ctx.task.attachments || []
      ctx.task.attachments.push(attachment)
      ctx.task.fileCount = ctx.task.attachments.length
      await ctx.task.save()

      await Activity.create({
        organizationId: req.organization._id,
        actorId: req.user._id,
        text: "attached a file to",
        target: ctx.task.title,
      })
      const io = req.app.get("io")
      emitOrgEvent(io, req.organization._id.toString(), "task.updated", {
        id: ctx.task.displayId,
      })
      res.status(201).json(await fullTaskPayload(ctx.task, ctx.project))
    } catch (error) {
      next(error)
    }
  },
)

router.delete("/:taskId/attachments/:attachmentId", async (req, res, next) => {
  try {
    const ctx = await loadTaskContext(req)
    if (!ctx) return res.status(404).json({ message: "Task not found" })
    const attachment = (ctx.task.attachments || []).find(
      (a) => a._id.toString() === req.params.attachmentId,
    )
    if (!attachment) {
      return res.status(404).json({ message: "Attachment not found" })
    }
    const isUploader = attachment.uploadedBy?.toString() === req.user._id.toString()
    const isPrivileged = ["Owner", "Admin", "Manager"].includes(req.membership?.role)
    if (!isUploader && !isPrivileged) {
      return res.status(403).json({ message: "Not permitted to delete this attachment" })
    }

    if (attachment.url) {
      const filename = path.basename(attachment.url)
      const diskPath = path.join(process.cwd(), "uploads", filename)
      fs.unlink(diskPath, () => {})
    }

    ctx.task.attachments = (ctx.task.attachments || []).filter(
      (a) => a._id.toString() !== req.params.attachmentId,
    )
    ctx.task.fileCount = ctx.task.attachments.length
    await ctx.task.save()
    res.json(await fullTaskPayload(ctx.task, ctx.project))
  } catch (error) {
    next(error)
  }
})

export default router
