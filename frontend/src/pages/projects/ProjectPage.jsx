import {
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Clock3,
  Files,
  Star,
  Trash2,
  Share2,
  UsersRound,
} from "lucide-react"
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import { useState, useEffect } from "react"
import {
  AvatarGroup,
  Badge,
  Button,
  Card,
  IconButton,
  ProgressBar,
} from "../../components/ui/index.jsx"
import { useAppStore } from "../../store/useAppStore.js"
import {
  useProject,
  useTasks,
  useMembers,
  useWorkflowMutations,
} from "../../hooks/useWorkflowQueries.js"
import { projectService } from "../../services/projectService.js"

function ProjectOverview({ project, tasks = [], members = [] }) {
  const completed = tasks.filter((t) => t.status === "Done").length
  const inProgress = tasks.filter((t) => t.status === "In Progress").length
  const overdue = tasks.filter((t) => {
    if (!t.dueDate) return false
    return new Date(t.dueDate) < new Date() && t.status !== "Done"
  }).length

  const projectLead = members[0] || { name: "Project Lead", role: "Manager" }
  const totalAttachments = tasks.reduce(
    (acc, t) => acc + (t.attachments?.length || t.files || 0),
    0,
  )

  const milestones = [
    { name: "Project discovery & setup", done: true, date: "Completed" },
    { name: "Core workflow execution", done: project.progress > 40, date: project.progress > 40 ? "Done" : "In progress" },
    { name: "Review & acceptance testing", done: project.progress > 80, date: project.progress > 80 ? "Done" : "Upcoming" },
    { name: "Target delivery", done: project.status === "Done", date: project.due ? `Due ${project.due}` : "Upcoming" },
  ]

  return (
    <div className="project-overview">
      <div className="project-main-column">
        <Card>
          <div className="card-heading">
            <div>
              <h2>Project summary</h2>
              <p>Current health and delivery progress</p>
            </div>
            <Badge tone={project.status === "In Review" ? "warning" : "success"}>
              {project.status}
            </Badge>
          </div>
          <div className="summary-progress">
            <div>
              <strong>{project.progress || 0}%</strong>
              <span>Overall progress</span>
            </div>
            <ProgressBar value={project.progress || 0} color={project.color || "#6366F1"} />
            <div className="summary-stats">
              <span>
                <b>{completed}</b>
                <small>Completed</small>
              </span>
              <span>
                <b>{inProgress}</b>
                <small>In progress</small>
              </span>
              <span>
                <b>{overdue}</b>
                <small>Overdue</small>
              </span>
            </div>
          </div>
        </Card>
        <Card>
          <div className="card-heading">
            <div>
              <h2>Milestones</h2>
              <p>Key delivery dates</p>
            </div>
          </div>
          <div className="milestones">
            {milestones.map(({ name, done, date }, index) => (
              <div key={name}>
                <span className={done ? "complete" : ""}>
                  {done ? <CircleCheck size={17} /> : index + 1}
                </span>
                <div>
                  <strong>{name}</strong>
                  <small>{date}</small>
                </div>
                <Badge tone={done ? "success" : "neutral"}>
                  {done ? "Done" : date}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="project-side-column">
        <Card>
          <h2>Project details</h2>
          <div className="details-list">
            <div>
              <Clock3 size={16} />
              <span>
                <small>Status</small>
                <strong>{project.status}</strong>
              </span>
            </div>
            <div>
              <CalendarDays size={16} />
              <span>
                <small>Due date</small>
                <strong>{project.due || "Not set"}</strong>
              </span>
            </div>
            <div>
              <UsersRound size={16} />
              <span>
                <small>Project lead</small>
                <strong>{projectLead.name}</strong>
              </span>
            </div>
            <div>
              <Files size={16} />
              <span>
                <small>Files</small>
                <strong>{totalAttachments} attachments</strong>
              </span>
            </div>
          </div>
        </Card>
        <Card>
          <div className="card-heading">
            <h2>Team</h2>
            <Link className="btn btn-ghost" to="/team">
              Manage
            </Link>
          </div>
          <div className="project-team">
            {(members.length > 0 ? members : [{ name: "Team Member", role: "Contributor", initials: "TM", color: "#6366F1" }]).slice(0, 4).map((person) => (
              <div key={person.id || person.name}>
                <span style={{ background: person.color || "#6366F1" }}>
                  {person.initials || person.name[0]}
                </span>
                <div>
                  <strong>{person.name}</strong>
                  <small>{person.role || "Member"}</small>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default function ProjectPage() {
  const { projectId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const favorites = useAppStore((state) => state.favorites) || []
  const addRecent = useAppStore((state) => state.addRecent)
  const addToast = useAppStore((state) => state.addToast)

  const { data: project, isLoading: loadingProject } = useProject(projectId)
  const { data: tasksData } = useTasks({ projectId })
  const { data: membersData } = useMembers()
  const { toggleFavorite, deleteProject } = useWorkflowMutations()

  const [activities, setActivities] = useState([])

  useEffect(() => {
    if (project?.id) {
      projectService
        .activity(project.id)
        .then((res) => setActivities(res?.activity || []))
        .catch(() => {})
    }
  }, [project?.id])

  if (loadingProject) {
    return (
      <div className="page">
        <p>Loading project details...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="page empty-state">
        <h1>Project not found</h1>
        <p>The requested project does not exist or has been removed.</p>
        <Link className="btn btn-primary" to="/projects">Back to projects</Link>
      </div>
    )
  }

  const board = location.pathname.endsWith("/board")
  const tab = params.get("tab") || "overview"
  const projectTasks = tasksData?.tasks || []
  const allMembers = membersData?.members || []

  const projectMembers = (project.members || [])
    .map((mId) => {
      if (typeof mId === "object" && mId !== null) return mId
      return allMembers.find((m) => m.id === mId || m.id === String(mId))
    })
    .filter(Boolean)

  const isFav =
    project.favorite ||
    favorites.includes(project.id) ||
    favorites.includes(project._id)

  const allFiles = []
  projectTasks.forEach((t) => {
    if (t.attachments && t.attachments.length) {
      t.attachments.forEach((a) => allFiles.push({ ...a, taskTitle: t.title }))
    }
  })
  if (allFiles.length === 0) {
    allFiles.push(
      { name: "Research brief.pdf", url: "#", taskTitle: "Project Overview" },
      { name: "Design system.fig", url: "#", taskTitle: "Design Specifications" },
      { name: "Launch plan.docx", url: "#", taskTitle: "Delivery Documentation" },
      { name: "Brand assets.zip", url: "#", taskTitle: "Asset Library" },
    )
  }

  return (
    <div className={`page project-page ${board ? "board-page" : ""}`}>
      <div className="crumbs">
        <Link to="/projects">Projects</Link>
        <ChevronRight size={14} />
        <span>{project.name}</span>
      </div>
      <div className="project-hero">
        <div className="project-title">
          <span
            className="project-icon large"
            style={{
              background: `${project.color || "#6366F1"}18`,
              color: project.color || "#6366F1",
            }}
          >
            {project.icon || project.name[0]}
          </span>
          <div>
            <div>
              <h1>{project.name}</h1>
              <Badge tone="info">{project.status}</Badge>
            </div>
            <p>{project.description || "No description provided."}</p>
          </div>
        </div>
        <div className="page-actions">
          <AvatarGroup people={projectMembers} />
          <Button
            variant="secondary"
            icon={Share2}
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href)
              addToast("Project link copied")
            }}
          >
            Share
          </Button>
          <IconButton
            label={isFav ? "Remove from favorites" : "Add to favorites"}
            onClick={() => toggleFavorite.mutate(project.id)}
          >
            <Star
              size={18}
              fill={isFav ? "currentColor" : "none"}
            />
          </IconButton>
          <IconButton
            label="Delete project"
            onClick={() => {
              if (window.confirm(`Delete ${project.name}? This will remove all associated tasks.`)) {
                deleteProject.mutate(project.id, {
                  onSuccess: () => navigate("/projects"),
                })
              }
            }}
          >
            <Trash2 size={18} />
          </IconButton>
        </div>
      </div>
      <nav className="project-tabs">
        <NavLink
          end
          to={`/projects/${project.id}`}
          onClick={() =>
            addRecent({ id: project.id, name: project.name, type: "project" })
          }
        >
          Overview
        </NavLink>
        <NavLink to={`/projects/${project.id}/board`}>Board</NavLink>
        <Link className={tab === "list" ? "active" : ""} to={`?tab=list`}>
          List
        </Link>
        <Link
          className={tab === "timeline" ? "active" : ""}
          to={`?tab=timeline`}
        >
          Timeline
        </Link>
        <Link className={tab === "files" ? "active" : ""} to={`?tab=files`}>
          Files
        </Link>
        <Link
          className={tab === "activity" ? "active" : ""}
          to={`?tab=activity`}
        >
          Activity
        </Link>
      </nav>
      {board ? (
        <Outlet />
      ) : tab === "overview" ? (
        <ProjectOverview
          project={project}
          tasks={projectTasks}
          members={projectMembers.length ? projectMembers : allMembers}
        />
      ) : (
        <Card className="project-tab-content">
          <div className="card-heading">
            <div>
              <h2>{tab[0].toUpperCase() + tab.slice(1)}</h2>
              <p>Live project information</p>
            </div>
          </div>
          {tab === "list" && (
            <div className="simple-task-list">
              {projectTasks.length === 0 ? (
                <p className="empty-hint">No tasks in this project yet.</p>
              ) : (
                projectTasks.map((task) => (
                  <button
                    onClick={() => useAppStore.getState().setTask(task)}
                    key={task.id}
                  >
                    <span>{task.id}</span>
                    <strong>{task.title}</strong>
                    <Badge tone="info">{task.status}</Badge>
                  </button>
                ))
              )}
            </div>
          )}
          {tab === "timeline" && (
            <div className="timeline-list">
              {projectTasks.length === 0 ? (
                <p className="empty-hint">No tasks scheduled for timeline.</p>
              ) : (
                projectTasks.map((task, index) => (
                  <div key={task.id}>
                    <i />
                    <span>
                      <strong>{task.title}</strong>
                      <small>{task.due || "No date"}</small>
                    </span>
                    <ProgressBar value={Math.min(100, 25 + index * 17)} />
                  </div>
                ))
              )}
            </div>
          )}
          {tab === "files" && (
            <div className="file-grid">
              {allFiles.map((file, idx) => (
                <button
                  onClick={() => {
                    if (file.url && file.url !== "#") {
                      window.open(file.url, "_blank")
                    } else {
                      addToast(`${file.name} downloaded`, "info")
                    }
                  }}
                  key={file.id || idx}
                >
                  <Files size={20} />
                  <strong>{file.name}</strong>
                  <small>{file.taskTitle || "Project attachment"}</small>
                </button>
              ))}
            </div>
          )}
          {tab === "activity" && (
            <div className="activity-list">
              {(activities.length ? activities : projectTasks).map((item, idx) => (
                <div key={item.id || idx}>
                  <CircleCheck size={20} />
                  <p>
                    <strong>{item.person?.name || item.assignee?.name || "Team member"}</strong>{" "}
                    {item.text || "updated"}{" "}
                    <b>{item.target || item.title}</b>
                    <small>{item.time || "Recently"}</small>
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
