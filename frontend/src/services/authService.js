import { api } from "../api/client.js"

export const authService = {
  register: (payload) => api.post("/auth/register", payload),
  login: (payload) => api.post("/auth/login", payload),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  refresh: () => api.post("/auth/refresh"),
  verifyEmail: (code) => api.post("/auth/verify-email", { code }),
  resendVerification: () => api.post("/auth/resend-verification"),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  resetPassword: (payload) => api.post("/auth/reset-password", payload),
  changePassword: (payload) => api.post("/auth/change-password", payload),
  completeOnboarding: (payload) => api.post("/auth/onboarding", payload),
}
