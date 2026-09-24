import { Router } from "express"
import mongoose from "mongoose"
import { Project } from "../models/Project.js"
import { Task } from "../models/Task.js"
import { Activity } from "../models/Activity.js"
import { requireAuth, requireOrganization, requireRole } from "../middleware/auth.js"
import { slugify } from "../utils/helpers.js"
import { serializeProject, serializeActivity } from "../services/serializers.js"
import { User } from "../models/User.js"
import { emitOrgEvent, createNotification } from "../services/notify.js"

const router = Router({ mergeParams: true })

router.use(requireAuth, requireOrganization)

function findProjectQuery(organizationId, projectId) {
  const query = { organizationId }
  if (mongoose.isValidObjectId(projectId)) {
    query.$or = [{ slug: projectId }, { _id: projectId }]
  } else {
    query.slug = projectId
  }
  return query
}

router.get("/", async (req, res, next) => {
  try {
    const {
      search = "",
      status,
      sort = "updated",
      page = 1,
      limit = 50,
      archived,
    } = req.query
    const filter = {
      organizationId: req.organization._id,
      archived: archived === "true",
    }
    if (search && typeof search === "string" && search.trim()) {
      const sanitized = search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      filter.name = { $regex: sanitized, $options: "i" }
    }
    if (status && typeof status === "string") filter.status = status
    const sortMap = {
      name: { name: 1 },
      updated: { updatedAt: -1 },
      due: { dueDate: 1 },
    }
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50))
    const safePage = Math.max(1, Number(page) || 1)
    const skip = (safePage - 1) * safeLimit
    const [projects, total] = await Promise.all([
      Project.find(filter)
        .sort(sortMap[sort] || sortMap.updated)
        .skip(skip)
        .limit(Number(limit)),
      Project.countDocuments(filter),
    ])
    const taskGroups = await Task.aggregate([
      {
        $match: {
          organizationId: req.organization._id,
          projectId: { $in: projects.map((p) => p._id) },
        },
      },
      { $group: { _id: "$projectId", tasks: { $push: "$$ROOT" } } },
    ])
    const taskMap = Object.fromEntries(
      taskGroups.map((g) => [g._id.toString(), g.tasks]),
    )
    res.json({
      projects: await Promise.all(
        projects.map((p) =>
          serializeProject(
            p,
            taskMap[p._id.toString()] || [],
            req.user._id.toString(),
          ),
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
    const { name, description, status, dueDate } = req.body
    if (!name?.trim()) return res.status(422).json({ message: "Name is required" })
    let slug = slugify(name)
    if (
      await Project.findOne({
        organizationId: req.organization._id,
        slug,
      })
    ) {
      slug = `${slug}-${Date.now()}`
    }
    const project = await Project.create({
      organizationId: req.organization._id,
      name: name.trim(),
      slug,
      description: description || "",
      status: status || "Planning",
      dueDate: dueDate ? new Date(dueDate) : undefined,
      memberIds: [req.user._id],
    })
    await Activity.create({
      organizationId: req.organization._id,
      actorId: req.user._id,
      text: "created project",
      target: project.name,
    })
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "project.updated", {
      id: project.slug,
    })
    res.status(201).json(
      await serializeProject(project, [], req.user._id.toString()),
    )
  } catch (error) {
    next(error)
  }
})

router.get("/:projectId", async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project) return res.status(404).json({ message: "Project not found" })
    const tasks = await Task.find({ projectId: project._id })
    res.json(await serializeProject(project, tasks, req.user._id.toString()))
  } catch (error) {
    next(error)
  }
})

router.patch("/:projectId", requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project) return res.status(404).json({ message: "Project not found" })
    const { name, description, status, dueDate, archived } = req.body
    if (name) {
      project.name = name.trim()
      project.slug = slugify(name)
    }
    if (description !== undefined) project.description = description
    if (status) project.status = status
    if (dueDate !== undefined) {
      project.dueDate = dueDate ? new Date(dueDate) : undefined
    }
    if (archived !== undefined) project.archived = archived
    await project.save()
    const tasks = await Task.find({ projectId: project._id })
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "project.updated", {
      id: project.slug,
    })
    res.json(await serializeProject(project, tasks, req.user._id.toString()))
  } catch (error) {
    next(error)
  }
})

router.delete("/:projectId", requireRole("Owner", "Admin"), async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project) return res.status(404).json({ message: "Project not found" })
    await Task.deleteMany({ projectId: project._id })
    await project.deleteOne()
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.post("/:projectId/favorite", async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project) return res.status(404).json({ message: "Project not found" })
    const userId = req.user._id
    const index = project.favoriteBy.findIndex(
      (id) => id.toString() === userId.toString(),
    )
    if (index >= 0) project.favoriteBy.splice(index, 1)
    else project.favoriteBy.push(userId)
    await project.save()
    res.json({ favorite: index < 0 })
  } catch (error) {
    next(error)
  }
})

router.get("/:projectId/activity", async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project) return res.status(404).json({ message: "Project not found" })
    const activities = await Activity.find({
      organizationId: req.organization._id,
      target: project.name,
    })
      .sort({ createdAt: -1 })
      .limit(20)
    const actors = await User.find({
      _id: { $in: activities.map((a) => a.actorId).filter(Boolean) },
    })
    const actorMap = Object.fromEntries(
      actors.map((u) => [u._id.toString(), u]),
    )
    res.json({
      activity: activities.map((a) =>
        serializeActivity(a, actorMap[a.actorId?.toString()]),
      ),
    })
  } catch (error) {
    next(error)
  }
})

export default router
