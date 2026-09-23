import { api } from "../api/client.js"

export const taskService = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return api.get(`/tasks${query ? `?${query}` : ""}`)
  },
  getById: (taskId) => api.get(`/tasks/${taskId}`),
  create: (payload) => api.post("/tasks", payload),
  update: (taskId, payload) => api.patch(`/tasks/${taskId}`, payload),
  remove: (taskId) => api.delete(`/tasks/${taskId}`),
  duplicate: (taskId) => api.post(`/tasks/${taskId}/duplicate`),
  addComment: (taskId, text) =>
    api.post(`/tasks/${taskId}/comments`, { text }),
  deleteComment: (taskId, commentId) =>
    api.delete(`/tasks/${taskId}/comments/${commentId}`),
  uploadAttachment: (taskId, formData) =>
    api.post(`/tasks/${taskId}/attachments`, formData),
  deleteAttachment: (taskId, attachmentId) =>
    api.delete(`/tasks/${taskId}/attachments/${attachmentId}`),
}
