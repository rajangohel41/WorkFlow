import { api } from "../api/client.js"

export const organizationService = {
  list: () => api.get("/organizations"),
  create: (payload) => api.post("/organizations", payload),
  switch: (organizationId) =>
    api.post("/organizations/switch", { organizationId }),
  updateCurrent: (payload) => api.patch("/organizations/current", payload),
  members: () => api.get("/organizations/members"),
  pendingInvitations: () => api.get("/organizations/invitations/mine"),
  invite: (payload) => api.post("/organizations/invitations", payload),
  acceptInvite: (token) =>
    api.post(`/organizations/invitations/${token}/accept`),
  rejectInvite: (token) =>
    api.post(`/organizations/invitations/${token}/reject`),
  resendInvite: (token) =>
    api.post(`/organizations/invitations/${token}/resend`),
  revokeInvite: (token) => api.delete(`/organizations/invitations/${token}`),
  updateMember: (userId, payload) =>
    api.patch(`/organizations/members/${userId}`, payload),
  removeMember: (userId) => api.delete(`/organizations/members/${userId}`),
}
