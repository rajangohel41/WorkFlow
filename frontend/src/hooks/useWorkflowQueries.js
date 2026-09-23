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

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => notificationService.list(),
  })
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => analyticsService.dashboard(),
  })
}

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: queryKeys.analytics,
    queryFn: () => analyticsService.overview(),
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
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
  queryClient.invalidateQueries({ queryKey: queryKeys.analytics })
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
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
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

  const deleteProject = useMutation({
    mutationFn: (id) => projectService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
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
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
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
    onError: (error, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      addToast(error.message, "error")
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: queryKeys.task(vars.id) })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
    },
  })

  const deleteTask = useMutation({
    mutationFn: (id) => taskService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
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
    mutationFn: ({ taskId, formData }) =>
      taskService.uploadAttachment(taskId, formData),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members })
      addToast("Invitation sent")
    },
    onError: (error) => addToast(error.message, "error"),
  })

  const updateMember = useMutation({
    mutationFn: ({ userId, payload }) =>
      teamService.updateMember(userId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.members }),
    onError: (error) => addToast(error.message, "error"),
  })

  const removeMember = useMutation({
    mutationFn: (userId) => teamService.removeMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members })
      addToast("Member removed")
    },
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

  return {
    switchOrganization,
    createOrganization,
    createProject,
    updateProject,
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
