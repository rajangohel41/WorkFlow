import { Router } from "express"
import { Project } from "../models/Project.js"
import { Task } from "../models/Task.js"
import { OrganizationMember } from "../models/Organization.js"
import { User } from "../models/User.js"
import { requireAuth, requireOrganization } from "../middleware/auth.js"
import { serializeMember } from "../services/serializers.js"

const router = Router()

router.use(requireAuth, requireOrganization)

router.get("/", async (req, res, next) => {
  try {
    const rawQ = typeof req.query.q === "string" ? req.query.q.trim() : ""
    if (!rawQ) return res.json({ projects: [], tasks: [], members: [] })
    const q = rawQ.slice(0, 100)
    const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const orgId = req.organization._id
    const [projects, tasks, memberships] = await Promise.all([
      Project.find({
        organizationId: orgId,
        archived: false,
        name: { $regex: escapedQ, $options: "i" },
      }).limit(8),
      Task.find({
        organizationId: orgId,
        $or: [
          { title: { $regex: escapedQ, $options: "i" } },
          { displayId: { $regex: escapedQ, $options: "i" } },
        ],
      }).limit(8),
      OrganizationMember.find({
        organizationId: orgId,
        status: "Active",
      }).populate("userId"),
    ])
    const members = memberships
      .map((m) => m.userId)
      .filter(
        (user) =>
          user &&
          (user.name.toLowerCase().includes(q.toLowerCase()) ||
            user.email.toLowerCase().includes(q.toLowerCase())),
      )
      .slice(0, 8)
    res.json({
      projects: projects.map((p) => ({
        id: p.slug,
        name: p.name,
        type: "project",
      })),
      tasks: tasks.map((t) => ({
        id: t.displayId,
        title: t.title,
        type: "task",
      })),
      members: members.map((user, index) =>
        serializeMember(
          user,
          memberships.find((m) => m.userId._id.equals(user._id)),
          0,
        ),
      ),
    })
  } catch (error) {
    next(error)
  }
})

export default router
