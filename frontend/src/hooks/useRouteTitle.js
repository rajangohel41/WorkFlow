import { useEffect } from "react"
import { useLocation } from "react-router-dom"

export const DEFAULT_TITLE = "WorkFlow — Plan better. Build faster. Work together."

export function formatTitle(title) {
  if (!title) return DEFAULT_TITLE
  if (title === DEFAULT_TITLE || title.endsWith("| WorkFlow")) return title
  return `${title} | WorkFlow`
}

/**
 * Get base route title from URL pathname
 * @param {string} pathname
 * @returns {string}
 */
export function getRouteTitle(pathname) {
  if (!pathname || pathname === "/") return DEFAULT_TITLE

  // Clean trailing slashes
  const path = pathname.replace(/\/+$/, "") || "/"

  if (path === "/login") return "Sign In"
  if (path === "/signup") return "Create Account"
  if (path === "/forgot-password") return "Forgot Password"
  if (path === "/reset-password") return "Reset Password"
  if (path.startsWith("/invite/")) return "Accept Invitation"
  if (path === "/onboarding") return "Get Started"

  if (path === "/dashboard") return "Dashboard"
  if (path === "/projects") return "Projects"
  if (path === "/tasks") return "Tasks"
  if (path === "/calendar") return "Calendar"
  if (path === "/team") return "Team"
  if (path === "/analytics") return "Analytics"
  if (path.startsWith("/settings")) return "Settings"
  if (path === "/error") return "Error"

  if (path === "/my-tasks") return "Tasks"
  if (path === "/favorites" || path === "/recent") return "Projects"

  // Nested project subroutes default to Projects until ProjectPage provides name
  if (path.startsWith("/projects/")) return "Projects"
  if (path.startsWith("/tasks/")) return "Tasks"

  return "Page Not Found"
}

/**
 * Reusable hook for components to set a custom document title
 * @param {string|undefined} title
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return
    const prev = document.title
    document.title = formatTitle(title)
    return () => {
      document.title = prev
    }
  }, [title])
}

/**
 * Centralized component to dynamically update browser tab title on route navigation
 */
export function RouteTitleTracker() {
  const location = useLocation()

  useEffect(() => {
    const title = getRouteTitle(location.pathname)
    document.title = formatTitle(title)
  }, [location.pathname])

  return null
}
