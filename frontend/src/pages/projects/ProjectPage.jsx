import {
  CalendarDays,
  Activity,
  ChevronRight,
  CircleCheck,
  Columns3,
  Clock3,
  Files,
  LayoutDashboard,
  List,
  Plus,
  Star,
  Trash2,
  Share2,
  UsersRound,
} from "lucide-react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useEffect } from "react";
import {
  AvatarGroup,
  Badge,
  Button,
  Card,
  IconButton,
  ProgressBar,
} from "../../components/ui/index.jsx";
import { useAppStore } from "../../store/useAppStore.js";
import { useDocumentTitle } from "../../hooks/useRouteTitle.js";
import {
  useProject,
  useTasks,
  useMembers,
  useMilestones,
  useWorkflowMutations,
} from "../../hooks/useWorkflowQueries.js";

function ProjectOverview({
  project,
  tasks = [],
  members = [],
  milestones = [],
  onAddMilestone,
  onUpdateMilestone,
}) {
  const totalTasks = tasks.length;
  const completed = tasks.filter((t) => t.status === "Done").length;
  const inProgress = tasks.filter((t) => t.status === "In Progress").length;
  const overdue = tasks.filter((t) => {
    if (!t.dueDate) return false;
    return new Date(t.dueDate) < new Date() && t.status !== "Done";
  }).length;
  const progress = totalTasks ? Math.round((completed / totalTasks) * 100) : 0;

  const projectLead = members[0];
  const totalAttachments = tasks.reduce(
    (acc, t) => acc + (t.attachments?.length || t.files || 0),
    0,
  );

  return (
    <div className="project-overview">
      <div className="project-main-column">
        <Card>
          <div className="card-heading">
            <div>
              <h2>Project summary</h2>
              <p>Current health and delivery progress</p>
            </div>
            <Badge
              tone={project.status === "In Review" ? "warning" : "success"}
            >
              {project.status}
            </Badge>
          </div>
          <div className="summary-progress">
            <div>
              <strong>{progress}%</strong>
              <span>Overall progress</span>
            </div>
            <ProgressBar value={progress} color={project.color || "#6366F1"} />
            <div className="summary-stats">
              <span>
                <b>{totalTasks}</b>
                <small>Total tasks</small>
              </span>
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
            <Button icon={Plus} variant="secondary" onClick={onAddMilestone}>
              Add milestone
            </Button>
          </div>
          <div className="milestones">
            {milestones.length === 0 ? (
              <p className="empty-hint">
                No milestones yet. Add the first delivery checkpoint.
              </p>
            ) : (
              milestones.map((milestone, index) => (
                <div key={milestone.id}>
                  <span
                    className={
                      milestone.status === "COMPLETED" ? "complete" : ""
                    }
                  >
                    {milestone.status === "COMPLETED" ? (
                      <CircleCheck size={17} />
                    ) : (
                      milestone.position || index + 1
                    )}
                  </span>
                  <div>
                    <strong>{milestone.title}</strong>
                    <small>
                      {milestone.dueDate
                        ? new Date(milestone.dueDate).toLocaleDateString()
                        : "Due date not set"}
                    </small>
                  </div>
                  <select
                    aria-label={`Status for ${milestone.title}`}
                    value={milestone.status}
                    onChange={(event) =>
                      onUpdateMilestone(milestone.id, {
                        status: event.target.value,
                      })
                    }
                  >
                    <option value="UPCOMING">Upcoming</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              ))
            )}
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
                <strong>{projectLead?.name || "Not assigned"}</strong>
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
            {members.slice(0, 4).map((person) => (
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
            {!members.length && (
              <p className="empty-hint">No project members assigned.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ProjectTabs({ projectId, addRecent, projectName }) {
  const tabs = [
    ["Overview", LayoutDashboard, `/projects/${projectId}`],
    ["Board", Columns3, `/projects/${projectId}/board`],
    ["List", List, `/projects/${projectId}/list`],
    ["Timeline", CalendarDays, `/projects/${projectId}/timeline`],
    ["Files", Files, `/projects/${projectId}/files`],
    ["Activity", Activity, `/projects/${projectId}/activity`],
  ];

  return (
    <nav className="project-tabs" aria-label="Project views">
      {tabs.map(([label, Icon, to]) => (
        <NavLink
          end={label === "Overview"}
          key={label}
          to={to}
          onClick={
            label === "Overview"
              ? () =>
                  addRecent({
                    id: projectId,
                    name: projectName,
                    type: "project",
                  })
              : undefined
          }
        >
          <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function ProjectPage() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const favorites = useAppStore((state) => state.favorites) || [];
  const addRecent = useAppStore((state) => state.addRecent);
  const addToast = useAppStore((state) => state.addToast);

  const { data: project, isLoading: loadingProject } = useProject(projectId);
  const { data: tasksData } = useTasks({ projectId });
  const { data: membersData } = useMembers();
  const { data: milestonesData } = useMilestones(projectId);
  const { toggleFavorite, deleteProject, createMilestone, updateMilestone } =
    useWorkflowMutations();

  useDocumentTitle(project?.name);

  useEffect(() => {
    if (project) {
      addRecent({ id: project.id, name: project.name, type: "project" });
    }
  }, [addRecent, project?.id, project?.name]);

  if (loadingProject) {
    return (
      <div className="page">
        <p>Loading project details...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="page empty-state">
        <h1>Project not found</h1>
        <p>The requested project does not exist or has been removed.</p>
        <Link className="btn btn-primary" to="/projects">
          Back to projects
        </Link>
      </div>
    );
  }

  const board = location.pathname.endsWith("/board");
  const isOverview = location.pathname === `/projects/${project.id}`;
  const projectTasks = tasksData?.tasks || [];
  const milestones = milestonesData?.milestones || [];
  const allMembers = membersData?.members || [];

  const projectMembers = (project.members || [])
    .map((mId) => {
      if (typeof mId === "object" && mId !== null) return mId;
      return allMembers.find((m) => m.id === mId || m.id === String(mId));
    })
    .filter(Boolean);

  const isFav =
    project.favorite ||
    favorites.includes(project.id) ||
    favorites.includes(project._id);

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
              navigator.clipboard?.writeText(window.location.href);
              addToast("Project link copied");
            }}
          >
            Share
          </Button>
          <IconButton
            label={isFav ? "Remove from favorites" : "Add to favorites"}
            onClick={() => toggleFavorite.mutate(project.id)}
          >
            <Star size={18} fill={isFav ? "currentColor" : "none"} />
          </IconButton>
          <IconButton
            label="Delete project"
            onClick={() => {
              if (
                window.confirm(
                  `Delete ${project.name}? This will remove all associated tasks.`,
                )
              ) {
                deleteProject.mutate(project.id, {
                  onSuccess: () => navigate("/projects"),
                });
              }
            }}
          >
            <Trash2 size={18} />
          </IconButton>
        </div>
      </div>
      <ProjectTabs
        projectId={project.id}
        projectName={project.name}
        addRecent={addRecent}
      />
      {isOverview ? (
        <ProjectOverview
          project={project}
          tasks={projectTasks}
          members={projectMembers.length ? projectMembers : allMembers}
          milestones={milestones}
          onAddMilestone={() => {
            const title = window.prompt("Milestone title");
            if (title?.trim()) {
              createMilestone.mutate({
                projectId,
                payload: { title: title.trim() },
              });
            }
          }}
          onUpdateMilestone={(milestoneId, payload) =>
            updateMilestone.mutate({ projectId, milestoneId, payload })
          }
        />
      ) : (
        <Outlet />
      )}
    </div>
  );
}
