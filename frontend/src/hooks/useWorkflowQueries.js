import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { authService } from "../services/authService.js"
import { organizationService } from "../services/organizationService.js"
import { projectService } from "../services/projectService.js"
import { taskService } from "../services/taskService.js"
import { notificationService } from "../services/notificationService.js"
import { analyticsService } from "../services/analyticsService.js"
import { teamService } from "../services/teamService.js"
import { userService } from "../services/userService.js"
import { calendarService } from "../services/calendarService.js"
import { searchService } from "../services/searchService.js"
import { queryKeys } from "./queryKeys.js"
import { setOrganizationId } from "../api/client.js"
import { useAppStore } from "../store/useAppStore.js"

export function useMe(enabled = true) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authService.me(),
    enabled,
    retry: false,
  })
}

export const useCurrentUser = useMe


export function useOrganizations() {
  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: () => organizationService.list(),
  })
}

export function useProjects(params = {}) {
  return useQuery({
    queryKey: queryKeys.projects(params),
    queryFn: () => projectService.list(params),
  })
}

export function useProject(projectId) {
  return useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => projectService.getById(projectId),
    enabled: Boolean(projectId),
  })
}

export function useMilestones(projectId) {
  return useQuery({
    queryKey: queryKeys.milestones(projectId),
    queryFn: () => projectService.milestones(projectId),
    enabled: Boolean(projectId),
  })
}

export function useProjectActivity(projectId) {
  return useQuery({
    queryKey: queryKeys.projectActivity(projectId),
    queryFn: () => projectService.activity(projectId),
    enabled: Boolean(projectId),
  })
}

export function useTasks(params = {}) {
  return useQuery({
    queryKey: queryKeys.tasks(params),
    queryFn: () => taskService.list(params),
  })
}

export function useTask(taskId) {
  return useQuery({
    queryKey: queryKeys.task(taskId),
    queryFn: () => taskService.getById(taskId),
    enabled: Boolean(taskId),
  })
}

export function useMembers() {
  return useQuery({
    queryKey: queryKeys.members,
    queryFn: () => teamService.listMembers(),
  })
}

export function usePendingInvitations() {
  return useQuery({
    queryKey: queryKeys.invitations,
    queryFn: () => organizationService.pendingInvitations(),
  })
}

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => notificationService.list(),
  })
}

export function useDashboardStats(range = "Last 30 days") {
  return useQuery({
    queryKey: queryKeys.dashboard(range),
    queryFn: () => analyticsService.dashboard(range),
  })
}

export function useAnalyticsOverview(range = "Last 30 days") {
  return useQuery({
    queryKey: queryKeys.analytics(range),
    queryFn: () => analyticsService.overview(range),
  })
}

export function useCalendarEvents() {
  return useQuery({
    queryKey: queryKeys.calendar,
    queryFn: () => calendarService.list(),
  })
}

export function useSearchQuery(q, enabled) {
  return useQuery({
    queryKey: queryKeys.search(q),
    queryFn: () => searchService.search(q),
    enabled: enabled && q.length > 0,
  })
}

function invalidateWorkspace(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["projects"] })
  queryClient.invalidateQueries({ queryKey: ["tasks"] })
  queryClient.invalidateQueries({ queryKey: queryKeys.members })
  queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
  queryClient.invalidateQueries({ queryKey: ["analytics", "dashboard"] })
  queryClient.invalidateQueries({ queryKey: ["analytics", "overview"] })
  queryClient.invalidateQueries({ queryKey: queryKeys.calendar })
}

export function useWorkflowMutations() {
  const queryClient = useQueryClient()
  const addToast = useAppStore((s) => s.addToast)
  const setOrganization = useAppStore((s) => s.setOrganization)

  const switchOrganization = useMutation({
    mutationFn: (organizationId) => organizationService.switch(organizationId),
    onSuccess: (org) => {
      setOrganizationId(org.id)
      setOrganization(org)
      invalidateWorkspace(queryClient)
      addToast(`${org.name} selected`, "success")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const createOrganization = useMutation({
    mutationFn: (payload) => organizationService.create(payload),
    onSuccess: async (org) => {
      await organizationService.switch(org.id)
      setOrganizationId(org.id)
      setOrganization(org)
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations })
      invalidateWorkspace(queryClient)
      addToast("Workspace created", "success")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const createProject = useMutation({
    mutationFn: (payload) => projectService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["analytics", "dashboard"] })
      addToast("Project created successfully")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const updateProject = useMutation({
    mutationFn: ({ id, payload }) => projectService.update(id, payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(vars.id) })
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const createMilestone = useMutation({
    mutationFn: ({ projectId, payload }) => projectService.createMilestone(projectId, payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.milestones(vars.projectId) })
      addToast("Milestone added", "success")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const updateMilestone = useMutation({
    mutationFn: ({ projectId, milestoneId, payload }) =>
      projectService.updateMilestone(projectId, milestoneId, payload),
    onSuccess: (_data, vars) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.milestones(vars.projectId) }),
    onError: (error) => addToast(error.message, "error"),
  })

  const deleteMilestone = useMutation({
    mutationFn: ({ projectId, milestoneId }) =>
      projectService.removeMilestone(projectId, milestoneId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.milestones(vars.projectId) })
      addToast("Milestone removed", "info")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const deleteProject = useMutation({
    mutationFn: (id) => projectService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["analytics", "dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["analytics", "overview"] })
      addToast("Project deleted successfully")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const toggleFavorite = useMutation({
    mutationFn: (id) => projectService.toggleFavorite(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  })

  const createTask = useMutation({
    mutationFn: (payload) => taskService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["analytics", "dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["analytics", "overview"] })
      addToast("Task created successfully")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const updateTask = useMutation({
    mutationFn: ({ id, payload }) => taskService.update(id, payload),
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] })
      const previous = queryClient.getQueriesData({ queryKey: ["tasks"] })
      queryClient.setQueriesData({ queryKey: ["tasks"] }, (old) => {
        if (!old?.tasks) return old
        return {
          ...old,
          tasks: old.tasks.map((task) =>
            task.id === id ? { ...task, ...payload } : task,
          ),
        }
      })
      return { previous }
    },
    onSuccess: (task) => {
      queryClient.setQueriesData({ queryKey: ["tasks"] }, (old) => {
        if (!old?.tasks) return old
        return {
          ...old,
          tasks: old.tasks.map((item) =>
            item.id === task.id || item._id === task._id ? task : item,
          ),
        }
      })
      queryClient.setQueriesData({ queryKey: ["task"] }, (old) =>
        old && (old.id === task.id || old._id === task._id) ? task : old,
      )
      queryClient.setQueryData(queryKeys.task(task.id), task)
    },
    onError: (error, vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      if (error?.status === 409 || error?.response?.status === 409) {
        addToast(
          "Task was modified concurrently by another session. Refetching latest version...",
          "warning",
        )
      } else if (error?.status === 403 || error?.response?.status === 403) {
        addToast(
          error.message ||
            error.data?.message ||
            "Only the assigned team member can change this task's status.",
          "error",
        )
      } else {
        addToast(error.message || "Failed to update task", "error")
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.task(vars.id) })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    },
    onSettled: (_data, _error, vars) => {
      if (vars?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.task(vars.id) })
      }
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["analytics", "dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["analytics", "overview"] })
    },
  })

  const deleteTask = useMutation({
    mutationFn: (id) => taskService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["analytics", "dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["analytics", "overview"] })
      addToast("Task deleted successfully")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const duplicateTask = useMutation({
    mutationFn: (id) => taskService.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      addToast("Task duplicated", "info")
    },
  })

  const addComment = useMutation({
    mutationFn: ({ taskId, text }) => taskService.addComment(taskId, text),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.task(vars.taskId) })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      addToast("Comment added")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const deleteComment = useMutation({
    mutationFn: ({ taskId, commentId }) =>
      taskService.deleteComment(taskId, commentId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.task(vars.taskId) })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      addToast("Comment deleted")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const uploadAttachment = useMutation({
    mutationFn: ({ taskId, formData, file }) =>
      taskService.uploadAttachment(taskId, formData, file),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.task(vars.taskId) })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      addToast("File uploaded successfully")
    },

    onError: (error) => addToast(error.message, "error"),
  })

  const deleteAttachment = useMutation({
    mutationFn: ({ taskId, attachmentId }) =>
      taskService.deleteAttachment(taskId, attachmentId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.task(vars.taskId) })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      addToast("File removed")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const inviteMember = useMutation({
    mutationFn: (payload) => teamService.invite(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members })
      if (data?.immediate) {
        addToast("Member added to workspace", "success")
      } else {
        addToast("Invitation sent", "success")
      }
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const updateMember = useMutation({
    mutationFn: ({ userId, payload }) =>
      teamService.updateMember(userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members })
      addToast("Role updated", "success")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const removeMember = useMutation({
    mutationFn: (userId) => teamService.removeMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members })
      addToast("Member removed", "info")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const markNotification = useMutation({
    mutationFn: ({ id, unread }) =>
      notificationService.markRead(id, unread),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  })

  const markAllNotifications = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  })

  const updateProfile = useMutation({
    mutationFn: (payload) => userService.updateProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me })
      addToast("Profile updated successfully")
    },
  })

  const updatePreferences = useMutation({
    mutationFn: (payload) => userService.updatePreferences(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  })

  const createCalendarEvent = useMutation({
    mutationFn: (payload) => calendarService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar })
      addToast("Event created")
    },
  })

  const removeCalendarEvent = useMutation({
    mutationFn: (id) => calendarService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar })
      addToast("Event removed", "info")
    },
  })

  const acceptInvitation = useMutation({

    mutationFn: (token) => organizationService.acceptInvite(token),
    onSuccess: (data) => {
      if (data?.organization) {
        setOrganizationId(data.organization.id)
        setOrganization(data.organization)
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.members })
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations })
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations })
      queryClient.invalidateQueries({ queryKey: queryKeys.me })
      queryClient.invalidateQueries({ queryKey: ["analytics", "dashboard"] })
      addToast(`Joined ${data?.organization?.name || "workspace"}`, "success")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const rejectInvitation = useMutation({
    mutationFn: (token) => organizationService.rejectInvite(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
      addToast("Invitation declined", "info")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const resendInvitation = useMutation({
    mutationFn: (token) => organizationService.resendInvite(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members })
      addToast("Invitation resent", "success")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const revokeInvitation = useMutation({
    mutationFn: (token) => organizationService.revokeInvite(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members })
      addToast("Invitation revoked", "info")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  return {
    switchOrganization,
    createOrganization,
    createProject,
    updateProject,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    deleteProject,
    toggleFavorite,
    createTask,
    updateTask,
    deleteTask,
    duplicateTask,
    addComment,
    deleteComment,
    uploadAttachment,
    deleteAttachment,
    inviteMember,
    acceptInvitation,
    rejectInvitation,
    resendInvitation,
    revokeInvitation,
    updateMember,
    removeMember,
    markNotification,
    markAllNotifications,
    updateProfile,
    updatePreferences,
    createCalendarEvent,
    removeCalendarEvent,
  }
}
