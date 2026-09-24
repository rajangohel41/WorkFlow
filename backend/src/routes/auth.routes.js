import { Router } from "express"
import { User, hashPassword } from "../models/User.js"
import {
  Organization,
  OrganizationMember,
} from "../models/Organization.js"
import {
  randomCode,
  randomToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/tokens.js"
import { slugify } from "../utils/helpers.js"
import { requireAuth } from "../middleware/auth.js"
import { serializeUser } from "../services/serializers.js"

const router = Router()

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
}

function setAuthCookies(res, userId, tokenVersion = 0) {
  const accessToken = signAccessToken(userId, tokenVersion)
  const refreshToken = signRefreshToken(userId, tokenVersion)
  res.cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 })
  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password || password.length < 8) {
      return res.status(422).json({ message: "Invalid registration data" })
    }
    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) {
      return res.status(409).json({ message: "Email already registered" })
    }
    const verificationCode = randomCode()
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      verificationCode,
      verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      tokenVersion: 0,
    })
    setAuthCookies(res, user._id.toString(), user.tokenVersion)
    res.status(201).json({
      user: serializeUser(user),
      verificationRequired: true,
      devVerificationCode: verificationCode,
    })
  } catch (error) {
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
    setAuthCookies(res, user._id.toString(), user.tokenVersion || 0)
    res.json({ user: serializeUser(user) })
  } catch (error) {
    next(error)
  }
})

router.post("/logout", (_req, res) => {
  res.clearCookie("accessToken", cookieOptions)
  res.clearCookie("refreshToken", cookieOptions)
  res.clearCookie("organizationId", cookieOptions)
  res.json({ success: true })
})

router.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } })
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
    const token = req.cookies?.refreshToken
    if (!token) return res.status(401).json({ message: "Refresh required" })
    const payload = verifyRefreshToken(token)
    const user = await User.findById(payload.sub)
    if (!user) return res.status(401).json({ message: "Invalid session" })
    if (payload.v !== undefined && user.tokenVersion !== undefined && payload.v < user.tokenVersion) {
      res.clearCookie("accessToken", cookieOptions)
      res.clearCookie("refreshToken", cookieOptions)
      return res.status(401).json({ message: "Session revoked" })
    }
    setAuthCookies(res, user._id.toString(), user.tokenVersion || 0)
    res.json({ success: true })
  } catch {
    res.status(401).json({ message: "Refresh failed" })
  }
})

router.post("/verify-email", requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body
    const user = await User.findById(req.user._id).select(
      "+verificationCode +verificationExpires",
    )
    if (
      !user.verificationCode ||
      user.verificationCode !== code ||
      user.verificationExpires < new Date()
    ) {
      return res.status(422).json({ message: "Invalid verification code" })
    }
    user.emailVerified = true
    user.verificationCode = undefined
    user.verificationExpires = undefined
    await user.save()
    res.json({ user: serializeUser(user) })
  } catch (error) {
    next(error)
  }
})

router.post("/resend-verification", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      "+verificationCode +verificationExpires",
    )
    user.verificationCode = randomCode()
    user.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await user.save()
    res.json({ success: true, devVerificationCode: user.verificationCode })
  } catch (error) {
    next(error)
  }
})

router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body
    const user = await User.findOne({ email: email?.toLowerCase() }).select(
      "+resetToken +resetExpires",
    )
    if (user) {
      user.resetToken = randomToken()
      user.resetExpires = new Date(Date.now() + 60 * 60 * 1000)
      await user.save()
      res.json({
        success: true,
        devResetToken: user.resetToken,
      })
      return
    }
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password } = req.body
    if (!password || password.length < 8) {
      return res.status(422).json({ message: "Password must be at least 8 characters" })
    }
    const user = await User.findOne({
      resetToken: token,
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
    if (!newPassword || newPassword.length < 8) {
      return res.status(422).json({ message: "Password must be at least 8 characters" })
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
