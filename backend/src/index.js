import { createServer } from "node:http"
import mongoose from "mongoose"
import { env } from "./config/env.js"
import { connectDb } from "./db/connect.js"
import { app } from "./app.js"
import { initSocketServer } from "./sockets/index.js"

await connectDb()

const server = createServer(app)
const io = initSocketServer(server, app)

let shuttingDown = false

async function gracefulShutdown(signal = "SIGTERM") {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Gracefully shutting down server (${signal})...`)

  try {
    if (io && typeof io.close === "function") {
      await io.close()
    }
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    }
    await mongoose.disconnect()
  } catch (error) {
    console.error("Shutdown error:", error)
  } finally {
    process.exit(0)
  }
}

process.once("SIGINT", () => {
  gracefulShutdown("SIGINT")
})

process.once("SIGTERM", () => {
  gracefulShutdown("SIGTERM")
})

server.listen(env.port, () => {
  console.log(`WorkFlow API listening on http://localhost:${env.port}`)
})
