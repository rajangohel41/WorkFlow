import { Router } from "express"
import { Task } from "../models/Task.js"
import { Project } from "../models/Project.js"
import { OrganizationMember } from "../models/Organization.js"
import { Activity } from "../models/Activity.js"
import { User } from "../models/User.js"
import { requireAuth, requireOrganization } from "../middleware/auth.js"
import { serializeActivity } from "../services/serializers.js"

const router = Router()

router.use(requireAuth, requireOrganization)

router.get("/dashboard", async (req, res, next) => {
  try {
    const orgId = req.organization._id
    const [projects, tasks, members, activities] = await Promise.all([
      Project.countDocuments({ organizationId: orgId, archived: false }),
      Task.find({ organizationId: orgId }),
      OrganizationMember.countDocuments({
        organizationId: orgId,
        status: "Active",
      }),
      Activity.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(10),
    ])
    const openTasks = tasks.filter((t) => t.status !== "Done").length
    const completedTasks = tasks.filter((t) => t.status === "Done").length
    const actors = await User.find({
      _id: { $in: activities.map((a) => a.actorId).filter(Boolean) },
    })
    const actorMap = Object.fromEntries(
      actors.map((u) => [u._id.toString(), u]),
    )
    res.json({
      stats: {
        activeProjects: projects,
        openTasks,
        completedTasks,
        teamMembers: members,
      },
      activity: activities.map((a) =>
        serializeActivity(a, actorMap[a.actorId?.toString()]),
      ),
    })
  } catch (error) {
    next(error)
  }
})

router.get("/overview", async (req, res, next) => {
  try {
    const tasks = await Task.find({ organizationId: req.organization._id })
    const byStatus = {}
    const byPriority = {}
    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1
      byPriority[task.priority] = (byPriority[task.priority] || 0) + 1
    }
    const completion = []
    for (let i = 11; i >= 0; i -= 1) {
      const monthStart = new Date()
      monthStart.setMonth(monthStart.getMonth() - i, 1)
      monthStart.setHours(0, 0, 0, 0)
      const monthEnd = new Date(monthStart)
      monthEnd.setMonth(monthEnd.getMonth() + 1)
      const done = tasks.filter(
        (t) =>
          t.status === "Done" &&
          t.updatedAt >= monthStart &&
          t.updatedAt < monthEnd,
      ).length
      completion.push(done)
    }
    const max = Math.max(...completion, 1)
    const normalized = completion.map((v) => Math.round((v / max) * 100))
    res.json({
      byStatus,
      byPriority,
      completion: normalized,
      productivity: tasks.length
        ? Math.round(
            (tasks.filter((t) => t.status === "Done").length / tasks.length) *
              100,
          )
        : 0,
    })
  } catch (error) {
    next(error)
  }
})

export default router
