import { api } from "../api/client.js"

export const notificationService = {
  list: () => api.get("/notifications"),
  markRead: (id, unread = false) =>
    api.patch(`/notifications/${id}/read`, { unread }),
  markAllRead: () => api.post("/notifications/read-all"),
}
