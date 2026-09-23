export const queryKeys = {
  me: ["auth", "me"],
  organizations: ["organizations"],
  projects: (params) => ["projects", params],
  project: (id) => ["project", id],
  tasks: (params) => ["tasks", params],
  task: (id) => ["task", id],
  members: ["members"],
  notifications: ["notifications"],
  dashboard: ["analytics", "dashboard"],
  analytics: ["analytics", "overview"],
  calendar: ["calendar"],
  search: (q) => ["search", q],
}
