import { useEffect } from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { setOrganizationId, setUnauthorizedHandler } from "../api/client.js"
import { useAppStore } from "../store/useAppStore.js"
import { useMe } from "../hooks/useWorkflowQueries.js"
import { queryKeys } from "../hooks/queryKeys.js"

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const location = useLocation()
  const setAuth = useAppStore((s) => s.setAuth)
  const clearAuth = useAppStore((s) => s.clearAuth)
  const setOrganization = useAppStore((s) => s.setOrganization)
  const organizationId = useAppStore((s) => s.organizationId)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearAuth()
      queryClient.clear()
    })
  }, [clearAuth, queryClient])

  const { data, isLoading, isError } = useMe(
    !location.pathname.startsWith("/login") &&
      !location.pathname.startsWith("/signup") &&
      !location.pathname.startsWith("/forgot-password") &&
      !location.pathname.startsWith("/reset-password") &&
      !location.pathname.startsWith("/verify-email"),
  )

  useEffect(() => {
    if (data?.user) {
      setAuth(data.user)
      const org = data.organizations?.[0]
      if (org && !organizationId) {
        setOrganizationId(org.id)
        setOrganization(org)
      } else if (organizationId) {
        setOrganizationId(organizationId)
      }
    }
  }, [data, setAuth, setOrganization, organizationId])

  return children
}

export function ProtectedRoute() {
  const { data, isLoading, isError } = useMe()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="auth-loading">
        <p>Loading workspace…</p>
      </div>
    )
  }

  if (isError || !data?.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!data.user.emailVerified && location.pathname !== "/verify-email") {
    return <Navigate to="/verify-email" replace />
  }

  if (
    data.organizations?.length === 0 &&
    location.pathname !== "/onboarding"
  ) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}

export function GuestRoute() {
  const { data, isLoading } = useMe()
  if (isLoading) return null
  if (data?.user?.emailVerified && data.organizations?.length) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
