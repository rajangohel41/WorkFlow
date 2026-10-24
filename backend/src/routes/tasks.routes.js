import { Router } from "express"
import mongoose from "mongoose"
import multer from "multer"
import path from "node:path"
import fs from "node:fs"
import { del } from "@vercel/blob"
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client"
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
import {
  isBlobStorageConfigured,
  storeAttachment,
  removeAttachment,
  verifyBlob,
} from "../services/storage.js"

const router = Router()

router.use(requireAuth, requireOrganization)

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024 // 10 MB

export const ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".pdf", ".txt", ".csv", ".docx", ".xlsx", ".pptx", ".zip"
])
export const ALLOWED_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/x-zip-compressed"
])

export function validateAttachmentMetadata(filename, mimetype, size) {
  if (!filename || typeof filename !== "string") {
    return { valid: false, error: "Filename is required" }
  }
  const ext = path.extname(filename).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `File type ${ext} is not allowed` }
  }
  if (mimetype && !ALLOWED_MIME_TYPES.has(mimetype.toLowerCase())) {
    return { valid: false, error: `MIME type ${mimetype} is not allowed` }
  }
  if (typeof size === "number") {
    if (size <= 0) {
      return { valid: false, error: "File cannot be empty" }
    }
    if (size > MAX_ATTACHMENT_SIZE) {
      return { valid: false, error: "File size exceeds 10 MB limit" }
    }
  }
  return { valid: true, ext }
}

const fileFilter = (_req, file, cb) => {
  const check = validateAttachmentMetadata(file.originalname, file.mimetype, null)
  if (!check.valid) {
    return cb(new Error(check.error))
  }
  cb(null, true)
}


const uploadDirectory = process.env.UPLOADS_DIR || "uploads"
if (!fs.existsSync(uploadDirectory)) {
  try {
    fs.mkdirSync(uploadDirectory, { recursive: true })
  } catch {}
}

const storage = isBlobStorageConfigured()
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, uploadDirectory)
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
      id: c.authorId?._id ? c.authorId._id.toString() : "",
      name: c.authorId?.name || "Member",
      initials: (c.authorId?.name || "Member")
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
    if (search) {
      const escapedSearch = search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      filter.title = { $regex: escapedSearch, $options: "i" }
    }
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100))
    const safePage = Math.max(1, Number(page) || 1)
    const skip = (safePage - 1) * safeLimit
    const [tasks, total] = await Promise.all([
      Task.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(safeLimit).lean(),
      Task.countDocuments(filter),
    ])
    const projects = await Project.find({
      _id: { $in: tasks.map((t) => t.projectId) },
    }).lean()
    const projectMap = Object.fromEntries(
      projects.map((p) => [p._id.toString(), p]),
    )
    const assignees = await User.find({
      _id: { $in: tasks.map((t) => t.assigneeId).filter(Boolean) },
    }).select("name email avatarUrl title").lean()
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
      assigneeId: rawAssigneeId,
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

    let assigneeId = undefined
    if (rawAssigneeId) {
      if (!mongoose.isValidObjectId(rawAssigneeId)) {
        return res.status(400).json({ message: "Invalid assigneeId" })
      }
      const isMember = await OrganizationMember.findOne({
        organizationId: req.organization._id,
        userId: rawAssigneeId,
        status: "Active",
      })
      if (!isMember) {
        return res.status(403).json({ message: "Assignee is not an active member of this organization" })
      }
      assigneeId = rawAssigneeId
    } else {
      const emailToFind = assigneeEmail || (typeof assignee === "object" ? assignee?.email : (typeof assignee === "string" && assignee.includes("@") ? assignee : null))
      if (emailToFind) {
        // SECURITY: verify the assignee exists and is an active member of this organization
        const user = await User.findOne({ email: emailToFind.toLowerCase().trim() })
        if (!user) {
          return res.status(404).json({ message: "Assignee user not found" })
        }
        const isMember = await OrganizationMember.findOne({
          organizationId: req.organization._id,
          userId: user._id,
          status: "Active",
        })
        if (!isMember) {
          return res.status(403).json({ message: "Assignee is not a member of this organization" })
        }
        assigneeId = user._id
      } else if (typeof assignee === "object" && (assignee?.id || assignee?._id)) {
        const targetId = assignee.id || assignee._id
        if (!mongoose.isValidObjectId(targetId)) {
          return res.status(400).json({ message: "Invalid assignee ID" })
        }
        const isMember = await OrganizationMember.findOne({
          organizationId: req.organization._id,
          userId: targetId,
          status: "Active",
        })
        if (!isMember) {
          return res.status(403).json({ message: "Assignee is not a member of this organization" })
        }
        assigneeId = targetId
      } else if (typeof assignee === "string" && mongoose.isValidObjectId(assignee)) {
        const isMember = await OrganizationMember.findOne({
          organizationId: req.organization._id,
          userId: assignee,
          status: "Active",
        })
        if (!isMember) {
          return res.status(403).json({ message: "Assignee is not a member of this organization" })
        }
        assigneeId = assignee
      } else if (typeof assignee === "string" && assignee.trim()) {
        const user = await User.findOne({ name: assignee.trim() })
        if (user) {
          const isMember = await OrganizationMember.findOne({
            organizationId: req.organization._id,
            userId: user._id,
            status: "Active",
          })
          if (isMember) assigneeId = user._id
        }
      }
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

    if (assigneeId) {
      await Project.findByIdAndUpdate(project._id, {
        $addToSet: { memberIds: assigneeId },
      })
    }

    const activity = await Activity.create({
      organizationId: req.organization._id,
      projectId: project._id,
      taskId: task._id,
      actorId: req.user._id,
      text: "created a new task",
      target: task.title,
    })

    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "task.created", {
      id: task.displayId,
      taskId: task.displayId,
      _id: task._id.toString(),
      projectId: project._id.toString(),
      title: task.title,
      status: task.status,
    })
    emitOrgEvent(io, req.organization._id.toString(), "activity.created", {
      id: activity._id.toString(),
      target: task.title,
      text: "created a new task",
      projectId: project._id.toString(),
    })

    if (assigneeId && assigneeId.toString() !== req.user._id.toString()) {
      emitOrgEvent(io, req.organization._id.toString(), "task.assigned", {
        id: task.displayId,
        taskId: task.displayId,
        _id: task._id.toString(),
        assigneeId: assigneeId.toString(),
      })
      await createNotification(io, {
        organizationId: req.organization._id,
        userId: assigneeId,
        actorId: req.user._id,
        title: `You were assigned ${task.displayId}`,
        message: `${req.user.name} assigned you to ${task.title}`,
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

export function checkTaskStatusPermission(task, userId) {
  if (!task.assigneeId) {
    return {
      allowed: false,
      code: "TASK_UNASSIGNED",
      message: "Assign this task before changing its status",
    }
  }
  const currentAssigneeStr = task.assigneeId.toString()
  const userIdStr = userId?._id ? userId._id.toString() : userId?.toString()
  if (currentAssigneeStr !== userIdStr) {
    return {
      allowed: false,
      code: "NOT_ASSIGNEE",
      message: "Only the assigned team member can change this task's status.",
    }
  }
  return { allowed: true }
}

const handleBulkUpdate = async (req, res, next) => {
  try {
    const rawIds = req.body.taskIds || req.body.ids || []
    const updates = req.body.updates || req.body || {}
    let items = []

    if (Array.isArray(req.body.items)) {
      items = req.body.items
    } else if (Array.isArray(req.body.tasks)) {
      items = req.body.tasks
    } else if (Array.isArray(rawIds) && rawIds.length > 0) {
      items = rawIds.map((id) => ({
        id,
        status: updates.status,
        priority: updates.priority,
      }))
    } else {
      return res.status(400).json({ message: "No tasks provided for bulk update" })
    }

    const targetIds = items.map((it) => it.id || it.taskId || it._id).filter(Boolean)
    const query = { organizationId: req.organization._id }
    const objectIds = targetIds.filter((id) => mongoose.isValidObjectId(id))
    query.$or = [{ displayId: { $in: targetIds } }]
    if (objectIds.length > 0) {
      query.$or.push({ _id: { $in: objectIds } })
    }
    const foundTasks = await Task.find(query)
    const taskMap = new Map()
    for (const t of foundTasks) {
      taskMap.set(t.displayId, t)
      taskMap.set(t._id.toString(), t)
    }

    // Pre-flight check: if any task status change is unauthorized, reject the entire batch
    for (const item of items) {
      const id = item.id || item.taskId || item._id
      const task = taskMap.get(id)
      if (!task) continue

      const isStatusInItem = item.status !== undefined
      const isDifferentStatus = isStatusInItem && item.status !== task.status
      if (isDifferentStatus || isStatusInItem) {
        const auth = checkTaskStatusPermission(task, req.user._id)
        if (!auth.allowed) {
          return res.status(403).json({
            message: auth.message,
            code: auth.code,
            taskId: task.displayId,
          })
        }
      }
    }

    // Apply authorized updates atomically
    const results = []
    const io = req.app.get("io")

    for (const item of items) {
      const id = item.id || item.taskId || item._id
      const task = taskMap.get(id)
      if (!task) continue

      const prevStatus = task.status
      const isStatusChanged = item.status !== undefined && item.status !== prevStatus

      const filter = { _id: task._id }
      if (isStatusChanged) {
        filter.assigneeId = req.user._id
      }
      const setFields = {}
      if (item.status !== undefined) setFields.status = item.status
      if (item.priority !== undefined) setFields.priority = item.priority

      const updated = await Task.findOneAndUpdate(
        filter,
        { $set: setFields, $inc: { version: 1 } },
        { new: true },
      )
      if (!updated) {
        return res.status(403).json({
          message: "Only the assigned team member can change this task's status.",
          code: "NOT_ASSIGNEE",
        })
      }

      if (isStatusChanged) {
        await Activity.create({
          organizationId: req.organization._id,
          projectId: task.projectId,
          taskId: task._id,
          actorId: req.user._id,
          text: "moved task to",
          target: item.status,
        })
        emitOrgEvent(io, req.organization._id.toString(), "task.statusChanged", {
          id: task.displayId,
          taskId: task.displayId,
          _id: task._id.toString(),
          status: item.status,
        })
      }

      emitOrgEvent(io, req.organization._id.toString(), "task.updated", {
        id: task.displayId,
        taskId: task.displayId,
        _id: task._id.toString(),
        projectId: task.projectId.toString(),
        status: updated.status,
        priority: updated.priority,
        assigneeId: updated.assigneeId ? updated.assigneeId.toString() : null,
      })
      results.push(task.displayId)
    }

    res.json({ success: true, count: results.length, updatedIds: results })
  } catch (error) {
    next(error)
  }
}

const handleTaskUpdate = async (req, res, next) => {
  try {
    const ctx = await loadTaskContext(req)
    if (!ctx) return res.status(404).json({ message: "Task not found" })
    const { task, project } = ctx

    const prevStatus = task.status
    const prevAssigneeId = task.assigneeId?.toString()

    const isStatusInBody = req.body.status !== undefined
    const isDifferentStatus = isStatusInBody && req.body.status !== prevStatus
    const bodyKeys = Object.keys(req.body).filter((k) => k !== "version")
    const isExplicitStatusOnly = isStatusInBody && bodyKeys.length === 1
    const isStatusMutationAttempt = isDifferentStatus || isExplicitStatusOnly

    if (isStatusMutationAttempt) {
      const auth = checkTaskStatusPermission(task, req.user._id)
      if (!auth.allowed) {
        return res.status(403).json({
          message: auth.message,
          code: auth.code,
        })
      }
    }

    const clientVersion =
      req.body.version !== undefined
        ? Number(req.body.version)
        : req.headers["if-match"]
          ? Number(req.headers["if-match"])
          : null
    if (clientVersion !== null && !isNaN(clientVersion)) {
      const currentVersion = task.version || 1
      if (clientVersion !== currentVersion) {
        return res.status(409).json({
          message: "Conflict: Task has been modified by another user or session. Please refresh.",
          code: "STALE_VERSION",
          currentVersion,
          task: await fullTaskPayload(task, project),
        })
      }
    }

    const fields = [
      "title",
      "description",
      "priority",
      "label",
      "checklist",
    ]
    for (const field of fields) {
      if (req.body[field] !== undefined) task[field] = req.body[field]
    }
    if (req.body.status !== undefined) {
      task.status = req.body.status
    }
    if (req.body.dueDate !== undefined) {
      task.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null
    } else if (req.body.due !== undefined) {
      task.dueDate = req.body.due ? new Date(req.body.due) : null
    }

    let hasAssigneeUpdate = false
    let resolvedAssigneeId = undefined

    if (req.body.assigneeId !== undefined) {
      hasAssigneeUpdate = true
      if (!req.body.assigneeId) {
        resolvedAssigneeId = undefined
      } else {
        if (!mongoose.isValidObjectId(req.body.assigneeId)) {
          return res.status(400).json({ message: "Invalid assigneeId" })
        }
        const isMember = await OrganizationMember.findOne({
          organizationId: req.organization._id,
          userId: req.body.assigneeId,
          status: "Active",
        })
        if (!isMember) {
          return res.status(403).json({ message: "Assignee is not an active member of this organization" })
        }
        resolvedAssigneeId = req.body.assigneeId
      }
    } else if (req.body.assigneeEmail !== undefined) {
      hasAssigneeUpdate = true
      if (!req.body.assigneeEmail) {
        resolvedAssigneeId = undefined
      } else {
        const user = await User.findOne({ email: req.body.assigneeEmail.toLowerCase().trim() })
        if (!user) {
          return res.status(404).json({ message: "Assignee user not found" })
        }
        const isMember = await OrganizationMember.findOne({
          organizationId: req.organization._id,
          userId: user._id,
          status: "Active",
        })
        if (!isMember) {
          return res.status(403).json({ message: "Assignee is not an active member of this organization" })
        }
        resolvedAssigneeId = user._id
      }
    } else if (req.body.assignee !== undefined) {
      hasAssigneeUpdate = true
      if (!req.body.assignee) {
        resolvedAssigneeId = undefined
      } else if (typeof req.body.assignee === "object") {
        const targetId = req.body.assignee.id || req.body.assignee._id
        const targetEmail = req.body.assignee.email
        if (targetId && mongoose.isValidObjectId(targetId)) {
          const isMember = await OrganizationMember.findOne({
            organizationId: req.organization._id,
            userId: targetId,
            status: "Active",
          })
          if (!isMember) {
            return res.status(403).json({ message: "Assignee is not an active member of this organization" })
          }
          resolvedAssigneeId = targetId
        } else if (targetEmail) {
          const user = await User.findOne({ email: targetEmail.toLowerCase().trim() })
          if (!user) return res.status(404).json({ message: "Assignee user not found" })
          const isMember = await OrganizationMember.findOne({
            organizationId: req.organization._id,
            userId: user._id,
            status: "Active",
          })
          if (!isMember) return res.status(403).json({ message: "Assignee is not an active member of this organization" })
          resolvedAssigneeId = user._id
        }
      } else if (typeof req.body.assignee === "string" && req.body.assignee.includes("@")) {
        const user = await User.findOne({ email: req.body.assignee.toLowerCase().trim() })
        if (!user) return res.status(404).json({ message: "Assignee user not found" })
        const isMember = await OrganizationMember.findOne({
          organizationId: req.organization._id,
          userId: user._id,
          status: "Active",
        })
        if (!isMember) return res.status(403).json({ message: "Assignee is not an active member of this organization" })
        resolvedAssigneeId = user._id
      } else if (typeof req.body.assignee === "string" && mongoose.isValidObjectId(req.body.assignee)) {
        const isMember = await OrganizationMember.findOne({
          organizationId: req.organization._id,
          userId: req.body.assignee,
          status: "Active",
        })
        if (!isMember) return res.status(403).json({ message: "Assignee is not an active member of this organization" })
        resolvedAssigneeId = req.body.assignee
      } else if (typeof req.body.assignee === "string" && req.body.assignee.trim()) {
        const user = await User.findOne({ name: req.body.assignee.trim() })
        if (user) {
          const isMember = await OrganizationMember.findOne({
            organizationId: req.organization._id,
            userId: user._id,
            status: "Active",
          })
          if (!isMember) return res.status(403).json({ message: "Assignee is not an active member of this organization" })
          resolvedAssigneeId = user._id
        }
      }
    }

    if (hasAssigneeUpdate) {
      task.assigneeId = resolvedAssigneeId
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

    const isStatusChanged = task.status !== prevStatus

    const queryCondition = { _id: task._id }
    if (clientVersion !== null && !isNaN(clientVersion)) {
      queryCondition.version = clientVersion
    }
    if (isStatusChanged) {
      queryCondition.assigneeId = req.user._id
    }

    const updated = await Task.findOneAndUpdate(
      queryCondition,
      {
        $set: {
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          label: task.label,
          checklist: task.checklist,
          dueDate: task.dueDate,
          assigneeId: task.assigneeId,
          projectId: task.projectId,
        },
        $inc: { version: 1 },
      },
      { new: true },
    )

    if (!updated) {
      const fresh = await Task.findById(task._id)
      if (!fresh) {
        return res.status(404).json({ message: "Task not found" })
      }
      if (isStatusChanged) {
        const freshAuth = checkTaskStatusPermission(fresh, req.user._id)
        if (!freshAuth.allowed) {
          return res.status(403).json({
            message: freshAuth.message,
            code: freshAuth.code,
          })
        }
      }
      if (clientVersion !== null && !isNaN(clientVersion) && fresh.version !== clientVersion) {
        return res.status(409).json({
          message: "Conflict: Task was modified concurrently by another user. Please refresh.",
          code: "STALE_VERSION",
          currentVersion: fresh.version || 1,
          task: await fullTaskPayload(fresh, project),
        })
      }
      return res.status(409).json({
        message: "Conflict: Task was modified concurrently by another user. Please refresh.",
        code: "STALE_VERSION",
        currentVersion: fresh.version || 1,
        task: await fullTaskPayload(fresh, project),
      })
    }
    task.version = updated.version
    const newAssigneeId = task.assigneeId?.toString()

    if (task.assigneeId) {
      await Project.findByIdAndUpdate(task.projectId, {
        $addToSet: { memberIds: task.assigneeId },
      })
    }

    if (prevStatus !== task.status) {
      await Activity.create({
        organizationId: req.organization._id,
        projectId: task.projectId,
        taskId: task._id,
        actorId: req.user._id,
        text: "moved task to",
        target: task.status,
      })
    }
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "task.updated", {
      id: task.displayId,
      taskId: task.displayId,
      _id: task._id.toString(),
      projectId: task.projectId.toString(),
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId ? task.assigneeId.toString() : null,
    })
    if (task.status !== prevStatus) {
      emitOrgEvent(io, req.organization._id.toString(), "task.statusChanged", {
        id: task.displayId,
        taskId: task.displayId,
        _id: task._id.toString(),
        status: task.status,
      })
    }
    if (
      prevAssigneeId &&
      prevAssigneeId !== newAssigneeId &&
      prevAssigneeId !== req.user._id.toString()
    ) {
      await createNotification(io, {
        organizationId: req.organization._id,
        userId: prevAssigneeId,
        actorId: req.user._id,
        title: `Task reassigned ${task.displayId}`,
        message: `${req.user.name} reassigned ${task.title}`,
        meta: `${req.user.name} reassigned ${task.displayId} · Just now`,
        entityType: "task",
        entityId: task._id,
      })
    }
    if (
      newAssigneeId &&
      newAssigneeId !== prevAssigneeId &&
      newAssigneeId !== req.user._id.toString()
    ) {
      emitOrgEvent(io, req.organization._id.toString(), "task.assigned", {
        id: task.displayId,
        taskId: task.displayId,
        _id: task._id.toString(),
        assigneeId: newAssigneeId,
      })
      await Activity.create({
        organizationId: req.organization._id,
        projectId: task.projectId,
        taskId: task._id,
        actorId: req.user._id,
        text: "assigned task to",
        target: task.title,
      })
      await createNotification(io, {
        organizationId: req.organization._id,
        userId: task.assigneeId,
        actorId: req.user._id,
        title: `You were assigned ${task.displayId}`,
        message: `${req.user.name} assigned you to ${task.title}`,
        meta: `${req.user.name} assigned you · Just now`,
        entityType: "task",
        entityId: task._id,
      })
    }
    res.json(await fullTaskPayload(task, project))
  } catch (error) {
    next(error)
  }
}

router.patch("/bulk", requireRole("Owner", "Admin", "Manager", "Member"), handleBulkUpdate)
router.put("/bulk", requireRole("Owner", "Admin", "Manager", "Member"), handleBulkUpdate)
router.post("/bulk", requireRole("Owner", "Admin", "Manager", "Member"), handleBulkUpdate)

router.patch("/:taskId/status", requireRole("Owner", "Admin", "Manager", "Member"), handleTaskUpdate)
router.put("/:taskId/status", requireRole("Owner", "Admin", "Manager", "Member"), handleTaskUpdate)

router.patch("/:taskId", requireRole("Owner", "Admin", "Manager", "Member"), handleTaskUpdate)
router.put("/:taskId", requireRole("Owner", "Admin", "Manager", "Member"), handleTaskUpdate)


router.delete("/:taskId", requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const ctx = await loadTaskContext(req)
    if (!ctx) return res.status(404).json({ message: "Task not found" })
    await Comment.deleteMany({ taskId: ctx.task._id })
    await ctx.task.deleteOne()
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "task.deleted", {
      id: ctx.task.displayId,
      taskId: ctx.task.displayId,
      _id: ctx.task._id.toString(),
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
      projectId: ctx.task.projectId,
      organizationId: req.organization._id,
      authorId: req.user._id,
      text: text.trim(),
    })
    const updatedTask = await Task.findByIdAndUpdate(
      ctx.task._id,
      { $inc: { commentCount: 1 } },
      { new: true },
    )
    ctx.task.commentCount = updatedTask.commentCount
    const activity = await Activity.create({
      organizationId: req.organization._id,
      projectId: ctx.task.projectId,
      taskId: ctx.task._id,
      actorId: req.user._id,
      text: "commented on",
      target: ctx.task.title,
    })
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "comment.created", {
      taskId: ctx.task.displayId,
      _id: ctx.task._id.toString(),
      projectId: ctx.task.projectId.toString(),
      comment: {
        id: comment._id.toString(),
        text: comment.text,
        author: {
          id: req.user._id.toString(),
          name: req.user.name,
        },
      },
    })
    emitOrgEvent(io, req.organization._id.toString(), "activity.created", {
      id: activity._id.toString(),
      target: ctx.task.title,
      text: "commented on",
      projectId: ctx.task.projectId.toString(),
    })
    // Notify task assignee or creator about the new comment (skip self-notification)
    const notifyUserId = ctx.task.assigneeId || ctx.task.createdBy
    if (notifyUserId && notifyUserId.toString() !== req.user._id.toString()) {
      await createNotification(io, {
        organizationId: req.organization._id,
        userId: notifyUserId,
        actorId: req.user._id,
        title: `New comment on ${ctx.task.displayId}`,
        message: `${req.user.name} commented: "${comment.text.slice(0, 60)}"`,
        meta: `${req.user.name} commented · Just now`,
        entityType: "comment",
        entityId: ctx.task._id,
      })
    }
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
    const updatedTask = await Task.findByIdAndUpdate(
      ctx.task._id,
      { $inc: { commentCount: -1 } },
      { new: true },
    )
    if (updatedTask.commentCount < 0) {
      await Task.findByIdAndUpdate(ctx.task._id, { commentCount: 0 })
      updatedTask.commentCount = 0
    }
    ctx.task.commentCount = updatedTask.commentCount
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "comment.deleted", {
      taskId: ctx.task.displayId,
      _id: ctx.task._id.toString(),
      commentId: comment._id.toString(),
    })
    res.json(await fullTaskPayload(ctx.task, ctx.project))
  } catch (error) {
    next(error)
  }
})


/**
 * Authorize direct client upload to Vercel Blob (bypassing 4.5 MB function limit)
 * Validates user, organization, task access, filename, extension, MIME type, and size limit (<= 10MB).
 */
router.post(
  "/:taskId/attachments/upload-intent",
  requireRole("Owner", "Admin", "Manager", "Member"),
  async (req, res, next) => {
    try {
      const ctx = await loadTaskContext(req)
      if (!ctx) return res.status(404).json({ message: "Task not found" })

      const { filename, mimeType, size } = req.body || {}
      const validation = validateAttachmentMetadata(filename, mimeType, size)
      if (!validation.valid) {
        return res.status(422).json({ message: validation.error })
      }

      const ext = validation.ext
      const sanitizedBase = path
        .basename(filename, ext)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 50)
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitizedBase}${ext}`
      const destinationPathname = `orgs/${req.organization._id}/tasks/${ctx.task._id}/${uniqueName}`

      if (isBlobStorageConfigured()) {
        const clientToken = await generateClientTokenFromReadWriteToken({
          token: process.env.BLOB_READ_WRITE_TOKEN,
          pathname: destinationPathname,
          access: "private",
          maximumSizeInBytes: MAX_ATTACHMENT_SIZE,
          validUntil: Date.now() + 15 * 60 * 1000,
        })

        return res.json({
          directUpload: true,
          clientToken,
          pathname: destinationPathname,
          uniqueName,
          access: "private",
          maxSize: MAX_ATTACHMENT_SIZE,
        })
      }

      // Local fallback (when BLOB_READ_WRITE_TOKEN is not set)
      return res.json({
        directUpload: false,
        fallbackToMultipart: true,
        maxSize: MAX_ATTACHMENT_SIZE,
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * Complete and verify direct client upload before persisting attachment record.
 * Validates destination pathname against the authenticated task and organization,
 * verifies the blob via Blob head(), and purges orphaned blobs on error.
 */
router.post(
  "/:taskId/attachments/complete",
  requireRole("Owner", "Admin", "Manager", "Member"),
  async (req, res, next) => {
    const { name, blobUrl, size, mimeType, pathname } = req.body || {}
    try {
      const ctx = await loadTaskContext(req)
      if (!ctx) return res.status(404).json({ message: "Task not found" })

      if (!isBlobStorageConfigured()) {
        return res.status(400).json({ message: "Cloud object storage is not configured" })
      }

      if (!blobUrl || typeof blobUrl !== "string") {
        return res.status(422).json({ message: "blobUrl is required" })
      }

      // Validate destination pathname strictly belongs to this org and task
      const expectedPrefix = `orgs/${req.organization._id}/tasks/${ctx.task._id}/`
      if (pathname && !pathname.startsWith(expectedPrefix)) {
        return res.status(403).json({ message: "Invalid storage destination pathname" })
      }

      // Verify blob existence and metadata directly in Vercel Blob store
      let blobMeta
      try {
        blobMeta = await verifyBlob(blobUrl)
      } catch (err) {
        return res.status(404).json({ message: "Uploaded blob not found in storage: " + err.message })
      }

      if (!blobMeta) {
        return res.status(404).json({ message: "Uploaded blob not found in storage" })
      }

      if (blobMeta.size > MAX_ATTACHMENT_SIZE) {
        try {
          await del(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN })
        } catch {}
        return res.status(422).json({ message: "Uploaded file exceeds 10 MB limit" })
      }

      const uniqueName = path.basename(blobMeta.pathname || pathname || blobUrl)
      const attachment = {
        name: name || uniqueName,
        url: `/uploads/${uniqueName}`,
        blobUrl: blobMeta.url || blobUrl,
        size: blobMeta.size || size,
        mimeType: blobMeta.contentType || mimeType || "application/octet-stream",
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
      if (blobUrl && isBlobStorageConfigured()) {
        try {
          await del(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN })
        } catch {}
      }
      next(error)
    }
  },
)

router.post(
  "/:taskId/attachments",
  requireRole("Owner", "Admin", "Manager", "Member"),
  upload.single("file"),
  async (req, res, next) => {

    try {
      const ctx = await loadTaskContext(req)
      if (!ctx) return res.status(404).json({ message: "Task not found" })
      if (!req.file) return res.status(422).json({ message: "No file uploaded" })

      const stored = await storeAttachment({
        originalname: req.file.originalname,
        buffer: req.file.buffer,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
      })

      const attachment = {
        name: stored.name,
        url: stored.url,
        blobUrl: stored.blobUrl,
        size: stored.size,
        mimeType: stored.mimeType,
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

    await removeAttachment(attachment)

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
