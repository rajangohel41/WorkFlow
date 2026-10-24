import { api } from "../api/client.js"

export const taskService = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return api.get(`/tasks${query ? `?${query}` : ""}`)
  },
  getById: (taskId) => api.get(`/tasks/${taskId}`),
  create: (payload) => api.post("/tasks", payload),
  update: (taskId, payload) => api.patch(`/tasks/${taskId}`, payload),
  remove: (taskId) => api.delete(`/tasks/${taskId}`),
  duplicate: (taskId) => api.post(`/tasks/${taskId}/duplicate`),
  addComment: (taskId, text) =>
    api.post(`/tasks/${taskId}/comments`, { text }),
  deleteComment: (taskId, commentId) =>
    api.delete(`/tasks/${taskId}/comments/${commentId}`),
  getUploadIntent: (taskId, payload) =>
    api.post(`/tasks/${taskId}/attachments/upload-intent`, payload),
  completeAttachmentUpload: (taskId, payload) =>
    api.post(`/tasks/${taskId}/attachments/complete`, payload),
  uploadAttachment: async (taskId, formData, file) => {
    const actualFile = file || (formData instanceof FormData ? formData.get("file") : null)
    if (actualFile && (actualFile instanceof File || typeof actualFile.slice === "function")) {
      try {
        const intent = await api.post(`/tasks/${taskId}/attachments/upload-intent`, {
          filename: actualFile.name,
          mimeType: actualFile.type || "application/octet-stream",
          size: actualFile.size,
        })
        if (intent?.directUpload && intent?.clientToken && intent?.pathname) {
          const uploadRes = await fetch(`https://blob.vercel-storage.com/${intent.pathname}`, {
            method: "PUT",
            headers: {
              authorization: `Bearer ${intent.clientToken}`,
              "x-content-type": actualFile.type || "application/octet-stream",
            },
            body: actualFile,
          })
          if (!uploadRes.ok) {
            throw new Error(`Direct blob upload failed with status ${uploadRes.status}`)
          }
          const blobData = await uploadRes.json()
          return api.post(`/tasks/${taskId}/attachments/complete`, {
            name: actualFile.name,
            blobUrl: blobData.url,
            size: actualFile.size,
            mimeType: actualFile.type,
            pathname: intent.pathname,
          })
        }
      } catch (err) {
        console.warn("[Upload] Direct upload failed, falling back to standard upload:", err.message)
      }
    }
    return api.post(`/tasks/${taskId}/attachments`, formData)
  },
  deleteAttachment: (taskId, attachmentId) =>
    api.delete(`/tasks/${taskId}/attachments/${attachmentId}`),
}
