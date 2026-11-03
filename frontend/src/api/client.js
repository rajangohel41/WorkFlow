const API_BASE = (() => {
  // In production browser environments, always use relative /api/v1 for same-origin proxy
  if (typeof import.meta !== "undefined" && import.meta.env?.PROD) {
    const configured = import.meta.env.VITE_API_URL
    if (configured && !/^https?:\/\//.test(configured)) {
      return configured.replace(/\/+$/, "")
    }
    return "/api/v1"
  }
  const raw =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
    (typeof process !== "undefined" && process.env?.VITE_API_URL) ||
    "/api/v1"
  const value = raw.replace(/\/+$/, "")
  if (/^https?:\/\//.test(value)) {
    return value.endsWith("/api/v1") ? value : `${value}/api/v1`
  }
  return value.endsWith("/api/v1") ? value : `${value.replace(/\/$/, "")}/api/v1`
})()

let organizationId = null
let onUnauthorized = null
let authToken = null
let refreshToken = null
let refreshPromise = null
let isLoggingOut = false

export function setOrganizationId(id) {
  organizationId = id
}

export function getOrganizationId() {
  return organizationId
}

export function setAuthToken(token) {
  authToken = token
  if (token) {
    isLoggingOut = false
  }
}

export function getAuthToken() {
  return authToken
}

export function setRefreshToken(token) {
  refreshToken = token
}

export function getRefreshToken() {
  return refreshToken
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

export function notifyLogout() {
  isLoggingOut = true
  authToken = null
  refreshToken = null
  refreshPromise = null
}

export function notifyLogin() {
  isLoggingOut = false
}

async function parseResponse(response) {
  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { message: text }
    }
  }
  if (!isLoggingOut) {
    if (data?.accessToken) {
      setAuthToken(data.accessToken)
    }
    if (data?.refreshToken) {
      setRefreshToken(data.refreshToken)
    }
  }
  if (!response.ok) {
    const error = new Error(data?.message || "Request failed")
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

async function performRefresh() {
  if (isLoggingOut) {
    throw new Error("Logout in progress")
  }
  if (refreshPromise) {
    return refreshPromise
  }
  refreshPromise = (async () => {
    try {
      const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(refreshToken ? { "Content-Type": "application/json" } : {}),
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        ...(refreshToken ? { body: JSON.stringify({ refreshToken }) } : {}),
      })
      if (!refreshed.ok) {
        const error = new Error("Refresh failed")
        error.status = refreshed.status || 401
        throw error
      }
      const refreshData = await refreshed.json()
      if (isLoggingOut) {
        throw new Error("Logout in progress")
      }
      if (refreshData?.accessToken) {
        setAuthToken(refreshData.accessToken)
      }
      if (refreshData?.refreshToken) {
        setRefreshToken(refreshData.refreshToken)
      }
      return refreshData
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export async function apiRequest(path, options = {}) {
  if (isLoggingOut && path !== "/auth/logout") {
    const error = new Error("Logged out")
    error.status = 401
    throw error
  }

  const requestAuthToken = authToken
  const headers = {
    Accept: "application/json",
    ...(options.body && !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...options.headers,
  }
  if (organizationId) {
    headers["X-Organization-Id"] = organizationId
  }
  let response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
    body:
      options.body && typeof options.body === "object" && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  })

  if (response.status === 401 && !options._retry && !isLoggingOut) {
    if (path === "/auth/login" || path === "/auth/refresh" || path === "/auth/logout") {
      return parseResponse(response)
    }
    try {
      let refreshData = null
      if (authToken && authToken !== requestAuthToken) {
        refreshData = { accessToken: authToken }
      } else {
        refreshData = await performRefresh()
      }
      if (isLoggingOut) {
        return parseResponse(response)
      }
      const retryToken = refreshData?.accessToken || authToken
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          ...headers,
          ...(retryToken ? { Authorization: `Bearer ${retryToken}` } : {}),
        },
        credentials: "include",
        body:
          options.body &&
          typeof options.body === "object" &&
          !(options.body instanceof FormData)
            ? JSON.stringify(options.body)
            : options.body,
        _retry: true,
      })
    } catch {
      setAuthToken(null)
      setRefreshToken(null)
      if (onUnauthorized && !isLoggingOut) {
        onUnauthorized()
      }
    }
  }
  return parseResponse(response)
}

export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: "GET" }),
  post: (path, body, options) =>
    apiRequest(path, { ...options, method: "POST", body }),
  patch: (path, body, options) =>
    apiRequest(path, { ...options, method: "PATCH", body }),
  delete: (path, options) => apiRequest(path, { ...options, method: "DELETE" }),
}
