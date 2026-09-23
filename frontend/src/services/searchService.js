import { api } from "../api/client.js"

export const searchService = {
  search: (q) => api.get(`/search?q=${encodeURIComponent(q)}`),
}
