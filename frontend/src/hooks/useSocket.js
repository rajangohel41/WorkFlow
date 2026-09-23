import { useEffect } from "react"
import { io } from "socket.io-client"
import { useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "../store/useAppStore.js"

export function useSocket() {
  const queryClient = useQueryClient()
  const organizationId = useAppStore((s) => s.organizationId)

  useEffect(() => {
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.DEV ? "http://localhost:5000" : window.location.origin)
    const socket = io(socketUrl, {
      withCredentials: true,
      auth: { organizationId },
    })
    socket.on("connect", () => {
      if (organizationId) socket.emit("joinOrganization", organizationId)
    })
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    }
    socket.on("task.created", invalidate)
    socket.on("task.updated", invalidate)
    socket.on("task.deleted", invalidate)
    socket.on("task.statusChanged", invalidate)
    socket.on("comment.created", invalidate)
    socket.on("project.updated", invalidate)
    socket.on("notification.created", () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    )
    return () => socket.disconnect()
  }, [organizationId, queryClient])
}
