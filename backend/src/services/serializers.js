import { initials, colorForId, formatDue, formatRelative } from "../utils/helpers.js"

export function serializeUser(user, role) {
  if (!user) return null
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    title: user.title || "",
    avatarUrl: user.avatarUrl || "",
    role: role || "Member",
    initials: initials(user.name),
    color: colorForId(user._id),
    preferences: user.preferences,
  }
}

export function serializeMember(user, membership, projectCount = 0) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    initials: initials(user.name),
    role: membership.role,
    color: colorForId(user._id),
    status: membership.status === "Active" ? "Online" : membership.status,
    projects: projectCount,
    last: formatRelative(membership.updatedAt || membership.createdAt),
  }
}

export async function serializeProject(project, tasks = [], userId) {
  const total = tasks.length
  const done = tasks.filter((t) => t.status === "Done").length
  return {
    id: project.slug,
    _id: project._id.toString(),
    name: project.name,
    icon: project.name[0]?.toUpperCase() || "P",
    color: project.color,
    description: project.description,
    status: project.status,
    progress: total ? Math.round((done / total) * 100) : 0,
    tasks: `${done} / ${total}`,
    due: formatDue(project.dueDate),
    members: project.memberIds?.map((id) => id.toString()) || [],
    favorite: project.favoriteBy?.some((id) => id.toString() === userId) || false,
    archived: project.archived,
  }
}

export function serializeTask(task, project, assignee, commentsList) {
  const assigneeId = task.assigneeId
    ? task.assigneeId.toString()
    : assignee?._id
      ? assignee._id.toString()
      : null
  return {
    id: task.displayId,
    displayId: task.displayId,
    _id: task._id.toString(),
    projectId: task.projectId.toString(),
    project: project?.name || "",
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    label: task.label,
    version: task.version || 1,
    assigneeId,
    assignee: assignee
      ? {
          id: assignee._id ? assignee._id.toString() : assigneeId,
          _id: assignee._id ? assignee._id.toString() : assigneeId,
          name: assignee.name,
          initials: initials(assignee.name),
          email: assignee.email,
          color: colorForId(assignee._id || assigneeId),
          role: "Member",
        }
      : null,
    due: formatDue(task.dueDate),
    dueDate: task.dueDate,
    comments: task.commentCount,
    files: task.attachments?.length || task.fileCount || 0,
    checklist: task.checklist?.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      done: item.done,
    })),
    attachments:
      task.attachments?.map((a) => ({
        id: a._id.toString(),
        name: a.name,
        url: a.url,
        size: a.size,
        mimeType: a.mimeType,
        uploadedBy: a.uploadedBy?.toString(),
        createdAt: a.createdAt,
      })) || [],
    commentsList: commentsList || [],
  }
}

export function serializeNotification(notification) {
  return {
    id: notification._id.toString(),
    title: notification.title,
    message: notification.message || notification.meta || notification.title,
    meta: notification.meta,
    unread: notification.unread,
    entityType: notification.entityType,
    entityId: notification.entityId?.toString(),
    organizationId: notification.organizationId?.toString(),
    createdAt: notification.createdAt,
  }
}

export function serializeActivity(activity, actor) {
  return {
    id: activity._id.toString(),
    person: actor
      ? {
          name: actor.name,
          initials: initials(actor.name),
          color: colorForId(actor._id),
        }
      : null,
    text: activity.text,
    target: activity.target,
    time: formatRelative(activity.createdAt),
  }
}

export function serializeEvent(event) {
  return {
    id: event._id.toString(),
    day: event.day,
    title: event.title,
    time: event.time,
    color: event.color,
    projectId: event.projectId?.toString(),
  }
}
