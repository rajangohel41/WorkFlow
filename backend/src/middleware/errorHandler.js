export function errorHandler(err, _req, res, _next) {
  if (err?.name === "ValidationError") {
    return res.status(422).json({ message: err.message })
  }
  if (err?.name === "CastError" || err?.name === "BSONError") {
    return res.status(400).json({ message: "Invalid resource identifier" })
  }
  if (err?.code === 11000) {
    return res.status(409).json({ message: "Resource already exists" })
  }
  if (err?.name === "MulterError" || err?.message?.includes("is not allowed")) {
    return res.status(400).json({ message: err.message })
  }
  if (process.env.NODE_ENV !== "test") {
    console.error(err)
  }
  const status = err.status || 500
  const message =
    status === 500 && process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error"
  res.status(status).json({ message })
}

