/**
 * Shared task status authorization helper for frontend UI components.
 * ONLY the task's currently assigned user may change its status.
 * If a task is unassigned, nobody can change its status until assigned.
 */
export function getTaskStatusPermission(task, user) {
  if (!task) return { canChange: false, reason: "", isUnassigned: true }

  const hasAssignee = Boolean(
    task.assigneeId ||
    task.assignee?.id ||
    task.assignee?._id ||
    task.assignee?.email
  )

  if (!hasAssignee) {
    return {
      canChange: false,
      reason: "Assign this task before changing its status",
      isUnassigned: true,
    }
  }

  const userId = user?.id || user?._id
  const userEmail = user?.email?.toLowerCase()

  const matchesId = Boolean(
    userId && (
      task.assigneeId === userId ||
      task.assignee?.id === userId ||
      task.assignee?._id === userId
    )
  )

  const matchesEmail = Boolean(
    userEmail &&
    task.assignee?.email &&
    task.assignee.email.toLowerCase() === userEmail
  )

  if (matchesId || matchesEmail) {
    return { canChange: true, reason: "", isUnassigned: false }
  }

  return {
    canChange: false,
    reason: "Only the assigned team member can change this task's status.",
    isUnassigned: false,
  }
}
