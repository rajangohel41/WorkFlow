import mongoose from "mongoose"
import { env } from "../config/env.js"

let connectionPromise = null

export async function connectDb() {
  mongoose.set("strictQuery", true)
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection
  }
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(env.mongoUri).catch((err) => {
      connectionPromise = null
      throw err
    })
  }
  await connectionPromise
  return mongoose.connection
}
