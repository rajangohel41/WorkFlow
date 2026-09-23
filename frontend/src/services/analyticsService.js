import { api } from "../api/client.js"

export const analyticsService = {
  dashboard: () => api.get("/analytics/dashboard"),
  overview: () => api.get("/analytics/overview"),
}
