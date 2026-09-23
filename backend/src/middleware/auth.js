import { verifyAccessToken } from "../utils/tokens.js"
import { User } from "../models/User.js"
import {
  Organization,
  OrganizationMember,
} from "../models/Organization.js"

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization
    const cookieToken = req.cookies?.accessToken
    const token =
      header?.startsWith("Bearer ") ? header.slice(7) : cookieToken
    if (!token) {
      return res.status(401).json({ message: "Authentication required" })
    }
    const payload = verifyAccessToken(token)
    const user = await User.findById(payload.sub)
    if (!user) {
      return res.status(401).json({ message: "Invalid session" })
    }
    req.user = user
    next()
  } catch {
    return res.status(401).json({ message: "Session expired" })
  }
}

export async function requireOrganization(req, res, next) {
  const orgId =
    req.headers["x-organization-id"] || req.cookies?.organizationId
  if (!orgId) {
    return res.status(400).json({ message: "Organization context required" })
  }
  const membership = await OrganizationMember.findOne({
    organizationId: orgId,
    userId: req.user._id,
    status: "Active",
  })
  if (!membership) {
    return res.status(403).json({ message: "Not a member of this organization" })
  }
  const organization = await Organization.findById(orgId)
  if (!organization) {
    return res.status(404).json({ message: "Organization not found" })
  }
  req.organization = organization
  req.membership = membership
  next()
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.membership.role)) {
      return res.status(403).json({ message: "Insufficient permissions" })
    }
    next()
  }
}
