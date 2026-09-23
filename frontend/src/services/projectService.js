import { api } from "../api/client.js"

export const projectService = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return api.get(`/projects${query ? `?${query}` : ""}`)
  },
  getById: (projectId) => api.get(`/projects/${projectId}`),
  create: (payload) => api.post("/projects", payload),
  update: (projectId, payload) => api.patch(`/projects/${projectId}`, payload),
  remove: (projectId) => api.delete(`/projects/${projectId}`),
  toggleFavorite: (projectId) => api.post(`/projects/${projectId}/favorite`),
  activity: (projectId) => api.get(`/projects/${projectId}/activity`),
}
