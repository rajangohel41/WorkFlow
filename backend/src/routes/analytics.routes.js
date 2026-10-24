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

function rangeWindow(value) {
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))
  const start = new Date(end)
  const normalized = String(value || "Last 30 days")
  const days = normalized === "Last 7 days" ? 7 : normalized === "Last 90 days" ? 90 : normalized === "This year" ? null : 30
  if (normalized === "This month") {
    start.setUTCDate(1)
    start.setUTCHours(0, 0, 0, 0)
  } else if (normalized === "Previous month") {
    start.setUTCDate(1)
    start.setUTCHours(0, 0, 0, 0)
    start.setUTCMonth(start.getUTCMonth() - 1)
    end.setUTCDate(0)
  } else if (days) {
    start.setUTCDate(start.getUTCDate() - days + 1)
    start.setUTCHours(0, 0, 0, 0)
  } else {
    start.setUTCMonth(0, 1)
    start.setUTCHours(0, 0, 0, 0)
  }
  const duration = end.getTime() - start.getTime() + 1
  return { start, end, previousStart: new Date(start.getTime() - duration), previousEnd: new Date(start.getTime() - 1) }
}

function dateFormatForRange(value) {
  return value === "This year" ? "%Y-%m" : "%Y-%m-%d"
}

function completionBuckets(start, end, monthly) {
  const buckets = []
  const cursor = new Date(start)
  if (monthly) cursor.setUTCDate(1)
  while (cursor <= end) {
    buckets.push(monthly ? cursor.toISOString().slice(0, 7) : cursor.toISOString().slice(0, 10))
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    else cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return buckets
}

router.get("/dashboard", async (req, res, next) => {
  try {
    const orgId = req.organization._id
    const { start, end, previousStart, previousEnd } = rangeWindow(req.query.range)
    const activeMembers = await OrganizationMember.find({
      organizationId: orgId,
      status: "Active",
    }).select("userId").lean()
    const memberIds = activeMembers.map((member) => member.userId)
    const [projects, openTasks, scheduledTasks, completedTasks, previousCompletedTasks, members, activities, workloads] = await Promise.all([
      Project.countDocuments({ organizationId: orgId, archived: false }),
      Task.countDocuments({ organizationId: orgId, status: { $ne: "Done" } }),
      Task.countDocuments({ organizationId: orgId, dueDate: { $exists: true, $ne: null } }),
      Activity.countDocuments({ organizationId: orgId, text: "moved task to", target: "Done", createdAt: { $gte: start, $lte: end } }),
      Activity.countDocuments({ organizationId: orgId, text: "moved task to", target: "Done", createdAt: { $gte: previousStart, $lte: previousEnd } }),
      OrganizationMember.countDocuments({
        organizationId: orgId,
        status: "Active",
      }),
      Activity.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(10).lean(),
      memberIds.length ? Task.aggregate([
        { $match: { organizationId: orgId, assigneeId: { $in: memberIds } } },
        { $group: { _id: "$assigneeId", assigned: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "Done"] }, 1, 0] } } } },
      ]) : Promise.resolve([]),
    ])
    const actors = await User.find({
      _id: { $in: activities.map((a) => a.actorId).filter(Boolean) },
    }).select("name email avatarUrl").lean()
    const actorMap = Object.fromEntries(
      actors.map((u) => [u._id.toString(), u]),
    )
    res.json({
      stats: {
        activeProjects: projects,
        openTasks,
        scheduledTasks,
        completedTasks,
        previousCompletedTasks,
        teamMembers: members,
      },
      activity: activities.map((a) =>
        serializeActivity(a, actorMap[a.actorId?.toString()]),
      ),
      workloads: workloads.map((item) => ({ userId: item._id.toString(), assigned: item.assigned, completed: item.completed })),
    })
  } catch (error) {
    next(error)
  }
})

router.get("/overview", async (req, res, next) => {
  try {
    const { start, end } = rangeWindow(req.query.range)
    const range = String(req.query.range || "Last 30 days")
    const format = dateFormatForRange(range)
    const now = new Date()
    const organizationId = req.organization._id
    const activeMembers = await OrganizationMember.find({
      organizationId,
      status: "Active",
    }).select("userId").lean()
    const memberIds = activeMembers.map((member) => member.userId)
    const [summary, completionGroups, workload] = await Promise.all([
      Task.aggregate([
        { $match: { organizationId } },
        { $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "Done"] }, 1, 0] } }, inProgress: { $sum: { $cond: [{ $eq: ["$status", "In Progress"] }, 1, 0] } } } }],
          statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          priorities: [{ $group: { _id: "$priority", count: { $sum: 1 } } }],
          overdue: [{ $match: { status: { $ne: "Done" }, dueDate: { $lt: now } } }, { $count: "count" }],
        } },
      ]),
      Activity.aggregate([
        { $match: { organizationId, text: "moved task to", target: "Done", createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: { $dateToString: { format, date: "$createdAt", timezone: "UTC" } }, count: { $sum: 1 } } },
      ]),
      memberIds.length ? Task.aggregate([
        { $match: { organizationId, assigneeId: { $in: memberIds } } },
        { $group: { _id: "$assigneeId", assigned: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "Done"] }, 1, 0] } } } },
      ]) : Promise.resolve([]),
    ])
    const aggregate = summary[0] || { totals: [], statuses: [], priorities: [], overdue: [] }
    const totals = aggregate.totals[0] || { total: 0, completed: 0, inProgress: 0 }
    const byStatus = Object.fromEntries(aggregate.statuses.map((item) => [item._id, item.count]))
    const byPriority = Object.fromEntries(aggregate.priorities.map((item) => [item._id, item.count]))
    const completionMap = Object.fromEntries(completionGroups.map((group) => [group._id, group.count]))
    const completionLabels = completionBuckets(start, end, range === "This year")
    const completion = completionLabels.map((label) => completionMap[label] || 0)
    res.json({
      totalTasks: totals.total,
      completedTasks: totals.completed,
      inProgressTasks: totals.inProgress,
      overdueTasks: aggregate.overdue[0]?.count || 0,
      byStatus,
      byPriority,
      completion,
      completionLabels,
      workloads: workload.map((item) => ({ userId: item._id.toString(), assigned: item.assigned, completed: item.completed })),
      productivity: totals.total ? Math.round((totals.completed / totals.total) * 100) : 0,
    })
  } catch (error) {
    next(error)
  }
})

export default router
