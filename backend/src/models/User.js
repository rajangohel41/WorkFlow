import mongoose from "mongoose"
import bcrypt from "bcryptjs"

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    title: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    emailVerified: { type: Boolean, default: false },
    verificationCode: { type: String, select: false },
    verificationExpires: { type: Date, select: false },
    resetToken: { type: String, select: false },
    resetExpires: { type: Date, select: false },
    preferences: {
      email: { type: Boolean, default: true },
      assignments: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      projectUpdates: { type: Boolean, default: false },
      weekly: { type: Boolean, default: true },
    },
    refreshTokens: [{ token: String, expires: Date }],
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
)

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash)
}

export const User = mongoose.model("User", userSchema)

export async function hashPassword(password) {
  return bcrypt.hash(password, 12)
}
