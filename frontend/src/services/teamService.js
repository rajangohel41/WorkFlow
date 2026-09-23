import { organizationService } from "./organizationService.js"

export const teamService = {
  listMembers: () => organizationService.members(),
  invite: (payload) => organizationService.invite(payload),
  updateMember: (userId, payload) =>
    organizationService.updateMember(userId, payload),
  removeMember: (userId) => organizationService.removeMember(userId),
}
