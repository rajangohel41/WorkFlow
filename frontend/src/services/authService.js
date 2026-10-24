import { api, getRefreshToken } from "../api/client.js"

export const authService = {
  register: (payload) => api.post("/auth/register", payload),
  login: (payload) => api.post("/auth/login", payload),
  logout: () => api.post("/auth/logout"),
  logoutAll: () => api.post("/auth/logout-all"),
  me: () => api.get("/auth/me"),
  refresh: (payload) =>
    api.post(
      "/auth/refresh",
      payload || (getRefreshToken() ? { refreshToken: getRefreshToken() } : {}),
    ),
  resetPassword: (payload) => api.post("/auth/reset-password", payload),
  changePassword: (payload) => api.post("/auth/change-password", payload),
  completeOnboarding: (payload) => api.post("/auth/onboarding", payload),
}
