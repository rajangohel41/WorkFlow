import mongoose from "mongoose"
import { env } from "../config/env.js"
import { connectDb } from "./connect.js"
import { User } from "../models/User.js"
import { Organization, OrganizationMember, Invitation } from "../models/Organization.js"
import { Project } from "../models/Project.js"
import { Task } from "../models/Task.js"
import { Comment } from "../models/Comment.js"
import { Activity } from "../models/Activity.js"
import { Notification } from "../models/Notification.js"
import { CalendarEvent } from "../models/CalendarEvent.js"

const args = new Set(process.argv.slice(2).map((arg) => arg.toLowerCase()))

function ensureDevelopmentGuard() {
  if (
    process.env.NODE_ENV === "production" ||
    /prod|atlas|mongodb\.net/i.test(env.mongoUri)
  ) {
    throw new Error("Refusing to clean production data. Cleanup is disabled on production and cloud databases.")
  }
  if (args.has("--dry-run")) return false
  if (!args.has("--confirm") && process.env.WORKFLOW_DEV_CLEANUP !== "1") {
    throw new Error("This is a development-only cleanup. Re-run with --confirm or WORKFLOW_DEV_CLEANUP=1.")
  }
  return true
}

async function collectSeedTargets() {
  const userMatch = {
    $or: [
      { email: /@acme\.io$/i },
      { email: /@example\.test$/i },
      { email: /^(alpha|beta|gamma|temp|target|viewer|owner|test|qa|demo)-/i },
      { name: /^(Alex|Sarah|Rahul|Emily|John|User Alpha|User Beta|User Gamma|Temp User|Target User)/i },
    ],
  }

  const users = await User.find(userMatch).select("_id email name")
  const userIds = users.map((user) => user._id)

  const organizations = await Organization.find({
    $or: [
      { name: /^Acme Technologies$/i },
      { name: /^User's Workspace$/i },
      { name: /^Alpha Org$/i },
      { name: /^Beta Org$/i },
      { name: /^Gamma Org$/i },
      { slug: /^(acme-technologies|user-s-workspace|alpha-org|beta-org|gamma-org)/i },
      { ownerId: { $in: userIds } },
    ],
  }).select("_id ownerId name slug")

  const orgIds = organizations.map((organization) => organization._id)
  const projectIds = (
    await Project.find({
      $or: [
        { organizationId: { $in: orgIds } },
        { name: /^(Website Redesign|Mobile App|Marketing Campaign|Customer Portal|Internal Dashboard|Realtime Collaboration Core)/i },
      ],
    }).select("_id organizationId" )
  ).map((project) => project._id)

  const taskIds = (
    await Task.find({
      $or: [
        { organizationId: { $in: orgIds } },
        { projectId: { $in: projectIds } },
        { title: /^(Redesign authentication screen|Implement API integration|Create dashboard components|Fix mobile navigation drawer|Write unit tests for invoices|Deploy staging environment|Review pull request for push notifications|Test Real-Time Sync Task)/i },
      ],
    }).select("_id organizationId projectId")
  ).map((task) => task._id)

  const invitationIds = (
    await Invitation.find({
      $or: [
        { organizationId: { $in: orgIds } },
        { email: /@acme\.io$/i },
        { email: /@workflow\.io$/i },
      ],
    }).select("_id organizationId")
  ).map((invitation) => invitation._id)

  return {
    userIds,
    orgIds,
    projectIds,
    taskIds,
    invitationIds,
    users,
    organizations,
  }
}

export async function cleanupDevelopmentData({ dryRun = args.has("--dry-run"), confirm = false } = {}) {
  if (
    process.env.NODE_ENV === "production" ||
    /prod|atlas|mongodb\.net/i.test(env.mongoUri)
  ) {
    throw new Error("Refusing to clean production data. Cleanup is disabled on production and cloud databases.")
  }

  await connectDb()
  const targets = await collectSeedTargets()

  const summary = {
    users: targets.userIds.length,
    organizations: targets.orgIds.length,
    projects: targets.projectIds.length,
    tasks: targets.taskIds.length,
    invitations: targets.invitationIds.length,
  }

  console.log("Development cleanup summary:")
  console.log(JSON.stringify(summary, null, 2))
  console.log("Note: taskcounters is intentionally preserved because it powers task display IDs.")

  if (dryRun) {
    console.log("Dry run only; no data was deleted.")
    return summary
  }

  if (!confirm && process.env.WORKFLOW_DEV_CLEANUP !== "1" && !args.has("--confirm")) {
    throw new Error("Cleanup is not confirmed. Re-run with --confirm.")
  }

  await Promise.all([
    User.deleteMany({ _id: { $in: targets.userIds } }),
    OrganizationMember.deleteMany({ organizationId: { $in: targets.orgIds } }),
    Organization.deleteMany({ _id: { $in: targets.orgIds } }),
    Project.deleteMany({ _id: { $in: targets.projectIds } }),
    Task.deleteMany({ _id: { $in: targets.taskIds } }),
    Comment.deleteMany({ taskId: { $in: targets.taskIds } }),
    Activity.deleteMany({ organizationId: { $in: targets.orgIds } }),
    Notification.deleteMany({ organizationId: { $in: targets.orgIds } }),
    Invitation.deleteMany({ _id: { $in: targets.invitationIds } }),
    CalendarEvent.deleteMany({ organizationId: { $in: targets.orgIds } }),
  ])

  console.log("Confirmed development-only cleanup completed without removing the required taskcounters collection.")
  return summary
}

if (process.argv[1] && process.argv[1].endsWith("cleanup.js")) {
  const dryRun = args.has("--dry-run")
  const confirm = args.has("--confirm") || process.env.WORKFLOW_DEV_CLEANUP === "1"
  cleanupDevelopmentData({ dryRun, confirm })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
}
