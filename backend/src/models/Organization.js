import mongoose from "mongoose"

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
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
    },
    email: { type: String, required: true, lowercase: true },
    role: {
      type: String,
      enum: ["Admin", "Manager", "Member", "Viewer"],
      default: "Member",
    },
    token: { type: String, required: true, unique: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
  },
  { timestamps: true },
)

export const Invitation = mongoose.model("Invitation", invitationSchema)
