const API_BASE = (() => {
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

export function setOrganizationId(id) {
  organizationId = id
}

export function getOrganizationId() {
  return organizationId
}

export function setAuthToken(token) {
  authToken = token
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
  if (data?.accessToken) {
    setAuthToken(data.accessToken)
  }
  if (data?.refreshToken) {
    setRefreshToken(data.refreshToken)
  }
  if (!response.ok) {
    const error = new Error(data?.message || "Request failed")
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

export async function apiRequest(path, options = {}) {
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
  if (response.status === 401 && !options._retry) {
    if (path === "/auth/login" || path === "/auth/refresh") {
      return parseResponse(response)
    }
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
      if (refreshed.ok) {
        const refreshData = await refreshed.json()
        if (refreshData?.accessToken) {
          setAuthToken(refreshData.accessToken)
        }
        if (refreshData?.refreshToken) {
          setRefreshToken(refreshData.refreshToken)
        }
        response = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers: {
            ...headers,
            ...(refreshData?.accessToken
              ? { Authorization: `Bearer ${refreshData.accessToken}` }
              : {}),
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
      } else {
        setAuthToken(null)
        if (onUnauthorized) {
          onUnauthorized()
        }
      }
    } catch {
      setAuthToken(null)
      if (onUnauthorized) {
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
