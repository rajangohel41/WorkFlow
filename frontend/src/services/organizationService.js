import { api } from "../api/client.js"

export const organizationService = {
  list: () => api.get("/organizations"),
  create: (payload) => api.post("/organizations", payload),
  switch: (organizationId) =>
    api.post("/organizations/switch", { organizationId }),
  updateCurrent: (payload) => api.patch("/organizations/current", payload),
  members: () => api.get("/organizations/members"),
  invite: (payload) => api.post("/organizations/invitations", payload),
  updateMember: (userId, payload) =>
    api.patch(`/organizations/members/${userId}`, payload),
  removeMember: (userId) => api.delete(`/organizations/members/${userId}`),
}
