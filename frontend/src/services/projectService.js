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
  milestones: (projectId) => api.get(`/projects/${projectId}/milestones`),
  createMilestone: (projectId, payload) =>
    api.post(`/projects/${projectId}/milestones`, payload),
  updateMilestone: (projectId, milestoneId, payload) =>
    api.patch(`/projects/${projectId}/milestones/${milestoneId}`, payload),
  removeMilestone: (projectId, milestoneId) =>
    api.delete(`/projects/${projectId}/milestones/${milestoneId}`),
}
