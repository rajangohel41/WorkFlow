import path from "node:path"
import fs from "node:fs"
import { Readable } from "node:stream"
import { put, del, get, head } from "@vercel/blob"

const uploadDirectory = process.env.UPLOADS_DIR || "uploads"

/**
 * Check if Vercel Blob cloud object storage is configured
 * @returns {boolean}
 */
export function isBlobStorageConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

/**
 * Store a file attachment either to Vercel Blob (when configured) or local disk.
 * Vercel Blob attachments are always saved with 'private' access.
 *
 * @param {object} params
 * @param {string} params.originalname
 * @param {Buffer} [params.buffer]
 * @param {string} [params.filename]
 * @param {string} params.mimetype
 * @param {number} params.size
 * @returns {Promise<{ url: string, blobUrl?: string, name: string, size: number, mimeType: string }>}
 */
export async function storeAttachment({ originalname, buffer, filename: diskFilename, mimetype, size }) {
  const ext = path.extname(originalname).toLowerCase()
  const sanitizedBase = path
    .basename(originalname, ext)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 50)
  const uniqueName = diskFilename || `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitizedBase}${ext}`

  if (isBlobStorageConfigured() && buffer) {
    const blob = await put(uniqueName, buffer, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    return {
      name: originalname,
      url: `/uploads/${uniqueName}`,
      blobUrl: blob.url,
      size,
      mimeType: mimetype,
    }
  }

  // Local disk fallback (or when multer diskStorage already saved the file)
  if (buffer && !diskFilename) {
    if (!fs.existsSync(uploadDirectory)) {
      fs.mkdirSync(uploadDirectory, { recursive: true })
    }
    const localPath = path.resolve(uploadDirectory, uniqueName)
    fs.writeFileSync(localPath, buffer)
  }

  return {
    name: originalname,
    url: `/uploads/${uniqueName}`,
    size,
    mimeType: mimetype,
  }
}

/**
 * Stream a private blob to an Express response after authorization
 *
 * @param {string} blobUrl
 * @param {import("express").Response} res
 * @param {{ name?: string, mimeType?: string, size?: number }} [attachment]
 * @returns {Promise<boolean>}
 */
export async function streamPrivateBlob(blobUrl, res, attachment = {}) {
  try {
    const result = await get(blobUrl, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    if (!result || !result.stream) {
      return false
    }

    const filename = attachment.name || path.basename(blobUrl)
    const contentType = attachment.mimeType || result.blob.contentType || "application/octet-stream"

    res.setHeader("Content-Type", contentType)
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}"`,
    )
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate")
    res.setHeader("X-Content-Type-Options", "nosniff")
    if (result.blob.size) {
      res.setHeader("Content-Length", result.blob.size)
    }

    const nodeStream = Readable.fromWeb(result.stream)
    nodeStream.pipe(res)
    return true
  } catch (err) {
    console.error("[Storage] Error streaming private blob:", err.message)
    throw err
  }
}

/**
 * Verify blob existence and metadata in Vercel Blob store
 * @param {string} blobUrl
 * @returns {Promise<object>}
 */
export async function verifyBlob(blobUrl) {
  return await head(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN })
}

/**
 * Remove an attachment from storage (cloud blob or local disk)
 * @param {{ url?: string, blobUrl?: string }} attachment
 */
export async function removeAttachment(attachment) {
  if (!attachment) return

  if (attachment.blobUrl && isBlobStorageConfigured()) {
    try {
      await del(attachment.blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN })
      return
    } catch (err) {
      console.warn("[Storage] Blob deletion error:", err.message)
    }
  }

  if (attachment.url) {
    const filename = path.basename(attachment.url)
    const diskPath = path.resolve(uploadDirectory, filename)
    fs.unlink(diskPath, () => {})
  }
}

