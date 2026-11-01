import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Workflow,
  LayoutDashboard,
  Kanban,
  FolderGit2,
  CheckSquare,
  BarChart3,
  Users,
  Shield,
  ArrowLeft,
  Search,
  Sparkles,
  ArrowRight,
  Clock,
  MessageSquare,
  ListChecks,
  AlertCircle,
  X,
  Lock,
} from "lucide-react";
import {
  DEMO_ORGANIZATION,
  DEMO_MEMBERS,
  DEMO_PROJECTS,
  DEMO_TASKS,
  DEMO_ANALYTICS,
} from "../../data/demoData.js";
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Card,
  ProgressBar,
} from "../../components/ui/index.jsx";

const KANBAN_COLUMNS = [
  { id: "Backlog", label: "Backlog", tone: "neutral" },
  { id: "Todo", label: "To Do", tone: "info" },
  { id: "In Progress", label: "In Progress", tone: "purple" },
  { id: "In Review", label: "In Review", tone: "warning" },
  { id: "Done", label: "Done", tone: "success" },
];

export default function DemoPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPriority, setSelectedPriority] = useState("All");
  const [selectedTask, setSelectedTask] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  const showReadOnlyNotice = () => {
    setToastMessage("Demo mode is read-only. Create an account to customize and manage live projects!");
    setTimeout(() => setToastMessage(""), 4000);
  };

  const filteredTasks = useMemo(() => {
    return DEMO_TASKS.filter((task) => {
      const matchesSearch =
        searchQuery === "" ||
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.displayId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.projectName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority =
        selectedPriority === "All" || task.priority === selectedPriority;
      return matchesSearch && matchesPriority;
    });
  }, [searchQuery, selectedPriority]);

  return (
    <div className="demo-page-container">
      {/* Top Banner: Public Live Demo – Sample Data */}
      <div className="demo-live-banner" role="status">
        <div className="demo-live-banner-content">
          <div className="demo-badge-wrap">
            <span className="demo-pulse-dot" />
            <span className="demo-pill">Live Demo – Sample Data</span>
          </div>
          <p className="demo-banner-text">
            Exploring an isolated, read-only preview of <strong>{DEMO_ORGANIZATION.name}</strong>. No account required.
          </p>
        </div>
        <div className="demo-banner-actions">
          <Link to="/" className="btn btn-secondary demo-banner-btn">
            <ArrowLeft size={14} /> Back to Landing Page
          </Link>
          <Link to="/login" className="btn btn-secondary demo-banner-btn">
            Log In
          </Link>
          <Link to="/signup" className="btn btn-primary demo-banner-btn">
            Create Account <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Demo App Header */}
      <header className="demo-navbar">
        <div className="demo-nav-left">
          <div className="demo-brand">
            <span>
              <Workflow size={20} />
            </span>
            <strong>WorkFlow</strong>
          </div>
          <div className="demo-org-tag">
            <span className="demo-org-avatar">WF</span>
            <div className="demo-org-meta">
              <strong>{DEMO_ORGANIZATION.name}</strong>
              <small>{DEMO_ORGANIZATION.plan} Workspace</small>
            </div>
          </div>
        </div>

        <nav className="demo-tabs" aria-label="Demo Views">
          <button
            type="button"
            className={`demo-tab ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            <LayoutDashboard size={16} />
            <span>Overview</span>
          </button>
          <button
            type="button"
            className={`demo-tab ${activeTab === "kanban" ? "active" : ""}`}
            onClick={() => setActiveTab("kanban")}
          >
            <Kanban size={16} />
            <span>Kanban Board</span>
          </button>
          <button
            type="button"
            className={`demo-tab ${activeTab === "projects" ? "active" : ""}`}
            onClick={() => setActiveTab("projects")}
          >
            <FolderGit2 size={16} />
            <span>Projects</span>
          </button>
          <button
            type="button"
            className={`demo-tab ${activeTab === "tasks" ? "active" : ""}`}
            onClick={() => setActiveTab("tasks")}
          >
            <CheckSquare size={16} />
            <span>Tasks</span>
          </button>
          <button
            type="button"
            className={`demo-tab ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => setActiveTab("analytics")}
          >
            <BarChart3 size={16} />
            <span>Analytics</span>
          </button>
          <button
            type="button"
            className={`demo-tab ${activeTab === "team" ? "active" : ""}`}
            onClick={() => setActiveTab("team")}
          >
            <Users size={16} />
            <span>Team</span>
          </button>
        </nav>

        <div className="demo-nav-right">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={showReadOnlyNotice}
            title="Create Task (Demo is Read-Only)"
          >
            <Sparkles size={14} /> New Task
          </button>
        </div>
      </header>

      {/* Main Demo Content */}
      <main className="demo-main-body">
        {/* VIEW 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="demo-view demo-overview-view">
            {/* KPI Cards */}
            <div className="kpi-grid">
              {DEMO_ANALYTICS.kpis.map((kpi) => (
                <Card key={kpi.title} className="kpi-card">
                  <div className="kpi-top">
                    <span className="kpi-icon blue">
                      <BarChart3 size={18} />
                    </span>
                    <span className={`badge badge-${kpi.trend === "positive" ? "success" : "info"}`}>
                      {kpi.change}
                    </span>
                  </div>
                  <p>{kpi.title}</p>
                  <div className="kpi-value">
                    <strong>{kpi.value}</strong>
                  </div>
                  <small>{kpi.subtext}</small>
                </Card>
              ))}
            </div>

            {/* Dashboard 2-column grid */}
            <div className="dashboard-grid">
              {/* Left Column: Projects Progress */}
              <Card className="progress-card">
                <div className="card-heading">
                  <div>
                    <h2>Active Projects</h2>
                    <p>Current delivery progress across engineering initiatives</p>
                  </div>
                  <Button
                    variant="secondary"
                    className="btn-sm"
                    onClick={() => setActiveTab("projects")}
                  >
                    View all projects
                  </Button>
                </div>
                <div className="project-progress-list">
                  {DEMO_PROJECTS.map((proj) => (
                    <div key={proj.id} className="demo-proj-progress-item">
                      <div>
                        <span
                          className="project-mini-icon"
                          style={{
                            background: `${proj.color}18`,
                            color: proj.color,
                          }}
                        >
                          {proj.key}
                        </span>
                        <span>
                          <strong>{proj.title}</strong>
                          <small>Due {proj.dueDate}</small>
                        </span>
                        <b>{proj.progress}%</b>
                      </div>
                      <ProgressBar value={proj.progress} color={proj.color} />
                    </div>
                  ))}
                </div>
              </Card>

              {/* Right Column: Recent Activity Feed */}
              <Card className="activity-card">
                <div className="card-heading">
                  <div>
                    <h2>Live Activity Stream</h2>
                    <p>Real-time team collaboration updates</p>
                  </div>
                </div>
                <div className="activity-list">
                  {DEMO_ANALYTICS.activityFeed.map((item, index) => (
                    <div key={index} className="demo-activity-row">
                      <div className="activity-avatar">
                        <Avatar
                          person={{
                            name: item.user,
                            color: index % 2 === 0 ? "#6366F1" : "#0EA5E9",
                          }}
                          size="xs"
                        />
                        <i />
                      </div>
                      <p>
                        <strong>{item.user}</strong> {item.action} <b>{item.target}</b> {item.detail}
                        <small>{item.time}</small>
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* VIEW 2: KANBAN BOARD */}
        {activeTab === "kanban" && (
          <div className="demo-view demo-kanban-view">
            {/* Toolbar */}
            <div className="toolbar demo-toolbar">
              <div className="search-input">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Filter tasks by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="demo-filter-group">
                <label className="demo-filter-label">Priority:</label>
                <select
                  className="toolbar-select"
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                >
                  <option value="All">All Priorities</option>
                  <option value="Urgent">Urgent</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="demo-toolbar-right">
                <Badge tone="neutral">
                  <Lock size={12} /> Read-Only Mode
                </Badge>
              </div>
            </div>

            {/* Kanban Columns */}
            <div className="demo-kanban-board">
              {KANBAN_COLUMNS.map((col) => {
                const colTasks = filteredTasks.filter(
                  (task) => task.status === col.id
                );
                return (
                  <div key={col.id} className="demo-kanban-column">
                    <header className="demo-column-header">
                      <div className="demo-col-title-wrap">
                        <Badge tone={col.tone}>{col.label}</Badge>
                        <span className="demo-col-count">{colTasks.length}</span>
                      </div>
                    </header>

                    <div className="demo-column-cards">
                      {colTasks.length === 0 ? (
                        <div className="demo-empty-col">
                          <small>No tasks in this lane</small>
                        </div>
                      ) : (
                        colTasks.map((task) => (
                          <div
                            key={task.id}
                            className="demo-task-card"
                            onClick={() => setSelectedTask(task)}
                            tabIndex={0}
                            role="button"
                            onKeyDown={(e) => e.key === "Enter" && setSelectedTask(task)}
                          >
                            <div className="demo-task-card-top">
                              <span className="demo-task-id">{task.displayId}</span>
                              <Badge
                                tone={
                                  task.priority === "Urgent"
                                    ? "error"
                                    : task.priority === "High"
                                      ? "warning"
                                      : task.priority === "Medium"
                                        ? "info"
                                        : "neutral"
                                }
                              >
                                {task.priority}
                              </Badge>
                            </div>
                            <h4 className="demo-task-title">{task.title}</h4>
                            <p className="demo-task-proj">{task.projectName}</p>
                            <div className="demo-task-meta">
                              <div className="demo-task-indicators">
                                <span title="Checklist progress">
                                  <ListChecks size={13} />
                                  {task.checklists.completed}/{task.checklists.total}
                                </span>
                                <span title="Comments count">
                                  <MessageSquare size={13} />
                                  {task.commentsCount}
                                </span>
                              </div>
                              <Avatar person={task.assignee} size="xs" />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 3: PROJECTS */}
        {activeTab === "projects" && (
          <div className="demo-view demo-projects-view">
            <div className="page-header">
              <div>
                <h1>Sample Projects Portfolio</h1>
                <p>Enterprise workspaces and active initiatives</p>
              </div>
              <Button variant="primary" onClick={showReadOnlyNotice}>
                + New Project
              </Button>
            </div>

            <div className="project-grid">
              {DEMO_PROJECTS.map((project) => (
                <Card key={project.id} className="project-card demo-proj-card">
                  <div className="project-card-top">
                    <span
                      className="project-icon"
                      style={{
                        background: `${project.color}15`,
                        color: project.color,
                      }}
                    >
                      {project.key}
                    </span>
                    <Badge tone="success">Active</Badge>
                  </div>
                  <div className="project-copy">
                    <h3>{project.title}</h3>
                    <p>{project.description}</p>
                  </div>
                  <div className="project-progress">
                    <div>
                      <span>Progress</span>
                      <strong>{project.progress}%</strong>
                    </div>
                    <ProgressBar value={project.progress} color={project.color} />
                  </div>
                  <div className="project-meta">
                    <span>
                      <small>Due Date</small>
                      <strong>{project.dueDate}</strong>
                    </span>
                    <span>
                      <small>Tasks</small>
                      <strong>{project.completedTasks} / {project.totalTasks}</strong>
                    </span>
                    <AvatarGroup people={project.members} max={3} />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: TASKS */}
        {activeTab === "tasks" && (
          <div className="demo-view demo-tasks-view">
            <div className="page-header">
              <div>
                <h1>Tasks & Deliverables</h1>
                <p>Granular task tracking with status and assignee mapping</p>
              </div>
              <div className="toolbar">
                <div className="search-input">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  className="toolbar-select"
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                >
                  <option value="All">All Priorities</option>
                  <option value="Urgent">Urgent</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <Card className="table-card">
              <div className="demo-table-wrap">
                <table className="demo-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Project</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Assignee</th>
                      <th>Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((task) => (
                      <tr
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className="demo-clickable-row"
                      >
                        <td>
                          <div className="demo-table-task-cell">
                            <span className="demo-task-id">{task.displayId}</span>
                            <strong>{task.title}</strong>
                          </div>
                        </td>
                        <td>
                          <small className="demo-table-proj">{task.projectName}</small>
                        </td>
                        <td>
                          <Badge
                            tone={
                              task.status === "Done"
                                ? "success"
                                : task.status === "In Progress"
                                  ? "purple"
                                  : task.status === "In Review"
                                    ? "warning"
                                    : "info"
                            }
                          >
                            {task.status}
                          </Badge>
                        </td>
                        <td>
                          <Badge
                            tone={
                              task.priority === "Urgent"
                                ? "error"
                                : task.priority === "High"
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            {task.priority}
                          </Badge>
                        </td>
                        <td>
                          <div className="demo-assignee-cell">
                            <Avatar person={task.assignee} size="xs" />
                            <span>{task.assignee.name}</span>
                          </div>
                        </td>
                        <td>
                          <small>{task.dueDate}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* VIEW 5: ANALYTICS */}
        {activeTab === "analytics" && (
          <div className="demo-view demo-analytics-view">
            <div className="page-header">
              <div>
                <h1>Productivity & Sprint Analytics</h1>
                <p>Team throughput, workload distribution, and milestone velocity</p>
              </div>
            </div>

            <div className="kpi-grid">
              {DEMO_ANALYTICS.kpis.map((kpi) => (
                <Card key={kpi.title} className="kpi-card">
                  <div className="kpi-top">
                    <span className="kpi-icon green">
                      <BarChart3 size={18} />
                    </span>
                    <span className="badge badge-success">{kpi.change}</span>
                  </div>
                  <p>{kpi.title}</p>
                  <div className="kpi-value">
                    <strong>{kpi.value}</strong>
                  </div>
                  <small>{kpi.subtext}</small>
                </Card>
              ))}
            </div>

            <div className="dashboard-grid" style={{ marginTop: "24px" }}>
              {/* Task Status Distribution */}
              <Card className="completion-card">
                <div className="card-heading">
                  <h2>Status Distribution</h2>
                  <p>Overall state of all deliverables</p>
                </div>
                <div className="demo-distribution-list">
                  {DEMO_ANALYTICS.statusBreakdown.map((item) => (
                    <div key={item.status} className="demo-distribution-item">
                      <div className="demo-dist-meta">
                        <span className="demo-dist-name">
                          <i style={{ background: item.color }} />
                          {item.status}
                        </span>
                        <strong>{item.count} tasks</strong>
                      </div>
                      <ProgressBar
                        value={(item.count / 112) * 100}
                        color={item.color}
                      />
                    </div>
                  ))}
                </div>
              </Card>

              {/* Workload Distribution */}
              <Card className="workload-card">
                <div className="card-heading">
                  <h2>Team Workload</h2>
                  <p>Active task allocations per engineer</p>
                </div>
                <div className="workload-list">
                  {DEMO_MEMBERS.map((member) => (
                    <div key={member.id}>
                      <Avatar person={member} size="sm" />
                      <span>
                        <strong>{member.name}</strong>
                        <small>{member.department}</small>
                      </span>
                      <div>
                        <ProgressBar
                          value={(member.activeTasks / 8) * 100}
                          color={member.color}
                        />
                        <small>{member.activeTasks} tasks</small>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* VIEW 6: TEAM */}
        {activeTab === "team" && (
          <div className="demo-view demo-team-view">
            <div className="page-header">
              <div>
                <h1>Organization Team Members</h1>
                <p>Role-based access control and workspace contributors</p>
              </div>
              <Button variant="primary" onClick={showReadOnlyNotice}>
                + Invite Member
              </Button>
            </div>

            <div className="project-grid">
              {DEMO_MEMBERS.map((member) => (
                <Card key={member.id} className="demo-member-card">
                  <div className="demo-member-top">
                    <Avatar person={member} size="md" />
                    <Badge
                      tone={
                        member.role === "Owner"
                          ? "purple"
                          : member.role === "Admin"
                            ? "info"
                            : member.role === "Manager"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {member.role}
                    </Badge>
                  </div>
                  <h3 className="demo-member-name">{member.name}</h3>
                  <p className="demo-member-dept">{member.department}</p>
                  <small className="demo-member-email">{member.email}</small>

                  <div className="demo-member-footer">
                    <span>
                      <small>Assigned Tasks</small>
                      <strong>{member.activeTasks} Active</strong>
                    </span>
                    <Button
                      variant="secondary"
                      className="btn-sm"
                      onClick={showReadOnlyNotice}
                    >
                      Profile
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Task Detail Modal (Read-Only Preview) */}
      {selectedTask && (
        <div
          className="overlay"
          role="presentation"
          onMouseDown={() => setSelectedTask(null)}
        >
          <div
            className="modal demo-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header>
              <div className="demo-modal-title-wrap">
                <Badge tone="purple">{selectedTask.displayId}</Badge>
                <h2>{selectedTask.title}</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedTask(null)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </header>

            <div className="modal-body demo-modal-body">
              <div className="demo-modal-notice">
                <Shield size={16} />
                <span>
                  <strong>Sample Task Preview</strong> — Modifications disabled in public live demo.
                </span>
              </div>

              <div className="demo-modal-grid">
                <div>
                  <h4>Description</h4>
                  <p>{selectedTask.description}</p>

                  <h4>Checklist Items</h4>
                  <div className="demo-modal-checklists">
                    <div className="checklist-row">
                      <button type="button" onClick={showReadOnlyNotice}>
                        <span className="checked">✓</span>
                        <i>Requirement analysis and technical architecture</i>
                      </button>
                    </div>
                    <div className="checklist-row">
                      <button type="button" onClick={showReadOnlyNotice}>
                        <span className="checked">✓</span>
                        <i>Unit test coverage and CI regression pass</i>
                      </button>
                    </div>
                    <div className="checklist-row">
                      <button type="button" onClick={showReadOnlyNotice}>
                        <span></span>
                        <i>Final security audit & sign-off</i>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="demo-modal-sidebar">
                  <div className="field">
                    <span>Status</span>
                    <Badge tone="success">{selectedTask.status}</Badge>
                  </div>
                  <div className="field">
                    <span>Priority</span>
                    <Badge tone="warning">{selectedTask.priority}</Badge>
                  </div>
                  <div className="field">
                    <span>Project</span>
                    <strong>{selectedTask.projectName}</strong>
                  </div>
                  <div className="field">
                    <span>Assignee</span>
                    <div className="demo-assignee-cell">
                      <Avatar person={selectedTask.assignee} size="xs" />
                      <span>{selectedTask.assignee.name}</span>
                    </div>
                  </div>
                  <div className="field">
                    <span>Due Date</span>
                    <small>{selectedTask.dueDate}</small>
                  </div>
                </div>
              </div>
            </div>

            <footer>
              <Button
                variant="secondary"
                onClick={() => setSelectedTask(null)}
              >
                Close Preview
              </Button>
              <Button
                variant="primary"
                onClick={() => navigate("/signup")}
              >
                Sign Up to Edit Real Tasks
              </Button>
            </footer>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <aside className="toast-stack" aria-live="polite">
          <div className="toast toast-info" role="status">
            <Shield size={16} />
            <strong>{toastMessage}</strong>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setToastMessage("")}
              aria-label="Dismiss toast"
            >
              <X size={14} />
            </button>
          </div>
        </aside>
      )}

      {/* Demo Footer */}
      <footer className="demo-bottom-footer">
        <div className="demo-footer-inner">
          <p>
            You are viewing the <strong>WorkFlow</strong> public interactive demo. Data is completely isolated and strictly read-only.
          </p>
          <div className="demo-footer-actions">
            <Link to="/" className="btn btn-secondary btn-sm">
              Landing Page
            </Link>
            <Link to="/signup" className="btn btn-primary btn-sm">
              Get Started with WorkFlow
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
