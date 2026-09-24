import jwt from "jsonwebtoken"
import crypto from "node:crypto"
import { env } from "../config/env.js"

export function signAccessToken(userId, tokenVersion = 0) {
  return jwt.sign({ sub: userId, v: tokenVersion }, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpires,
  })
}

export function signRefreshToken(userId, tokenVersion = 0) {
  return jwt.sign({ sub: userId, type: "refresh", v: tokenVersion }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpires,
  })
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret)
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret)
}

export function randomToken() {
  return crypto.randomBytes(32).toString("hex")
}

export function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}
