import { Router } from "express"
import crypto from "node:crypto"
import { User, hashPassword } from "../models/User.js"
import {
  Organization,
  OrganizationMember,
} from "../models/Organization.js"
import {
  randomToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../utils/tokens.js"
import { isStrongPassword, slugify } from "../utils/helpers.js"
import { requireAuth } from "../middleware/auth.js"
import { serializeUser } from "../services/serializers.js"
import { emailService } from "../services/emailService.js"
import { verifyGoogleIdToken } from "../services/googleAuth.js"
import { env, cookieOptions } from "../config/env.js"

const router = Router()

function setAuthCookies(res, userId, tokenVersion = 0) {
  const accessToken = signAccessToken(userId, tokenVersion)
  const refreshToken = signRefreshToken(userId, tokenVersion)
  res.cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 })
  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
  return { accessToken, refreshToken }
}

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password || !isStrongPassword(password)) {
      return res.status(422).json({
        message:
          "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.",
      })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(422).json({ message: "A valid email address is required" })
    }

    const existing = await User.findOne({ email: normalizedEmail })
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists." })
    }

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      tokenVersion: 0,
    })

    let organization
    try {
      const baseName = `${user.name.split(" ")[0] || "My"}'s Workspace`
      let slug = slugify(baseName) || "workspace"
      const existingOrg = await Organization.findOne({ slug })
      if (existingOrg) slug = `${slug}-${Date.now()}`
      organization = await Organization.create({
        name: baseName,
        slug,
        ownerId: user._id,
      })
      await OrganizationMember.create({
        organizationId: organization._id,
        userId: user._id,
        role: "Owner",
        status: "Active",
      })
      res.cookie("organizationId", organization._id.toString(), {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      })
    } catch (orgError) {
      await User.findByIdAndDelete(user._id)
      throw orgError
    }

    const { accessToken, refreshToken } = setAuthCookies(res, user._id.toString(), user.tokenVersion)
    res.status(201).json({
      user: serializeUser(user),
      organization: {
        id: organization._id.toString(),
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
      },
      accessToken,
      refreshToken,
    })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists." })
    }
    next(error)
  }
})

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return res.status(401).json({ message: "Invalid email or password" })
    }
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+passwordHash",
    )
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" })
    }
    const { accessToken, refreshToken } = setAuthCookies(res, user._id.toString(), user.tokenVersion || 0)
    res.json({
      user: serializeUser(user),
      accessToken,
      refreshToken,
    })
  } catch (error) {
    next(error)
  }
})

router.post("/google", async (req, res, next) => {
  try {
    const { idToken, password } = req.body
    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({ message: "Google ID token is required" })
    }

    const payload = await verifyGoogleIdToken(idToken)
    const normalizedEmail = payload.email.toLowerCase().trim()
    const googleId = String(payload.sub)

    // Check if user exists by email or googleId
    let user = await User.findOne({
      $or: [{ email: normalizedEmail }, { googleId }],
    }).select("+passwordHash")

    if (user) {
      // 1. Google account is already linked to this user
      if (user.googleId) {
        if (user.googleId === googleId) {
          if (!user.avatarUrl && payload.picture) {
            user.avatarUrl = payload.picture
            await user.save()
          }
          const { accessToken, refreshToken } = setAuthCookies(
            res,
            user._id.toString(),
            user.tokenVersion || 0,
          )
          return res.json({
            user: serializeUser(user),
            accessToken,
            refreshToken,
          })
        } else {
          return res.status(409).json({
            message: "This email address is already linked to a different Google account.",
          })
        }
      }

      // 2. User exists by email, but googleId is not linked (password account exists)
      // Secure account linking requirement: Never silently take over existing account!
      if (!password) {
        return res.status(409).json({
          linkRequired: true,
          email: user.email,
          message:
            "An account with this email already exists. Enter your password to link your Google account.",
        })
      }

      const passwordValid = await user.comparePassword(password)
      if (!passwordValid) {
        return res.status(401).json({
          linkRequired: true,
          message: "Incorrect password for existing account.",
        })
      }

      // Explicit password verified: link Google account
      user.googleId = googleId
      if (!user.avatarUrl && payload.picture) {
        user.avatarUrl = payload.picture
      }
      await user.save()

      const { accessToken, refreshToken } = setAuthCookies(
        res,
        user._id.toString(),
        user.tokenVersion || 0,
      )
      return res.json({
        user: serializeUser(user),
        accessToken,
        refreshToken,
        linked: true,
      })
    }

    // 3. New Google user registration
    const name = payload.name?.trim() || "Google User"
    user = await User.create({
      name,
      email: normalizedEmail,
      googleId,
      avatarUrl: payload.picture || "",
      tokenVersion: 0,
    })

    const { accessToken, refreshToken } = setAuthCookies(
      res,
      user._id.toString(),
      user.tokenVersion || 0,
    )

    return res.status(201).json({
      user: serializeUser(user),
      isNewUser: true,
      accessToken,
      refreshToken,
    })
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message })
    }
    next(error)
  }
})

router.post("/google/link", requireAuth, async (req, res, next) => {
  try {
    const { idToken } = req.body
    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({ message: "Google ID token is required" })
    }

    const payload = await verifyGoogleIdToken(idToken)
    const googleId = String(payload.sub)

    const existingOther = await User.findOne({
      googleId,
      _id: { $ne: req.user._id },
    })
    if (existingOther) {
      return res.status(409).json({
        message: "This Google account is already linked to another WorkFlow account.",
      })
    }

    const user = await User.findById(req.user._id)
    user.googleId = googleId
    if (!user.avatarUrl && payload.picture) {
      user.avatarUrl = payload.picture
    }
    await user.save()

    res.json({
      success: true,
      message: "Google account successfully linked",
      user: serializeUser(user),
    })
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message })
    }
    next(error)
  }
})

router.post("/logout", async (req, res) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.headers.authorization?.replace("Bearer ", "")
    let userId = null

    if (token) {
      try {
        const payload = verifyAccessToken(token)
        if (payload?.sub) userId = payload.sub
      } catch {}
    }

    if (!userId) {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken
      if (refreshToken) {
        try {
          const refreshPayload = verifyRefreshToken(refreshToken)
          if (refreshPayload?.sub) userId = refreshPayload.sub
        } catch {}
      }
    }

    if (userId) {
      await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } })
      const io = req.app.get("io")
      if (io) {
        const userRoom = io.sockets.adapter.rooms.get(`user:${userId.toString()}`)
        if (userRoom) {
          for (const socketId of Array.from(userRoom)) {
            const s = io.sockets.sockets.get(socketId)
            if (s) s.disconnect(true)
          }
        }
      }
    }
  } catch (err) {
    console.warn("Logout session invalidation notice:", err)
  }
  res.clearCookie("accessToken", cookieOptions)
  res.clearCookie("refreshToken", cookieOptions)
  res.clearCookie("organizationId", cookieOptions)
  res.json({ success: true })
})

router.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } })
    const io = req.app.get("io")
    if (io) {
      const userRoom = io.sockets.adapter.rooms.get(`user:${req.user._id.toString()}`)
      if (userRoom) {
        for (const socketId of Array.from(userRoom)) {
          const s = io.sockets.sockets.get(socketId)
          if (s) s.disconnect(true)
        }
      }
    }
    res.clearCookie("accessToken", cookieOptions)
    res.clearCookie("refreshToken", cookieOptions)
    res.clearCookie("organizationId", cookieOptions)
    res.json({ success: true, message: "All sessions revoked" })
  } catch (error) {
    next(error)
  }
})

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const memberships = await OrganizationMember.find({
      userId: req.user._id,
      status: "Active",
    }).populate("organizationId")
    const organizations = memberships.map((m) => ({
      id: m.organizationId._id.toString(),
      name: m.organizationId.name,
      slug: m.organizationId.slug,
      role: m.role,
      plan: m.organizationId.plan,
    }))
    res.json({
      user: serializeUser(req.user),
      organizations,
    })
  } catch (error) {
    next(error)
  }
})

router.post("/refresh", async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken
    if (!token) return res.status(401).json({ message: "Refresh required" })
    const payload = verifyRefreshToken(token)
    const user = await User.findById(payload.sub)
    if (!user) return res.status(401).json({ message: "Invalid session" })
    if (payload.v !== undefined && user.tokenVersion !== undefined && payload.v < user.tokenVersion) {
      res.clearCookie("accessToken", cookieOptions)
      res.clearCookie("refreshToken", cookieOptions)
      return res.status(401).json({ message: "Session revoked" })
    }
    const { accessToken, refreshToken } = setAuthCookies(res, user._id.toString(), user.tokenVersion || 0)
    res.json({ success: true, accessToken, refreshToken })
  } catch {
    res.status(401).json({ message: "Refresh failed" })
  }
})


function isRecoveryAllowed(req) {
  if (req && process.env.NODE_ENV === "test" && req.headers["x-test-disable-recovery"] === "true") {
    return false
  }
  if (env.enablePasswordRecovery) return true
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_PASSWORD_RECOVERY === "false") {
    return false
  }
  return process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development"
}

const RECOVERY_DISABLED_MESSAGE =
  "Self-service password recovery is unavailable because automated email delivery is not configured. If you are signed in, you can update your password under Settings > Security. Otherwise, contact system support."

const GENERIC_RECOVERY_SUCCESS_MESSAGE =
  "If an account matches that email address, password reset instructions have been sent."

router.post("/forgot-password", async (req, res, next) => {
  try {
    if (!isRecoveryAllowed(req)) {
      return res.status(403).json({ message: RECOVERY_DISABLED_MESSAGE })
    }
    const { email } = req.body
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Valid email is required" })
    }
    const normalizedEmail = email.toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+resetToken +resetExpires",
    )
    const isDev =
      (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") &&
      process.env.NODE_ENV !== "production"

    let rawToken = null
    if (user) {
      rawToken = randomToken()
      user.resetToken = crypto.createHash("sha256").update(rawToken).digest("hex")
      user.resetExpires = new Date(Date.now() + 60 * 60 * 1000)
      await user.save()

      // Dispatch password reset email via Resend
      await emailService.sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetToken: rawToken,
      })
    }

    return res.json({
      success: true,
      message: GENERIC_RECOVERY_SUCCESS_MESSAGE,
      ...(isDev && rawToken && { devResetToken: rawToken }),
    })
  } catch (error) {
    next(error)
  }
})

router.post("/reset-password", async (req, res, next) => {
  try {
    if (!isRecoveryAllowed(req)) {
      return res.status(403).json({ message: RECOVERY_DISABLED_MESSAGE })
    }
    const { token, password } = req.body
    if (!token || typeof token !== "string") {
      return res.status(422).json({ message: "Reset token is required" })
    }
    if (!isStrongPassword(password)) {
      return res.status(422).json({
        message:
          "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.",
      })
    }
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex")
    const user = await User.findOne({
      resetToken: hashedToken,
      resetExpires: { $gt: new Date() },
    }).select("+resetToken +resetExpires +passwordHash")
    if (!user) {
      return res.status(422).json({ message: "Invalid or expired reset token" })
    }
    user.passwordHash = await hashPassword(password)
    user.resetToken = undefined
    user.resetExpires = undefined
    user.tokenVersion = (user.tokenVersion || 0) + 1
    await user.save()

    // Sever all active sockets across devices
    const io = req.app.get("io")
    if (io) {
      const userRoom = io.sockets.adapter.rooms.get(`user:${user._id.toString()}`)
      if (userRoom) {
        for (const socketId of Array.from(userRoom)) {
          const s = io.sockets.sockets.get(socketId)
          if (s) s.disconnect(true)
        }
      }
    }

    setAuthCookies(res, user._id.toString(), user.tokenVersion)
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body
    const user = await User.findById(req.user._id).select("+passwordHash")
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(403).json({ message: "Current password is incorrect" })
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(422).json({
        message:
          "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.",
      })
    }
    user.passwordHash = await hashPassword(newPassword)
    user.tokenVersion = (user.tokenVersion || 0) + 1
    await user.save()
    setAuthCookies(res, user._id.toString(), user.tokenVersion)
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.post("/onboarding", requireAuth, async (req, res, next) => {
  try {
    const { workspaceName, workspaceSlug, invites = [] } = req.body
    const name = workspaceName || `${req.user.name.split(" ")[0]}'s Workspace`
    let slug = slugify(workspaceSlug || name)
    const existing = await Organization.findOne({ slug })
    if (existing) slug = `${slug}-${Date.now()}`
    const organization = await Organization.create({
      name,
      slug,
      ownerId: req.user._id,
    })
    await OrganizationMember.create({
      organizationId: organization._id,
      userId: req.user._id,
      role: "Owner",
    })
    res.cookie("organizationId", organization._id.toString(), {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    })
    res.status(201).json({
      organization: {
        id: organization._id.toString(),
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
      },
      invitesQueued: invites.length,
    })
  } catch (error) {
    next(error)
  }
})

export default router
