import { Grid2X2, List, Plus, Search, Star } from "lucide-react"
import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useAppStore } from "../../store/useAppStore.js"
import {
  useProjects,
  useTasks,
  useMembers,
  useWorkflowMutations,
} from "../../hooks/useWorkflowQueries.js"
import {
  AvatarGroup,
  Badge,
  Button,
  Card,
  IconButton,
  PageHeader,
  ProgressBar,
} from "../../components/ui/index.jsx"

export default function ProjectsPage() {
  const [view, setView] = useState("grid")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("All")
  const [sort, setSort] = useState("Name")
  const [params] = useSearchParams()

  const favorites = useAppStore((state) => state.favorites) || []
  const recent = useAppStore((state) => state.recent) || []

  const { data: projectsData, isLoading } = useProjects()
  const { data: tasksData } = useTasks()
  const { data: membersData } = useMembers()
  const { toggleFavorite } = useWorkflowMutations()

  const projects = projectsData?.projects || []
  const tasks = tasksData?.tasks || []
  const members = membersData?.members || []

  const filtered = projects
    .filter((project) =>
      project.name.toLowerCase().includes(query.toLowerCase()),
    )
    .filter((project) => status === "All" || project.status === status)
    .filter((project) =>
      params.get("view") === "favorites"
        ? (project.favorite || favorites.includes(project.id) || favorites.includes(project._id))
        : params.get("view") === "recent"
          ? recent.some((item) => item.id === project.id || item.id === project._id)
          : true,
    )
    .sort((a, b) =>
      sort === "Progress"
        ? (b.progress || 0) - (a.progress || 0)
        : a.name.localeCompare(b.name),
    )

  return (
    <div className="page">
      <PageHeader
        title="Projects"
        subtitle="Manage and track all your projects."
        actions={
          <Button
            icon={Plus}
            onClick={() => useAppStore.getState().setCreateModal("project")}
          >
            Create project
          </Button>
        }
      />
      <div className="toolbar">
        <label className="search-input">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects..."
          />
        </label>
        <select
          className="toolbar-select"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter project status"
        >
          <option>All</option>
          <option>Planning</option>
          <option>In Progress</option>
          <option>In Review</option>
          <option>On Track</option>
        </select>
        <select
          className="toolbar-select"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort projects"
        >
          <option>Name</option>
          <option>Progress</option>
        </select>
        <div className="view-switcher">
          <button
            className={view === "grid" ? "active" : ""}
            onClick={() => setView("grid")}
            aria-label="Grid view"
          >
            <Grid2X2 size={16} />
          </button>
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
            aria-label="List view"
          >
            <List size={17} />
          </button>
        </div>
      </div>
      {isLoading ? (
        <div className="loading-state">
          <p>Loading projects...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>No projects found</h3>
          <p>Create a project or adjust your search filters.</p>
          <Button
            icon={Plus}
            onClick={() => useAppStore.getState().setCreateModal("project")}
          >
            Create project
          </Button>
        </div>
      ) : (
        <div className={view === "grid" ? "project-grid" : "project-list"}>
          {filtered.map((project) => {
            const isFav =
              project.favorite ||
              favorites.includes(project.id) ||
              favorites.includes(project._id)
            const projectTaskCount = tasks.filter(
              (task) =>
                task.projectId === project._id ||
                task.projectId === project.id ||
                task.project === project.name,
            ).length
            const projectMembersList = (project.members || [])
              .map((mId) => {
                if (typeof mId === "object" && mId !== null) return mId
                return members.find(
                  (m) => m.id === mId || m.id === String(mId),
                )
              })
              .filter(Boolean)

            return (
              <Card className="project-card" key={project.id || project._id}>
                <div className="project-card-top">
                  <Link
                    to={`/projects/${project.id}`}
                    className="project-icon"
                    style={{
                      background: `${project.color || "#6366F1"}18`,
                      color: project.color || "#6366F1",
                    }}
                  >
                    {project.icon || project.name[0]}
                  </Link>
                  <Badge
                    tone={
                      project.status === "In Progress"
                        ? "info"
                        : project.status === "In Review"
                          ? "warning"
                          : "success"
                    }
                  >
                    {project.status}
                  </Badge>
                  <IconButton
                    label={isFav ? "Remove from favorites" : "Add to favorites"}
                    onClick={() => toggleFavorite.mutate(project.id)}
                  >
                    <Star
                      size={17}
                      fill={isFav ? "currentColor" : "none"}
                    />
                  </IconButton>
                </div>
                <div className="project-copy">
                  <Link to={`/projects/${project.id}`}>
                    <h3>{project.name}</h3>
                  </Link>
                  <p>{project.description || "No description provided."}</p>
                </div>
                <div className="project-progress">
                  <div>
                    <span>Progress</span>
                    <strong>{project.progress || 0}%</strong>
                  </div>
                  <ProgressBar
                    value={project.progress || 0}
                    color={project.color || "#6366F1"}
                  />
                </div>
                <div className="project-meta">
                  <span>
                    <small>Tasks</small>
                    <strong>{projectTaskCount} total</strong>
                  </span>
                  <span>
                    <small>Due date</small>
                    <strong>{project.due || "Not set"}</strong>
                  </span>
                  <AvatarGroup people={projectMembersList} />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
