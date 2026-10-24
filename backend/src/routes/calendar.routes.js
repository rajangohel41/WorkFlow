import { Router } from "express"
import mongoose from "mongoose"
import { CalendarEvent } from "../models/CalendarEvent.js"
import { Task } from "../models/Task.js"
import { Project } from "../models/Project.js"
import { requireAuth, requireOrganization, requireRole } from "../middleware/auth.js"
import { serializeEvent } from "../services/serializers.js"

const router = Router()

router.use(requireAuth, requireOrganization)

router.get("/", async (req, res, next) => {
  try {
    const [events, tasks] = await Promise.all([
      CalendarEvent.find({ organizationId: req.organization._id }),
      Task.find({
        organizationId: req.organization._id,
        dueDate: { $exists: true, $ne: null },
      }).limit(200),
    ])
    const projects = await Project.find({
      _id: { $in: tasks.map((t) => t.projectId) },
    })
    const projectMap = Object.fromEntries(
      projects.map((p) => [p._id.toString(), p]),
    )
    const taskEvents = tasks.map((task) => ({
      id: `task-${task._id}`,
      day: new Date(task.dueDate).getDate(),
      title: `${task.displayId}: ${task.title}`,
      time: "",
      color: "blue",
      taskId: task.displayId,
      projectSlug: projectMap[task.projectId.toString()]?.slug,
    }))
    res.json({
      events: [...events.map(serializeEvent), ...taskEvents],
    })
  } catch (error) {
    next(error)
  }
})

router.post("/", requireRole("Owner", "Admin", "Manager", "Member"), async (req, res, next) => {
  try {
    const { title, day, time, projectSlug } = req.body
    let projectId
    if (projectSlug) {
      const project = await Project.findOne({
        organizationId: req.organization._id,
        slug: projectSlug,
      })
      projectId = project?._id
    }
    const event = await CalendarEvent.create({
      organizationId: req.organization._id,
      title,
      day: Number(day),
      time: time || "",
      projectId,
      createdBy: req.user._id,
    })
    res.status(201).json(serializeEvent(event))
  } catch (error) {
    next(error)
  }
})

router.delete("/:id", requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid event ID" })
    }
    const result = await CalendarEvent.deleteOne({
      _id: req.params.id,
      organizationId: req.organization._id,
    })
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Event not found" })
    }
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export default router
