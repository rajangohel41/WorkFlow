import { api } from "../api/client.js"

export const calendarService = {
  list: () => api.get("/calendar"),
  create: (payload) => api.post("/calendar", payload),
  remove: (id) => api.delete(`/calendar/${id}`),
}
