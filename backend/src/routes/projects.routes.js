import { Router } from "express"
import mongoose from "mongoose"
import { Project } from "../models/Project.js"
import { Task } from "../models/Task.js"
import { Activity } from "../models/Activity.js"
import { OrganizationMember } from "../models/Organization.js"
import { requireAuth, requireOrganization, requireRole } from "../middleware/auth.js"

import { slugify } from "../utils/helpers.js"
import { serializeProject, serializeActivity } from "../services/serializers.js"
import { User } from "../models/User.js"
import { Milestone } from "../models/Milestone.js"
import { Comment } from "../models/Comment.js"
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
        .limit(safeLimit)
        .lean(),
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
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
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
    const tasks = await Task.find({ projectId: project._id }).select("_id attachments")
    await Comment.deleteMany({ taskId: { $in: tasks.map((task) => task._id) } })
    await Activity.deleteMany({ projectId: project._id })
    await Milestone.deleteMany({ projectId: project._id })
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
      projectId: project._id,
    })
      .sort({ createdAt: -1 })
      .limit(50)
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

router.get("/:projectId/milestones", async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project) return res.status(404).json({ message: "Project not found" })
    const milestones = await Milestone.find({
      organizationId: req.organization._id,
      projectId: project._id,
    }).sort({ position: 1, createdAt: 1 }).lean()
    res.json({
      milestones: milestones.map((milestone) => ({
        ...milestone,
        id: milestone._id.toString(),
        _id: milestone._id.toString(),
        organizationId: milestone.organizationId.toString(),
        projectId: milestone.projectId.toString(),
        createdBy: milestone.createdBy?.toString(),
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.post("/:projectId/milestones", requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project) return res.status(404).json({ message: "Project not found" })
    const { title, description = "", status = "UPCOMING", dueDate } = req.body
    if (!title?.trim()) return res.status(422).json({ message: "Title is required" })
    if (!["UPCOMING", "IN_PROGRESS", "COMPLETED"].includes(status)) {
      return res.status(422).json({ message: "Invalid milestone status" })
    }
    const last = await Milestone.findOne({ projectId: project._id }).sort({ position: -1 }).select("position").lean()
    const milestone = await Milestone.create({
      organizationId: req.organization._id,
      projectId: project._id,
      title: title.trim(),
      description,
      status,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      completedAt: status === "COMPLETED" ? new Date() : undefined,
      position: (last?.position || 0) + 1,
      createdBy: req.user._id,
    })
    res.status(201).json({ milestone: { ...milestone.toObject(), id: milestone._id.toString(), _id: milestone._id.toString() } })
  } catch (error) {
    next(error)
  }
})

router.patch("/:projectId/milestones/:milestoneId", requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project || !mongoose.isValidObjectId(req.params.milestoneId)) {
      return res.status(404).json({ message: "Milestone not found" })
    }
    const milestone = await Milestone.findOne({
      _id: req.params.milestoneId,
      organizationId: req.organization._id,
      projectId: project._id,
    })
    if (!milestone) return res.status(404).json({ message: "Milestone not found" })
    const { title, description, status, dueDate, position } = req.body
    if (status !== undefined && !["UPCOMING", "IN_PROGRESS", "COMPLETED"].includes(status)) {
      return res.status(422).json({ message: "Invalid milestone status" })
    }
    if (title !== undefined) {
      if (!title.trim()) return res.status(422).json({ message: "Title is required" })
      milestone.title = title.trim()
    }
    if (description !== undefined) milestone.description = description
    if (status !== undefined) {
      milestone.status = status
      milestone.completedAt = status === "COMPLETED" ? milestone.completedAt || new Date() : undefined
    }
    if (dueDate !== undefined) milestone.dueDate = dueDate ? new Date(dueDate) : undefined
    if (position !== undefined) milestone.position = Number(position)
    await milestone.save()
    res.json({ milestone: { ...milestone.toObject(), id: milestone._id.toString(), _id: milestone._id.toString() } })
  } catch (error) {
    next(error)
  }
})

router.delete("/:projectId/milestones/:milestoneId", requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project) return res.status(404).json({ message: "Project not found" })
    if (!mongoose.isValidObjectId(req.params.milestoneId)) {
      return res.status(404).json({ message: "Milestone not found" })
    }
    const deleted = await Milestone.findOneAndDelete({
      _id: req.params.milestoneId,
      organizationId: req.organization._id,
      projectId: project._id,
    })
    if (!deleted) return res.status(404).json({ message: "Milestone not found" })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

// List project members
router.get("/:projectId/members", async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project) return res.status(404).json({ message: "Project not found" })
    const users = await User.find({
      _id: { $in: project.memberIds || [] },
    }).select("name email avatarUrl title")
    res.json({
      members: users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        title: u.title,
      })),
    })
  } catch (error) {
    next(error)
  }
})

// Add project member (strictly organization-scoped)
router.post("/:projectId/members", requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project) return res.status(404).json({ message: "Project not found" })

    const { userId, email } = req.body
    let targetUser = null
    if (userId && mongoose.isValidObjectId(userId)) {
      targetUser = await User.findById(userId)
    } else if (email && typeof email === "string") {
      targetUser = await User.findOne({ email: email.toLowerCase().trim() })
    }
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" })
    }

    // SECURITY: target user MUST belong to the same organization as an active member
    const isMember = await OrganizationMember.findOne({
      organizationId: req.organization._id,
      userId: targetUser._id,
      status: "Active",
    })
    if (!isMember) {
      return res.status(403).json({ message: "User is not a member of this organization" })
    }

    const alreadyAdded = project.memberIds?.some(
      (id) => id.toString() === targetUser._id.toString(),
    )
    if (!alreadyAdded) {
      project.memberIds = project.memberIds || []
      project.memberIds.push(targetUser._id)
      await project.save()

      const activity = await Activity.create({
        organizationId: req.organization._id,
        projectId: project._id,
        actorId: req.user._id,
        text: "added to project",
        target: targetUser.name,
      })

      const io = req.app.get("io")
      emitOrgEvent(io, req.organization._id.toString(), "project.updated", {
        id: project.slug,
        projectId: project._id.toString(),
      })
      emitOrgEvent(io, req.organization._id.toString(), "activity.created", {
        id: activity._id.toString(),
        target: targetUser.name,
        text: "added to project",
        projectId: project._id.toString(),
      })

      // Notify the added user (skip self-notification)
      if (targetUser._id.toString() !== req.user._id.toString()) {
        await createNotification(io, {
          organizationId: req.organization._id,
          userId: targetUser._id,
          actorId: req.user._id,
          title: `You were added to project ${project.name}`,
          message: `${req.user.name} added you to the project`,
          meta: `${req.user.name} added you to the project · Just now`,
          entityType: "project",
          entityId: project._id,
        })
      }
    }

    res.status(201).json({
      success: true,
      memberIds: project.memberIds.map((id) => id.toString()),
    })
  } catch (error) {
    next(error)
  }
})

// Remove project member
router.delete("/:projectId/members/:userId", requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const project = await Project.findOne(
      findProjectQuery(req.organization._id, req.params.projectId),
    )
    if (!project) return res.status(404).json({ message: "Project not found" })

    const { userId } = req.params
    project.memberIds = (project.memberIds || []).filter(
      (id) => id.toString() !== userId,
    )
    await project.save()

    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "project.updated", {
      id: project.slug,
      projectId: project._id.toString(),
    })

    res.json({
      success: true,
      memberIds: project.memberIds.map((id) => id.toString()),
    })
  } catch (error) {
    next(error)
  }
})

export default router
