import assert from "node:assert/strict"
import mongoose from "mongoose"
import { env } from "../src/config/env.js"
import { connectDb } from "../src/db/connect.js"
import { User, hashPassword } from "../src/models/User.js"
import { Organization, OrganizationMember, Invitation } from "../src/models/Organization.js"
import { Project } from "../src/models/Project.js"
import { Task } from "../src/models/Task.js"
import { Comment } from "../src/models/Comment.js"
import { Notification } from "../src/models/Notification.js"
import { Activity } from "../src/models/Activity.js"

async function run() {
  const uri = env.mongoUri
  console.log(`Running persistence proof against ${uri}`)

  await connectDb()

  const suffix = Date.now()
  const owner = await User.create({
    name: `Persistence Owner ${suffix}`,
    email: `persist-owner-${suffix}@example.test`,
    passwordHash: await hashPassword("StrongPassword123!"),
  })

  const organization = await Organization.create({
    name: `Persistence Org ${suffix}`,
    slug: `persistence-org-${suffix}`,
    ownerId: owner._id,
  })

  await OrganizationMember.create({
    organizationId: organization._id,
    userId: owner._id,
    role: "Owner",
    status: "Active",
  })

  const project = await Project.create({
    organizationId: organization._id,
    name: `Persistence Project ${suffix}`,
    slug: `persistence-project-${suffix}`,
    description: "Project created to verify MongoDB write/read-back behavior.",
    status: "Planning",
    memberIds: [owner._id],
  })

  const task = await Task.create({
    organizationId: organization._id,
    projectId: project._id,
    displayId: `WF-${suffix}`,
    title: `Persistence Task ${suffix}`,
    description: "Task created to verify MongoDB read-back behavior.",
    status: "Todo",
    priority: "High",
    createdBy: owner._id,
  })

  const comment = await Comment.create({
    taskId: task._id,
    projectId: project._id,
    organizationId: organization._id,
    authorId: owner._id,
    text: `Persistence comment ${suffix}`,
  })

  const notification = await Notification.create({
    organizationId: organization._id,
    userId: owner._id,
    title: `Persistence notification ${suffix}`,
    message: "MongoDB persistence verification",
    entityType: "task",
    entityId: task._id,
  })

  const invitation = await Invitation.create({
    organizationId: organization._id,
    email: `invite-${suffix}@example.test`,
    role: "Member",
    token: `inv-${suffix}`,
    inviterId: owner._id,
    invitedBy: owner._id,
    status: "pending",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })

  const activity = await Activity.create({
    organizationId: organization._id,
    projectId: project._id,
    taskId: task._id,
    actorId: owner._id,
    text: "created a new task",
    target: task.title,
  })

  const storedUser = await mongoose.connection.collection("users").findOne({ _id: owner._id })
  const storedOrganization = await mongoose.connection.collection("organizations").findOne({ _id: organization._id })
  const storedMembership = await mongoose.connection.collection("organizationmembers").findOne({ organizationId: organization._id, userId: owner._id })
  const storedProject = await mongoose.connection.collection("projects").findOne({ _id: project._id })
  const storedTask = await mongoose.connection.collection("tasks").findOne({ _id: task._id })
  const storedComment = await mongoose.connection.collection("comments").findOne({ _id: comment._id })
  const storedNotification = await mongoose.connection.collection("notifications").findOne({ _id: notification._id })
  const storedInvitation = await mongoose.connection.collection("invitations").findOne({ _id: invitation._id })
  const storedActivity = await mongoose.connection.collection("activities").findOne({ _id: activity._id })

  assert.ok(storedUser, "User document missing from MongoDB")
  assert.ok(storedOrganization, "Organization document missing from MongoDB")
  assert.ok(storedMembership, "OrganizationMember document missing from MongoDB")
  assert.ok(storedProject, "Project document missing from MongoDB")
  assert.ok(storedTask, "Task document missing from MongoDB")
  assert.ok(storedComment, "Comment document missing from MongoDB")
  assert.ok(storedNotification, "Notification document missing from MongoDB")
  assert.ok(storedInvitation, "Invitation document missing from MongoDB")
  assert.ok(storedActivity, "Activity document missing from MongoDB")

  assert.equal(storedUser.email, owner.email)
  assert.equal(storedOrganization.slug, organization.slug)
  assert.equal(storedProject.name, project.name)
  assert.equal(storedTask.title, task.title)
  assert.equal(storedComment.text, comment.text)
  assert.equal(storedNotification.title, notification.title)
  assert.equal(storedInvitation.email, invitation.email)
  assert.equal(storedActivity.target, activity.target)

  await Promise.all([
    User.deleteOne({ _id: owner._id }),
    Organization.deleteOne({ _id: organization._id }),
    OrganizationMember.deleteMany({ organizationId: organization._id }),
    Project.deleteOne({ _id: project._id }),
    Task.deleteOne({ _id: task._id }),
    Comment.deleteOne({ _id: comment._id }),
    Notification.deleteOne({ _id: notification._id }),
    Invitation.deleteOne({ _id: invitation._id }),
    Activity.deleteOne({ _id: activity._id }),
  ])

  await mongoose.disconnect()
  console.log("PERSISTENCE WRITE-BACK TEST: PASS")
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
