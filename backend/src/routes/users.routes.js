import { Router } from "express"
import { requireAuth } from "../middleware/auth.js"
import { serializeUser } from "../services/serializers.js"

const router = Router()

router.use(requireAuth)

router.get("/profile", async (req, res) => {
  res.json({ user: serializeUser(req.user) })
})

router.patch("/profile", async (req, res, next) => {
  try {
    const { name, title, avatarUrl } = req.body
    if (name) req.user.name = name.trim()
    if (title !== undefined) req.user.title = title
    if (avatarUrl !== undefined) req.user.avatarUrl = avatarUrl
    await req.user.save()
    res.json({ user: serializeUser(req.user) })
  } catch (error) {
    next(error)
  }
})

router.patch("/preferences", async (req, res, next) => {
  try {
    const allowed = ["assignments", "mentions", "projectUpdates"]
    for (const key of allowed) {
      if (typeof req.body[key] === "boolean") {
        req.user.preferences[key] = req.body[key]
      }
    }
    await req.user.save()
    res.json({ preferences: req.user.preferences })
  } catch (error) {
    next(error)
  }
})

export default router
