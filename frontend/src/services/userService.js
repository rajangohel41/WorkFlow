import { api } from "../api/client.js"

export const userService = {
  getProfile: () => api.get("/users/profile"),
  updateProfile: (payload) => api.patch("/users/profile", payload),
  updatePreferences: (payload) => api.patch("/users/preferences", payload),
}
