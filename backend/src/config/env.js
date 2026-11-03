import dotenv from "dotenv"

dotenv.config()

const isTest = process.env.NODE_ENV === "test"
const testMongoUri =
  process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/workflow_test"

if (isTest) {
  let testDatabaseName = ""
  try {
    testDatabaseName = decodeURIComponent(
      new URL(testMongoUri).pathname.split("/").filter(Boolean)[0] || "",
    )
  } catch {
    throw new Error("Invalid MONGODB_TEST_URI; expected a MongoDB URI for workflow_test")
  }
  if (testDatabaseName !== "workflow_test") {
    throw new Error(
      `Refusing to run tests against MongoDB database "${testDatabaseName || "<none>"}"; expected "workflow_test".`,
    )
  }
}

export const env = {
  port: isTest
    ? Number(process.env.WORKFLOW_TEST_PORT || 5101)
    : Number(process.env.PORT || 5000),
  mongoUri: isTest
    ? testMongoUri
    : process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/workflow",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:8443",
  allowedOrigins: Array.from(
    new Set([
      ...(process.env.CLIENT_ORIGIN || "http://localhost:8443")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      "https://workflow-project-rajangohel41s-projects.vercel.app",
    ]),
  ),
  allowVercelPreviews: process.env.ALLOW_VERCEL_PREVIEWS === "true",
  vercelPreviewPattern: process.env.VERCEL_PREVIEW_PATTERN || "",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-in-production",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-in-production",
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
  enablePasswordRecovery:
    Boolean(process.env.RESEND_API_KEY) ||
    process.env.ENABLE_PASSWORD_RECOVERY === "true",
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "WorkFlow <onboarding@resend.dev>",
  appUrl:
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",")[0].trim(),
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
}

if (process.env.NODE_ENV === "production") {
  if (
    !process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_ACCESS_SECRET === "dev-access-secret-change-in-production" ||
    !process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_REFRESH_SECRET === "dev-refresh-secret-change-in-production"
  ) {
    console.warn("[SECURITY WARNING] Default development JWT secrets detected in production! Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.")
  }
}

const isProd = process.env.NODE_ENV === "production"
const cookieSameSite = process.env.COOKIE_SAME_SITE || "lax"
const cookieSecure = isProd || cookieSameSite === "none" || process.env.COOKIE_SECURE === "true"

export const cookieOptions = {
  httpOnly: true,
  sameSite: cookieSameSite,
  secure: cookieSecure,
  path: "/",
}
