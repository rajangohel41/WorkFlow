import dotenv from "dotenv"

dotenv.config()

export const env = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/workflow",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:8443",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-in-production",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-in-production",
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
}
