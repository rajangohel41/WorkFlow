import { Router } from "express"
import crypto from "node:crypto"
import mongoose from "mongoose"
import {
  Organization,
  OrganizationMember,
  Invitation,
} from "../models/Organization.js"
import { User } from "../models/User.js"
import { Project } from "../models/Project.js"
import { Activity } from "../models/Activity.js"
import { requireAuth, requireOrganization, requireRole } from "../middleware/auth.js"

import { slugify } from "../utils/helpers.js"
import { serializeMember } from "../services/serializers.js"
import { createNotification, emitOrgEvent } from "../services/notify.js"

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
    const { name, slug, defaultView, plan } = req.body
    if (name) req.organization.name = name.trim()
    if (plan) req.organization.plan = plan
    if (defaultView && ["board", "list", "timeline", "calendar"].includes(defaultView)) {
      req.organization.defaultView = defaultView
    }
    if (slug) {
      const cleanSlug = slugify(slug)
      if (cleanSlug && cleanSlug !== req.organization.slug) {
        const existing = await Organization.findOne({
          slug: cleanSlug,
          _id: { $ne: req.organization._id },
        })
        if (existing) {
          return res.status(409).json({ message: "Workspace URL slug is already taken" })
        }
        req.organization.slug = cleanSlug
      }
    }
    await req.organization.save()
    res.json({
      id: req.organization._id.toString(),
      name: req.organization.name,
      slug: req.organization.slug,
      defaultView: req.organization.defaultView,
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

    const activeMembers = memberships
      .filter((m) => m.userId)
      .map((m) =>
        serializeMember(
          m.userId,
          m,
          countMap[m.userId._id.toString()] || 0,
        ),
      )

    // Also include pending unaccepted invitations
    const pendingInvites = await Invitation.find({
      organizationId: req.organization._id,
      status: "pending",
      expiresAt: { $gt: new Date() },
    }).lean()

    const inviteMembers = pendingInvites.map((inv) => ({
      id: `invite-${inv._id.toString()}`,
      _id: inv._id.toString(),
      name: inv.email.split("@")[0],
      email: inv.email,
      initials: inv.email.slice(0, 2).toUpperCase(),
      role: inv.role,
      color: "#94A3B8",
      status: "Pending",
      projects: 0,
      last: "Invitation sent",
      invitationToken: inv.token,
      isInvitation: true,
    }))

    res.json({
      members: [...activeMembers, ...inviteMembers],
    })
  } catch (error) {
    next(error)
  }
})

router.get("/invitations/mine", async (req, res, next) => {
  try {
    const invitations = await Invitation.find({
      email: req.user.email.toLowerCase().trim(),
      status: "pending",
      expiresAt: { $gt: new Date() },
    }).populate("organizationId", "name slug").populate("invitedBy", "name email").sort({ createdAt: -1 }).lean()
    res.json({
      invitations: invitations.map((invitation) => ({
        id: invitation._id.toString(),
        token: invitation.token,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        organization: invitation.organizationId
          ? { id: invitation.organizationId._id.toString(), name: invitation.organizationId.name, slug: invitation.organizationId.slug }
          : null,
        invitedBy: invitation.invitedBy
          ? { id: invitation.invitedBy._id.toString(), name: invitation.invitedBy.name, email: invitation.invitedBy.email }
          : null,
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.post("/invitations", requireOrganization, requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const { email, role = "Member", immediate } = req.body
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(422).json({ message: "Valid email required" })
    }
    const validRoles = ["Admin", "Manager", "Member", "Viewer"]
    if (!validRoles.includes(role)) {
      return res.status(422).json({ message: "Invalid role specified" })
    }
    // Only Owner can invite Admins
    if (role === "Admin" && req.membership.role !== "Owner") {
      return res.status(403).json({ message: "Only Owner can invite Admins" })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const existingUser = await User.findOne({ email: normalizedEmail })

    if (existingUser) {
      const existingMember = await OrganizationMember.findOne({
        organizationId: req.organization._id,
        userId: existingUser._id,
      })
      if (existingMember?.status === "Active") {
        return res.status(409).json({ message: "User is already a member" })
      }

      if (immediate) {
        await OrganizationMember.findOneAndUpdate(
          {
            organizationId: req.organization._id,
            userId: existingUser._id,
          },
          { role, status: "Active" },
          { upsert: true, new: true },
        )

        const io = req.app.get("io")
        emitOrgEvent(io, req.organization._id.toString(), "member.added", {
          userId: existingUser._id.toString(),
          role,
        })

        await createNotification(io, {
          organizationId: req.organization._id,
          userId: existingUser._id,
          actorId: req.user._id,
          title: `You were added to ${req.organization.name}`,
          message: `${req.user.name} added you as ${role}`,
          meta: `${req.user.name} added you as ${role} · Just now`,
          entityType: "member",
          entityId: req.organization._id,
        })

        return res.status(201).json({ success: true, immediate: true })
      }
    }

    const isDev = process.env.NODE_ENV !== "production"
    // Check existing pending invitation
    const existingInvite = await Invitation.findOne({
      organizationId: req.organization._id,
      email: normalizedEmail,
      status: "pending",
      expiresAt: { $gt: new Date() },
    })
    if (existingInvite) {
      return res.status(409).json({
        message: "Invitation already pending for this email",
        ...(isDev ? { devInviteToken: existingInvite.token } : {}),
      })
    }

    const token = crypto.randomBytes(24).toString("hex")
    const invitation = await Invitation.create({
      organizationId: req.organization._id,
      email: normalizedEmail,
      role,
      token,
      invitedBy: req.user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })

    const activity = await Activity.create({
      organizationId: req.organization._id,
      actorId: req.user._id,
      text: "invited",
      target: normalizedEmail,
    })

    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "invitation.created", {
      email: normalizedEmail,
      role,
      token,
    })
    emitOrgEvent(io, req.organization._id.toString(), "member.added", {
      email: normalizedEmail,
      role,
      status: "Pending",
    })
    emitOrgEvent(io, req.organization._id.toString(), "activity.created", {
      id: activity._id.toString(),
      text: "invited",
      target: normalizedEmail,
    })

    // If user already has an account, notify them of the invitation
    if (existingUser) {
      await createNotification(io, {
        organizationId: req.organization._id,
        userId: existingUser._id,
        actorId: req.user._id,
        title: `You were invited to join ${req.organization.name}`,
        message: `${req.user.name} invited you to join as ${role}`,
        meta: `${req.user.name} invited you as ${role} · Just now`,
        entityType: "invitation",
        entityId: invitation._id,
        requireActiveMembership: false,
      })
    }

    res.status(201).json({
      success: true,
      invitation: {
        token,
        email: normalizedEmail,
        role,
        expiresAt: invitation.expiresAt,
      },
      ...(isDev ? { devInviteToken: token } : {}),
    })
  } catch (error) {
    next(error)
  }
})

router.post("/invitations/:token/reject", requireAuth, async (req, res, next) => {
  try {
    const invitation = await Invitation.findOne({ token: req.params.token })
    if (!invitation) return res.status(404).json({ message: "Invitation not found" })
    if (invitation.status !== "pending") return res.status(410).json({ message: "Invitation is no longer pending" })
    if (invitation.expiresAt < new Date()) return res.status(410).json({ message: "Invitation has expired" })
    if (req.user.email.toLowerCase().trim() !== invitation.email) {
      return res.status(403).json({ message: "This invitation was sent to a different email address" })
    }
    invitation.status = "rejected"
    invitation.rejectedAt = new Date()
    await invitation.save()
    const activity = await Activity.create({
      organizationId: invitation.organizationId,
      actorId: req.user._id,
      text: "rejected the invitation for",
      target: invitation.email,
    })
    const io = req.app.get("io")
    emitOrgEvent(io, invitation.organizationId.toString(), "invitation.rejected", { email: invitation.email })
    emitOrgEvent(io, invitation.organizationId.toString(), "activity.created", { id: activity._id.toString(), text: activity.text, target: activity.target, projectId: null })
    if (invitation.invitedBy) {
      const org = await Organization.findById(invitation.organizationId).select("name")
      await createNotification(io, {
        organizationId: invitation.organizationId,
        userId: invitation.invitedBy,
        actorId: req.user._id,
        title: `${req.user.name} declined your invitation`,
        message: `${req.user.name} declined the invitation to ${org?.name || "your workspace"}`,
        entityType: "member",
        entityId: req.user._id,
      })
    }
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

// Resend invitation
router.post("/invitations/:token/resend", requireOrganization, requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const { token } = req.params
    const invitation = await Invitation.findOne({
      token,
      organizationId: req.organization._id,
    })
    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" })
    }
    if (invitation.acceptedAt) {
      return res.status(400).json({ message: "Invitation has already been accepted" })
    }
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await invitation.save()

    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "invitation.created", {
      email: invitation.email,
      role: invitation.role,
      token: invitation.token,
    })

    res.json({ success: true, devInviteToken: invitation.token })
  } catch (error) {
    next(error)
  }
})

// Revoke/cancel invitation
router.delete("/invitations/:token", requireOrganization, requireRole("Owner", "Admin", "Manager"), async (req, res, next) => {
  try {
    const { token } = req.params
    const invitation = await Invitation.findOne({
      token,
      organizationId: req.organization._id,
    })
    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" })
    }
    invitation.status = "cancelled"
    await invitation.save()

    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "member.removed", {
      email: invitation.email,
      status: "Removed",
    })

    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

// SECURITY FIX: verify the authenticated user's email matches the invitation email
router.post("/invitations/:token/accept", requireAuth, async (req, res, next) => {
  try {
    const { token } = req.params
    const invitation = await Invitation.findOne({ token })
    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" })
    }
    if (invitation.status !== "pending") {
      return res.status(410).json({ message: `Invitation is ${invitation.status}` })
    }
    if (invitation.expiresAt < new Date()) {
      invitation.status = "expired"
      await invitation.save()
      return res.status(410).json({ message: "Invitation has expired" })
    }


    // SECURITY: Ensure the authenticated user's email matches the invitation
    if (req.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({
        message: "This invitation was sent to a different email address",
      })
    }

    // Prevent duplicate memberships
    const existingActive = await OrganizationMember.findOne({
      organizationId: invitation.organizationId,
      userId: req.user._id,
      status: "Active",
    })
    if (existingActive) {
      // Already a member – mark invitation accepted and return success
      invitation.acceptedAt = new Date()
      invitation.status = "accepted"
      await invitation.save()
      const org = await Organization.findById(invitation.organizationId)
      return res.json({
        success: true,
        organization: {
          id: org._id.toString(),
          name: org.name,
          slug: org.slug,
          role: existingActive.role,
        },
      })
    }

    await OrganizationMember.findOneAndUpdate(
      {
        organizationId: invitation.organizationId,
        userId: req.user._id,
      },
      {
        role: invitation.role,
        status: "Active",
      },
      { upsert: true, new: true },
    )
    invitation.acceptedAt = new Date()
    invitation.status = "accepted"
    await invitation.save()

    const org = await Organization.findById(invitation.organizationId)

    const activity = await Activity.create({
      organizationId: invitation.organizationId,
      actorId: req.user._id,
      text: "joined the workspace as",
      target: invitation.role,
    })

    // Emit socket event so org members see the new member immediately
    const io = req.app.get("io")
    emitOrgEvent(io, invitation.organizationId.toString(), "member.added", {
      userId: req.user._id.toString(),
      role: invitation.role,
    })
    emitOrgEvent(io, invitation.organizationId.toString(), "invitation.accepted", {
      userId: req.user._id.toString(),
      role: invitation.role,
      email: req.user.email,
    })
    emitOrgEvent(io, invitation.organizationId.toString(), "activity.created", {
      id: activity._id.toString(),
      text: "joined the workspace as",
      target: invitation.role,
    })

    // Notify the inviter that the invitation was accepted
    if (invitation.invitedBy) {
      await createNotification(io, {
        organizationId: invitation.organizationId,
        userId: invitation.invitedBy,
        actorId: req.user._id,
        title: `${req.user.name} accepted your invitation`,
        message: `${req.user.name} joined ${org.name} as ${invitation.role}`,
        meta: `They joined ${org.name} as ${invitation.role} · Just now`,
        entityType: "member",
        entityId: req.user._id,
      })
    }

    res.cookie("organizationId", org._id.toString(), {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    })
    res.json({
      success: true,
      organization: {
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        role: invitation.role,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.patch("/members/:userId", requireOrganization, requireRole("Owner", "Admin"), async (req, res, next) => {
  try {
    const { role } = req.body
    const validRoles = ["Owner", "Admin", "Manager", "Member", "Viewer"]
    if (!validRoles.includes(role)) {
      return res.status(422).json({ message: "Invalid role specified" })
    }
    // BUGFIX: mongoose was not imported — now it is
    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ message: "Invalid user ID" })
    }

    const membership = await OrganizationMember.findOne({
      organizationId: req.organization._id,
      userId: req.params.userId,
    })
    if (!membership) return res.status(404).json({ message: "Member not found" })

    // Only Owner can assign or transfer the Owner role
    if (role === "Owner" && req.membership.role !== "Owner") {
      return res.status(403).json({ message: "Only the organization owner can assign the owner role" })
    }
    // Demoting Owner is forbidden unless caller is Owner
    if (membership.role === "Owner" && role !== "Owner") {
      return res.status(403).json({ message: "Cannot change owner role" })
    }
    // Admin cannot change another Admin's role
    if (
      membership.role === "Admin" &&
      req.membership.role !== "Owner" &&
      membership.userId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "Only the Owner can modify another Admin's role" })
    }

    const prevRole = membership.role
    membership.role = role
    await membership.save()

    const targetUser = await User.findById(membership.userId)

    const activity = await Activity.create({
      organizationId: req.organization._id,
      actorId: req.user._id,
      text: "changed role to",
      target: `${targetUser?.name || "member"} (${role})`,
    })

    // Emit socket event so all org members refresh the team list
    const io = req.app.get("io")
    emitOrgEvent(io, req.organization._id.toString(), "member.updated", {
      userId: req.params.userId,
      role,
    })
    emitOrgEvent(io, req.organization._id.toString(), "activity.created", {
      id: activity._id.toString(),
      text: "changed role to",
      target: `${targetUser?.name || "member"} (${role})`,
    })

    // Notify the affected member
    await createNotification(io, {
      organizationId: req.organization._id,
      userId: membership.userId,
      actorId: req.user._id,
      title: `Your role was changed to ${role}`,
      message: `${req.user.name} updated your role from ${prevRole} to ${role}`,
      meta: `${req.user.name} updated your role from ${prevRole} · Just now`,
      entityType: "member",
      entityId: req.organization._id,
    })

    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.delete("/members/:userId", requireOrganization, requireRole("Owner", "Admin"), async (req, res, next) => {
  try {
    // BUGFIX: mongoose was not imported — now it is
    if (!mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ message: "Invalid user ID" })
    }
    const membership = await OrganizationMember.findOne({
      organizationId: req.organization._id,
      userId: req.params.userId,
    })
    if (!membership) return res.status(404).json({ message: "Member not found" })
    if (membership.role === "Owner") {
      return res.status(403).json({ message: "Cannot remove organization owner" })
    }
    // Admin cannot remove another Admin
    if (membership.role === "Admin" && req.membership.role !== "Owner") {
      return res.status(403).json({ message: "Only the Owner can remove an Admin" })
    }
    membership.status = "Removed"
    await membership.save()

    const targetUser = await User.findById(membership.userId)

    const activity = await Activity.create({
      organizationId: req.organization._id,
      actorId: req.user._id,
      text: "removed from workspace",
      target: targetUser?.name || "member",
    })

    // Emit socket event so all org members refresh the team list
    const io = req.app.get("io")
    if (io) {
      const userRoom = io.sockets.adapter.rooms.get(`user:${membership.userId.toString()}`)
      if (userRoom) {
        for (const socketId of Array.from(userRoom)) {
          const s = io.sockets.sockets.get(socketId)
          if (s) {
            s.leave(`org:${req.organization._id.toString()}`)
            s.emit("membership.revoked", { organizationId: req.organization._id.toString() })
          }
        }
      }
    }
    emitOrgEvent(io, req.organization._id.toString(), "member.removed", {
      userId: req.params.userId,
    })
    emitOrgEvent(io, req.organization._id.toString(), "activity.created", {
      id: activity._id.toString(),
      text: "removed from workspace",
      target: targetUser?.name || "member",
    })

    // Notify the removed member
    await createNotification(io, {
      organizationId: req.organization._id,
      userId: membership.userId,
      actorId: req.user._id,
      title: `You were removed from ${req.organization.name}`,
      message: `${req.user.name} removed you from ${req.organization.name}`,
      meta: `${req.user.name} removed you from the workspace · Just now`,
      entityType: "member",
      entityId: req.organization._id,
    })

    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})


export default router
