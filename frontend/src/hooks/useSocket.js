import { useEffect, useRef } from "react"
import { io } from "socket.io-client"
import { useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "../store/useAppStore.js"
import { getAuthToken } from "../api/client.js"
import { queryKeys } from "./queryKeys.js"

// Module-level singleton so multiple component mounts don't create duplicate connections
let _socket = null
let _socketOrgId = null

function getOrCreateSocket(socketUrl, organizationId, authToken) {
  // Reuse an in-flight or connected socket for the same organization.
  if (_socket && _socketOrgId === organizationId && _socket.active) {
    return _socket
  }
  // Disconnect stale socket
  if (_socket) {
    _socket.disconnect()
    _socket = null
    _socketOrgId = null
  }
  const socket = io(socketUrl, {
    withCredentials: true,
    transports: ["websocket", "polling"],
    auth: {
      organizationId,
      ...(authToken ? { token: authToken } : {}),
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  })
  _socket = socket
  _socketOrgId = organizationId
  return socket
}

export function useSocket() {
  const queryClient = useQueryClient()
  const organizationId = useAppStore((s) => s.organizationId)
  // Track whether this hook instance is the active owner of the socket
  const activeRef = useRef(false)

  useEffect(() => {
    if (!organizationId) return

    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.DEV ? "http://localhost:5000" : window.location.origin)

    const authToken = getAuthToken()
    const socket = getOrCreateSocket(socketUrl, organizationId, authToken)
    activeRef.current = true

    const onConnect = () => {
      // Re-join org room on every (re)connect
      socket.emit("joinOrganization", organizationId)
    }

    const invalidateTasks = () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["task"] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["analytics", "dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["analytics", "overview"] })
    }

    const invalidateComments = () => {
      queryClient.invalidateQueries({ queryKey: ["task"] })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
    }

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["task"] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["project-activity"] })
      queryClient.invalidateQueries({ queryKey: ["milestones"] })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
      queryClient.invalidateQueries({ queryKey: ["analytics", "dashboard"] })
    }

    const invalidateMembers = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members })
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations })
      queryClient.invalidateQueries({ queryKey: ["analytics", "dashboard"] })
    }

    const invalidateNotifications = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations })
      queryClient.invalidateQueries({ queryKey: queryKeys.members })
    }

    const invalidateActivities = (event) => {
      queryClient.invalidateQueries({ queryKey: ["analytics", "dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({
        queryKey: event?.projectId
          ? queryKeys.projectActivity(event.projectId)
          : ["project-activity"],
      })
    }

    const eventHandlers = [
      ["task.created", invalidateTasks],
      ["task.updated", invalidateTasks],
      ["task.deleted", invalidateTasks],
      ["task.assigned", invalidateTasks],
      ["comment.created", invalidateComments],
      ["comment.updated", invalidateComments],
      ["comment.deleted", invalidateComments],
      ["project.updated", invalidateAll],
      ["notification.created", invalidateNotifications],
      ["notification.read", invalidateNotifications],
      ["member.added", invalidateMembers],
      ["member.updated", invalidateMembers],
      ["member.removed", invalidateMembers],
      ["invitation.created", invalidateMembers],
      ["invitation.accepted", invalidateMembers],
      ["activity.created", invalidateActivities],
    ]

    // Register listeners
    socket.on("connect", onConnect)
    for (const [ev, fn] of eventHandlers) {
      socket.on(ev, fn)
    }

    // If socket is already connected, join org room immediately
    if (socket.connected) {
      socket.emit("joinOrganization", organizationId)
    }

    return () => {
      // Clean up listeners on unmount
      socket.off("connect", onConnect)
      for (const [ev, fn] of eventHandlers) {
        socket.off(ev, fn)
      }
      activeRef.current = false
    }
  }, [organizationId, queryClient])
}


// Call this on logout to cleanly shut down the singleton socket
export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect()
    _socket = null
    _socketOrgId = null
  }
}
