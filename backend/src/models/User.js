import mongoose from "mongoose"
import argon2 from "argon2"

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    title: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    resetToken: { type: String, select: false },
    resetExpires: { type: Date, select: false },
    preferences: {
      assignments: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      projectUpdates: { type: Boolean, default: false },
    },
    refreshTokens: [{ token: String, expires: Date }],
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
)

userSchema.pre("save", function normalizeEmail(next) {
  if (this.email) {
    this.email = this.email.toLowerCase().trim()
  }
  next()
})

userSchema.methods.comparePassword = function comparePassword(password) {
  return argon2.verify(this.passwordHash, password)
}

export const User = mongoose.model("User", userSchema)

export async function hashPassword(password) {
  return argon2.hash(password)
}
