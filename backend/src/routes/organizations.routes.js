import { Router } from "express"
import crypto from "node:crypto"
import {
  Organization,
  OrganizationMember,
  Invitation,
} from "../models/Organization.js"
import { User } from "../models/User.js"
import { Project } from "../models/Project.js"
import { requireAuth, requireOrganization, requireRole } from "../middleware/auth.js"
import { slugify } from "../utils/helpers.js"
import { serializeMember } from "../services/serializers.js"

const router = Router()
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
}

router.use(requireAuth)

router.get("/", async (req, res, next) => {
  try {
    const memberships = await OrganizationMember.find({
      userId: req.user._id,
      status: "Active",
    }).populate("organizationId")
    res.json({
      organizations: memberships.map((m) => ({
        id: m.organizationId._id.toString(),
        name: m.organizationId.name,
        slug: m.organizationId.slug,
        role: m.role,
        plan: m.organizationId.plan,
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.post("/", async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(422).json({ message: "Name is required" })
    let slug = slugify(name)
    if (await Organization.findOne({ slug })) slug = `${slug}-${Date.now()}`
    const organization = await Organization.create({
      name: name.trim(),
      slug,
      ownerId: req.user._id,
    })
    await OrganizationMember.create({
      organizationId: organization._id,
      userId: req.user._id,
      role: "Owner",
    })
    res.status(201).json({
      id: organization._id.toString(),
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
    })
  } catch (error) {
    next(error)
  }
})

router.post("/switch", async (req, res, next) => {
  try {
    const { organizationId } = req.body
    const membership = await OrganizationMember.findOne({
      organizationId,
      userId: req.user._id,
      status: "Active",
    })
    if (!membership) {
      return res.status(403).json({ message: "Cannot access organization" })
    }
    res.cookie("organizationId", organizationId, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    })
    const org = await Organization.findById(organizationId)
    res.json({
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      role: membership.role,
    })
  } catch (error) {
    next(error)
  }
})

router.patch("/current", requireOrganization, requireRole("Owner", "Admin"), async (req, res, next) => {
  try {
    const { name, plan } = req.body
    if (name) req.organization.name = name.trim()
    if (plan) req.organization.plan = plan
    await req.organization.save()
    res.json({
      id: req.organization._id.toString(),
      name: req.organization.name,
      plan: req.organization.plan,
    })
  } catch (error) {
    next(error)
  }
})

router.get("/members", requireOrganization, async (req, res, next) => {
  try {
    const memberships = await OrganizationMember.find({
      organizationId: req.organization._id,
      status: { $in: ["Active", "Pending"] },
    }).populate("userId")
    const counts = await Project.aggregate([
      { $match: { organizationId: req.organization._id } },
      { $unwind: "$memberIds" },
      { $group: { _id: "$memberIds", count: { $sum: 1 } } },
    ])
    const countMap = Object.fromEntries(
      counts.map((row) => [row._id.toString(), row.count]),
    )
    res.json({
      members: memberships
        .filter((m) => m.userId)
        .map((m) =>
          serializeMember(
            m.userId,
            m,
            countMap[m.userId._id.toString()] || 0,
          ),
        ),
    })
  } catch (error) {
    next(error)
  }
})

router.post("/invitations", requireOrganization, requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const { email, role = "Member" } = req.body
    if (!email?.includes("@")) {
      return res.status(422).json({ message: "Valid email required" })
    }
    const existingUser = await User.findOne({ email: email.toLowerCase() })
    if (existingUser) {
      const existingMember = await OrganizationMember.findOne({
        organizationId: req.organization._id,
        userId: existingUser._id,
      })
      if (existingMember?.status === "Active") {
        return res.status(409).json({ message: "User is already a member" })
      }
      await OrganizationMember.findOneAndUpdate(
        {
          organizationId: req.organization._id,
          userId: existingUser._id,
        },
        { role, status: "Active" },
        { upsert: true },
      )
      return res.status(201).json({ success: true, immediate: true })
    }
    const token = crypto.randomBytes(24).toString("hex")
    await Invitation.create({
      organizationId: req.organization._id,
      email: email.toLowerCase(),
      role,
      token,
      invitedBy: req.user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    res.status(201).json({ success: true, devInviteToken: token })
  } catch (error) {
    next(error)
  }
})

router.patch("/members/:userId", requireOrganization, requireRole("Owner", "Admin"), async (req, res, next) => {
  try {
    const { role } = req.body
    const membership = await OrganizationMember.findOne({
      organizationId: req.organization._id,
      userId: req.params.userId,
    })
    if (!membership) return res.status(404).json({ message: "Member not found" })
    if (membership.role === "Owner" && role !== "Owner") {
      return res.status(403).json({ message: "Cannot change owner role" })
    }
    membership.role = role
    await membership.save()
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.delete("/members/:userId", requireOrganization, requireRole("Owner", "Admin"), async (req, res, next) => {
  try {
    const membership = await OrganizationMember.findOne({
      organizationId: req.organization._id,
      userId: req.params.userId,
    })
    if (!membership) return res.status(404).json({ message: "Member not found" })
    if (membership.role === "Owner") {
      return res.status(403).json({ message: "Cannot remove organization owner" })
    }
    membership.status = "Removed"
    await membership.save()
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export default router
