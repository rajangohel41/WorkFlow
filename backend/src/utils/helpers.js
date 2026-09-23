export function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

export function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2)
}

const palette = ["#6366F1", "#0EA5E9", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6"]

export function colorForId(id) {
  const str = String(id)
  let hash = 0
  for (let i = 0; i < str.length; i += 1) hash = (hash + str.charCodeAt(i)) % palette.length
  return palette[hash]
}

export function formatDue(date) {
  if (!date) return "Not set"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(date))
}

export function formatRelative(date) {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return "Yesterday"
}

export function canManageOrg(role) {
  return ["Owner", "Admin"].includes(role)
}

export function canManageProjects(role) {
  return ["Owner", "Admin", "Manager"].includes(role)
}

export function canWriteTasks(role) {
  return role !== "Viewer"
}
