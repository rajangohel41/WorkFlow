function sanitizeInPlace(obj) {
  if (!obj || typeof obj !== "object") return
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (obj[i] && typeof obj[i] === "object") {
        sanitizeInPlace(obj[i])
      }
    }
    return
  }
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key]
    } else if (obj[key] && typeof obj[key] === "object") {
      sanitizeInPlace(obj[key])
    }
  }
}

export function sanitizeMiddleware(req, _res, next) {
  if (req.body) sanitizeInPlace(req.body)
  if (req.query) sanitizeInPlace(req.query)
  if (req.params) sanitizeInPlace(req.params)
  next()
}
