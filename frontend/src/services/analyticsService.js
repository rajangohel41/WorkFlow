import { api } from "../api/client.js"

export const analyticsService = {
  dashboard: (range) => api.get(`/analytics/dashboard?range=${encodeURIComponent(range || "Last 30 days")}`),
  overview: (range) => api.get(`/analytics/overview?range=${encodeURIComponent(range || "Last 30 days")}`),
}
