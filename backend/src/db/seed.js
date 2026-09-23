import mongoose from "mongoose"
import { connectDb } from "./connect.js"
import { User, hashPassword } from "../models/User.js"
import { Organization, OrganizationMember } from "../models/Organization.js"
import { Project } from "../models/Project.js"
import { Task, TaskCounter } from "../models/Task.js"
import { Comment } from "../models/Comment.js"
import { Activity } from "../models/Activity.js"
import { Notification } from "../models/Notification.js"
import { CalendarEvent } from "../models/CalendarEvent.js"

export async function seedDatabase() {
  await connectDb()
  console.log("Seeding database...")

  // Clean existing collections
  await Promise.all([
    User.deleteMany({}),
    Organization.deleteMany({}),
    OrganizationMember.deleteMany({}),
    Project.deleteMany({}),
    Task.deleteMany({}),
    TaskCounter.deleteMany({}),
    Comment.deleteMany({}),
    Activity.deleteMany({}),
    Notification.deleteMany({}),
    CalendarEvent.deleteMany({}),
  ])

  // 1. Create Users
  const defaultPasswordHash = await hashPassword("password123")
  const alex = await User.create({
    name: "Alex Kumar",
    email: "alex@acme.io",
    passwordHash: defaultPasswordHash,
    title: "Product Lead",
    emailVerified: true,
    preferences: {
      email: true,
      assignments: true,
      mentions: true,
      projectUpdates: true,
      weekly: true,
    },
  })

  const sarah = await User.create({
    name: "Sarah Patel",
    email: "sarah@acme.io",
    passwordHash: defaultPasswordHash,
    title: "Engineering Manager",
    emailVerified: true,
  })

  const rahul = await User.create({
    name: "Rahul Mehta",
    email: "rahul@acme.io",
    passwordHash: defaultPasswordHash,
    title: "Full Stack Developer",
    emailVerified: true,
  })

  const emily = await User.create({
    name: "Emily Davis",
    email: "emily@acme.io",
    passwordHash: defaultPasswordHash,
    title: "Product Designer",
    emailVerified: true,
  })

  const john = await User.create({
    name: "John Smith",
    email: "john@acme.io",
    passwordHash: defaultPasswordHash,
    title: "DevOps Engineer",
    emailVerified: true,
  })

  // 2. Create Organization
  const org = await Organization.create({
    name: "Acme Technologies",
    slug: "acme-technologies",
    plan: "Business",
    ownerId: alex._id,
  })

  // 3. Organization Memberships
  await OrganizationMember.create([
    { organizationId: org._id, userId: alex._id, role: "Owner", status: "Active" },
    { organizationId: org._id, userId: sarah._id, role: "Manager", status: "Active" },
    { organizationId: org._id, userId: rahul._id, role: "Member", status: "Active" },
    { organizationId: org._id, userId: emily._id, role: "Member", status: "Active" },
    { organizationId: org._id, userId: john._id, role: "Member", status: "Active" },
  ])

  // 4. Projects
  const now = new Date()
  const pWebsite = await Project.create({
    organizationId: org._id,
    name: "Website Redesign",
    slug: "website-redesign",
    description: "Redesign the company marketing website and improve conversion.",
    status: "In Progress",
    color: "#6366F1",
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5),
    memberIds: [alex._id, sarah._id, emily._id],
    favoriteBy: [alex._id],
  })

  const pMobile = await Project.create({
    organizationId: org._id,
    name: "Mobile App",
    slug: "mobile-app",
    description: "Native mobile experience for iOS and Android customers.",
    status: "In Progress",
    color: "#0EA5E9",
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 19),
    memberIds: [alex._id, rahul._id, john._id],
  })

  const pMarketing = await Project.create({
    organizationId: org._id,
    name: "Marketing Campaign",
    slug: "marketing-campaign",
    description: "Q4 product launch campaign across key channels.",
    status: "Planning",
    color: "#F59E0B",
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 35),
    memberIds: [sarah._id, emily._id],
  })

  const pPortal = await Project.create({
    organizationId: org._id,
    name: "Customer Portal",
    slug: "customer-portal",
    description: "Self-service portal for account and billing management.",
    status: "In Review",
    color: "#22C55E",
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 12),
    memberIds: [alex._id, rahul._id, john._id],
    favoriteBy: [alex._id],
  })

  const pDashboard = await Project.create({
    organizationId: org._id,
    name: "Internal Dashboard",
    slug: "internal-dashboard",
    description: "Operational metrics and reporting for internal teams.",
    status: "On Track",
    color: "#8B5CF6",
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 45),
    memberIds: [sarah._id, rahul._id, emily._id],
  })

  // 5. Tasks
  await TaskCounter.create({ organizationId: org._id, seq: 130 })

  const t1 = await Task.create({
    organizationId: org._id,
    projectId: pWebsite._id,
    displayId: "WF-124",
    title: "Redesign authentication screen",
    description: "Refresh login and registration flows with improved validation and responsive styling.",
    status: "In Progress",
    priority: "High",
    label: "Design",
    assigneeId: alex._id,
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2),
    checklist: [
      { title: "Authentication form layout", done: true },
      { title: "Password validation rules", done: true },
      { title: "Error states & alerts", done: false },
      { title: "Accessibility audit", done: false },
    ],
    createdBy: alex._id,
    commentCount: 2,
    fileCount: 1,
  })

  const t2 = await Task.create({
    organizationId: org._id,
    projectId: pMobile._id,
    displayId: "WF-125",
    title: "Implement API integration",
    description: "Connect mobile client to backend authentication and task synchronization endpoints.",
    status: "Todo",
    priority: "High",
    label: "Development",
    assigneeId: rahul._id,
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4),
    checklist: [
      { title: "Set up API client", done: true },
      { title: "Implement token refresh handling", done: false },
    ],
    createdBy: alex._id,
    commentCount: 1,
  })

  const t3 = await Task.create({
    organizationId: org._id,
    projectId: pDashboard._id,
    displayId: "WF-126",
    title: "Create dashboard components",
    description: "Build charts, KPI summary cards, and quick action bars for workspace overview.",
    status: "In Review",
    priority: "Medium",
    label: "Design",
    assigneeId: emily._id,
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6),
    createdBy: sarah._id,
  })

  const t4 = await Task.create({
    organizationId: org._id,
    projectId: pWebsite._id,
    displayId: "WF-127",
    title: "Fix mobile navigation drawer",
    description: "Ensure slide-over navigation closes correctly on route transition and touch gestures.",
    status: "Backlog",
    priority: "Medium",
    label: "Bug",
    assigneeId: john._id,
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 9),
    createdBy: alex._id,
  })

  const t5 = await Task.create({
    organizationId: org._id,
    projectId: pPortal._id,
    displayId: "WF-128",
    title: "Write unit tests for invoices",
    description: "Verify subscription change and usage calculation logic.",
    status: "Todo",
    priority: "Low",
    label: "QA",
    assigneeId: rahul._id,
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 11),
    createdBy: alex._id,
  })

  const t6 = await Task.create({
    organizationId: org._id,
    projectId: pPortal._id,
    displayId: "WF-129",
    title: "Deploy staging environment",
    description: "Set up containerized preview pipeline and verify end-to-end integration.",
    status: "Done",
    priority: "High",
    label: "DevOps",
    assigneeId: john._id,
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2),
    createdBy: alex._id,
  })

  const t7 = await Task.create({
    organizationId: org._id,
    projectId: pMobile._id,
    displayId: "WF-130",
    title: "Review pull request for push notifications",
    description: "Check APNS and FCM service handlers and token invalidation on logout.",
    status: "Done",
    priority: "Medium",
    label: "Review",
    assigneeId: alex._id,
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
    createdBy: rahul._id,
  })

  // 6. Comments
  await Comment.create([
    {
      taskId: t1._id,
      organizationId: org._id,
      authorId: sarah._id,
      text: "This looks great. Could we also test the SSO authentication state?",
    },
    {
      taskId: t1._id,
      organizationId: org._id,
      authorId: alex._id,
      text: "Yes, adding mock SSO flow to the checklist now.",
    },
    {
      taskId: t2._id,
      organizationId: org._id,
      authorId: rahul._id,
      text: "Token refresh logic is working smoothly with credentials included.",
    },
  ])

  // 7. Activities
  await Activity.create([
    {
      organizationId: org._id,
      actorId: alex._id,
      text: "created a new task",
      target: t1.title,
    },
    {
      organizationId: org._id,
      actorId: sarah._id,
      text: "moved Website Redesign to",
      target: "In Progress",
    },
    {
      organizationId: org._id,
      actorId: rahul._id,
      text: "completed",
      target: "API Integration Setup",
    },
    {
      organizationId: org._id,
      actorId: emily._id,
      text: "commented on",
      target: t1.title,
    },
  ])

  // 8. Notifications
  await Notification.create([
    {
      organizationId: org._id,
      userId: alex._id,
      title: "You were assigned WF-124",
      meta: "Sarah assigned you · 15m ago",
      unread: true,
      entityType: "task",
      entityId: t1._id,
    },
    {
      organizationId: org._id,
      userId: alex._id,
      title: "Sarah commented on your task",
      meta: "Website Redesign · 1 hr ago",
      unread: true,
      entityType: "task",
      entityId: t1._id,
    },
    {
      organizationId: org._id,
      userId: alex._id,
      title: "Website Redesign milestone upcoming",
      meta: "Due in 3 days",
      unread: false,
      entityType: "project",
      entityId: pWebsite._id,
    },
  ])

  // 9. Calendar Events
  await CalendarEvent.create([
    {
      organizationId: org._id,
      title: "Sprint Planning",
      day: Math.min(28, now.getDate()),
      time: "10:00 AM",
      color: "indigo",
      projectId: pWebsite._id,
      createdBy: alex._id,
    },
    {
      organizationId: org._id,
      title: "Design Review",
      day: Math.min(28, now.getDate() + 2),
      time: "02:30 PM",
      color: "purple",
      projectId: pWebsite._id,
      createdBy: emily._id,
    },
    {
      organizationId: org._id,
      title: "Release v1.2",
      day: Math.min(28, now.getDate() + 5),
      time: "04:00 PM",
      color: "green",
      projectId: pPortal._id,
      createdBy: john._id,
    },
  ])

  console.log("Database seeded successfully!")
  console.log("Test account: alex@acme.io / password123")
}

// Run directly if called via node
if (process.argv[1]?.endsWith("seed.js")) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
