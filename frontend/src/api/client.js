const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

let organizationId = null
let onUnauthorized = null

export function setOrganizationId(id) {
  organizationId = id
}

export function getOrganizationId() {
  return organizationId
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
    const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
    if (refreshed.ok) {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        credentials: "include",
        body:
          options.body &&
          typeof options.body === "object" &&
          !(options.body instanceof FormData)
            ? JSON.stringify(options.body)
            : options.body,
        _retry: true,
      })
    } else if (onUnauthorized) {
      onUnauthorized()
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
