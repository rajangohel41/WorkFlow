import mongoose from "mongoose"

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    defaultView: {
      type: String,
      enum: ["board", "list", "timeline", "calendar"],
      default: "board",
    },
    plan: { type: String, default: "Business" },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

export const Organization = mongoose.model("Organization", organizationSchema)

const memberSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["Owner", "Admin", "Manager", "Member", "Viewer"],
      default: "Member",
    },
    status: {
      type: String,
      enum: ["Active", "Pending", "Removed"],
      default: "Active",
    },
  },
  { timestamps: true },
)

memberSchema.index({ organizationId: 1, userId: 1 }, { unique: true })

export const OrganizationMember = mongoose.model(
  "OrganizationMember",
  memberSchema,
)

const invitationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: ["Admin", "Manager", "Member", "Viewer"],
      default: "Member",
    },
    token: { type: String, required: true, unique: true },
    inviterId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "expired", "cancelled"],
      default: "pending",
      index: true,
    },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
    rejectedAt: { type: Date },
  },
  { timestamps: true },
)

invitationSchema.pre("save", function normalizeInvitationEmail(next) {
  if (this.email) {
    this.email = this.email.toLowerCase().trim()
  }
  if (this.inviterId && !this.invitedBy) {
    this.invitedBy = this.inviterId
  }
  if (this.invitedBy && !this.inviterId) {
    this.inviterId = this.invitedBy
  }
  next()
})

invitationSchema.index(
  { organizationId: 1, email: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
    name: "unique_pending_invitation",
  },
)
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 })

export const Invitation = mongoose.model("Invitation", invitationSchema)
