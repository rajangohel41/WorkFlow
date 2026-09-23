import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAppStore } from "../../store/useAppStore.js"
import {
  useTasks,
  useProjects,
  useMembers,
  useWorkflowMutations,
} from "../../hooks/useWorkflowQueries.js"
import {
  Avatar,
  Badge,
  Button,
  IconButton,
  PageHeader,
} from "../../components/ui/index.jsx"

const statusTone = {
  "In Progress": "info",
  Todo: "neutral",
  "In Review": "warning",
  Backlog: "neutral",
  Done: "success",
}
const pageSize = 5

export default function TasksPage() {
  const [params] = useSearchParams()
  const user = useAppStore((state) => state.user)
  const setTask = useAppStore((state) => state.setTask)
  const setCreateModal = useAppStore((state) => state.setCreateModal)
  const addToast = useAppStore((state) => state.addToast)

  const { data: tasksData } = useTasks()
  const { data: projectsData } = useProjects()
  const { data: membersData } = useMembers()
  const { updateTask, deleteTask } = useWorkflowMutations()

  const tasks = tasksData?.tasks || []
  const projects = projectsData?.projects || []
  const members = membersData?.members || []

  const [tab, setTab] = useState(
    params.get("view") === "mine" ? "My Tasks" : "All",
  )
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    search: "",
    status: "All",
    priority: "All",
    assignee: "All",
    project: "All",
    sort: "Name",
  })

  const filtered = useMemo(
    () =>
      tasks
        .filter((task) => tab !== "Completed" || task.status === "Done")
        .filter(
          (task) =>
            tab !== "My Tasks" ||
            (task.assignee?.email === user?.email ||
              task.assignee?.name === user?.name ||
              task.assignee?.name === "Alex Kumar"),
        )
        .filter(
          (task) =>
            tab !== "Assigned" ||
            (task.assignee &&
              task.assignee?.email !== user?.email &&
              task.assignee?.name !== user?.name),
        )
        .filter(
          (task) =>
            task.title.toLowerCase().includes(filters.search.toLowerCase()) ||
            task.id.toLowerCase().includes(filters.search.toLowerCase()),
        )
        .filter(
          (task) => filters.status === "All" || task.status === filters.status,
        )
        .filter(
          (task) =>
            filters.priority === "All" || task.priority === filters.priority,
        )
        .filter(
          (task) =>
            filters.assignee === "All" ||
            task.assignee?.name === filters.assignee,
        )
        .filter(
          (task) =>
            filters.project === "All" ||
            task.project === filters.project ||
            task.projectId === filters.project,
        )
        .sort((a, b) =>
          filters.sort === "Due date"
            ? String(a.due || "").localeCompare(String(b.due || ""))
            : filters.sort === "Priority"
              ? ["Urgent", "High", "Medium", "Low"].indexOf(a.priority) -
                ["Urgent", "High", "Medium", "Low"].indexOf(b.priority)
              : a.title.localeCompare(b.title),
        ),
    [tasks, tab, filters, user],
  )

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize)

  const changeFilter = (key, value) => {
    setFilters((state) => ({ ...state, [key]: value }))
    setPage(1)
  }

  const bulkUpdate = (updates) => {
    selected.forEach((id) => updateTask.mutate({ id, payload: updates }))
    addToast(`${selected.length} tasks updated`)
    setSelected([])
  }

  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )

  return (
    <div className="page">
      <PageHeader
        title="Tasks"
        subtitle="Track, prioritize, and complete work across your projects."
        actions={
          <Button icon={Plus} onClick={() => setCreateModal("task")}>
            Create task
          </Button>
        }
      />
      <div className="task-tabs">
        <div>
          {["All", "My Tasks", "Assigned", "Completed"].map((name) => (
            <button
              className={tab === name ? "active" : ""}
              onClick={() => {
                setTab(name)
                setPage(1)
              }}
              key={name}
            >
              {name}
              {name === "All" && <span>{tasks.length}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="toolbar task-toolbar">
        <label className="search-input">
          <Search size={16} />
          <input
            value={filters.search}
            onChange={(event) => changeFilter("search", event.target.value)}
            placeholder="Search tasks..."
          />
        </label>
        <select
          className="toolbar-select"
          value={filters.status}
          onChange={(event) => changeFilter("status", event.target.value)}
          aria-label="Status filter"
        >
          <option>All</option>
          {["Backlog", "Todo", "In Progress", "In Review", "Done"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
        <select
          className="toolbar-select"
          value={filters.priority}
          onChange={(event) => changeFilter("priority", event.target.value)}
          aria-label="Priority filter"
        >
          <option>All</option>
          {["Low", "Medium", "High", "Urgent"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          className="toolbar-select"
          value={filters.assignee}
          onChange={(event) => changeFilter("assignee", event.target.value)}
          aria-label="Assignee filter"
        >
          <option>All</option>
          {members.map((member) => (
            <option key={member.id || member.email}>{member.name}</option>
          ))}
        </select>
        <select
          className="toolbar-select"
          value={filters.project}
          onChange={(event) => changeFilter("project", event.target.value)}
          aria-label="Project filter"
        >
          <option>All</option>
          {projects.map((project) => (
            <option key={project.id || project._id}>{project.name}</option>
          ))}
        </select>
        <select
          className="toolbar-select"
          value={filters.sort}
          onChange={(event) => changeFilter("sort", event.target.value)}
          aria-label="Sort tasks"
        >
          <option>Name</option>
          <option>Due date</option>
          <option>Priority</option>
        </select>
        <Button
          variant="ghost"
          onClick={() =>
            setFilters({
              search: "",
              status: "All",
              priority: "All",
              assignee: "All",
              project: "All",
              sort: "Name",
            })
          }
        >
          Clear filters
        </Button>
      </div>
      {selected.length > 0 && (
        <div className="bulk-bar">
          <strong>{selected.length} selected</strong>
          <select
            aria-label="Bulk status"
            onChange={(event) =>
              event.target.value && bulkUpdate({ status: event.target.value })
            }
          >
            <option value="">Change status</option>
            <option>Backlog</option>
            <option>Todo</option>
            <option>In Progress</option>
            <option>In Review</option>
            <option>Done</option>
          </select>
          <select
            aria-label="Bulk priority"
            onChange={(event) =>
              event.target.value && bulkUpdate({ priority: event.target.value })
            }
          >
            <option value="">Change priority</option>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Urgent</option>
          </select>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm(`Delete ${selected.length} tasks?`)) {
                selected.forEach((id) => deleteTask.mutate(id))
                setSelected([])
              }
            }}
          >
            Delete
          </Button>
        </div>
      )}
      <div className="table-card task-table">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={
                    shown.length > 0 &&
                    shown.every((task) => selected.includes(task.id))
                  }
                  onChange={() =>
                    setSelected(
                      shown.every((task) => selected.includes(task.id))
                        ? []
                        : shown.map((task) => task.id),
                    )
                  }
                  aria-label="Select visible tasks"
                />
              </th>
              <th>Task</th>
              <th>Project</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Assignee</th>
              <th>Due date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((task) => (
              <tr key={task.id} onClick={() => setTask(task)}>
                <td onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.includes(task.id)}
                    onChange={() => toggle(task.id)}
                    aria-label={`Select ${task.title}`}
                  />
                </td>
                <td>
                  <small>{task.id}</small>
                  <strong>{task.title}</strong>
                </td>
                <td>{task.project || "General"}</td>
                <td>
                  <Badge tone={statusTone[task.status] || "neutral"}>{task.status}</Badge>
                </td>
                <td>
                  <span className={`priority ${(task.priority || "medium").toLowerCase()}`}>
                    <i />
                    {task.priority || "Medium"}
                  </span>
                </td>
                <td>
                  <div className="inline-person">
                    <Avatar person={task.assignee} size="xs" />
                    <span>{task.assignee?.name || "Unassigned"}</span>
                  </div>
                </td>
                <td>{task.due || "No date"}</td>
                <td>
                  <IconButton
                    label={`Open ${task.title}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setTask(task)
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div className="empty-state">
            <h3>No tasks</h3>
            <p>No tasks match your filters.</p>
            <Button
              variant="secondary"
              onClick={() =>
                setFilters({
                  search: "",
                  status: "All",
                  priority: "All",
                  assignee: "All",
                  project: "All",
                  sort: "Name",
                })
              }
            >
              Clear filters
            </Button>
          </div>
        )}
        <div className="pagination">
          <span>
            Showing {shown.length ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(page * pageSize, filtered.length)} of {filtered.length}{" "}
            tasks
          </span>
          <div>
            <Button
              variant="secondary"
              icon={ChevronLeft}
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            {Array.from({ length: pages }, (_, index) => (
              <button
                className={`page-number ${page === index + 1 ? "active" : ""}`}
                onClick={() => setPage(index + 1)}
                key={index + 1}
              >
                {index + 1}
              </button>
            ))}
            <Button
              variant="secondary"
              disabled={page === pages}
              onClick={() => setPage(page + 1)}
            >
              Next <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
