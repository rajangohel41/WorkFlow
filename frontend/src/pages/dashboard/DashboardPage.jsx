import {
  ArrowDownRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Plus,
  UsersRound,
} from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { useAppStore } from "../../store/useAppStore.js"
import {
  useDashboardStats,
  useProjects,
  useTasks,
  useMembers,
  useAnalyticsOverview,
} from "../../hooks/useWorkflowQueries.js"
import {
  Avatar,
  Button,
  Card,
  IconButton,
  PageHeader,
  ProgressBar,
} from "../../components/ui/index.jsx"

function CompletionChart({ dataPoints }) {
  const data =
    dataPoints && dataPoints.length === 12
      ? dataPoints
      : [34, 48, 43, 60, 54, 72, 79, 68, 86, 91, 84, 96]
  const points = data
    .map((value, index) => `${index * 9.09},${100 - value}`)
    .join(" ")
  return (
    <div className="chart-wrap">
      <div className="y-labels">
        <span>100</span>
        <span>75</span>
        <span>50</span>
        <span>25</span>
        <span>0</span>
      </div>
      <div className="line-chart">
        <span className="grid-line g1" />
        <span className="grid-line g2" />
        <span className="grid-line g3" />
        <span className="grid-line g4" />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label="Task completion has increased throughout the quarter"
        >
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366F1" stopOpacity=".24" />
              <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,100 ${points} 100,100`} fill="url(#area)" />
          <polyline
            points={points}
            fill="none"
            stroke="#6366F1"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="x-labels">
          <span>Jul 1</span>
          <span>Jul 15</span>
          <span>Aug 1</span>
          <span>Aug 15</span>
          <span>Sep 1</span>
          <span>Sep 15</span>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [range, setRange] = useState("Last 30 days")
  const [interval, setInterval] = useState("Weekly")
  const user = useAppStore((state) => state.user)

  const { data: dashboardData } = useDashboardStats()
  const { data: projectsData } = useProjects()
  const { data: tasksData } = useTasks()
  const { data: membersData } = useMembers()
  const { data: analyticsData } = useAnalyticsOverview()

  const projects = projectsData?.projects || []
  const tasks = tasksData?.tasks || []
  const members = membersData?.members || []
  const activity = dashboardData?.activity || []

  const stats = dashboardData?.stats || {
    activeProjects: projects.filter((p) => !p.archived).length,
    openTasks: tasks.filter((t) => t.status !== "Done").length,
    completedTasks: tasks.filter((t) => t.status === "Done").length,
    teamMembers: members.length,
  }

  const displayKpis = [
    {
      label: "Active Projects",
      value: stats.activeProjects,
      metric: "+3 this month",
      icon: BriefcaseBusiness,
      tone: "indigo",
      trend: "up",
    },
    {
      label: "Open Tasks",
      value: stats.openTasks,
      metric: `${tasks.filter((t) => t.due && t.due !== "Not set").length} scheduled`,
      icon: Clock3,
      tone: "blue",
    },
    {
      label: "Completed",
      value: stats.completedTasks,
      metric: `${analyticsData?.productivity || 0}% completion rate`,
      icon: CheckCircle2,
      tone: "green",
      trend: "up",
    },
    {
      label: "Team Members",
      value: stats.teamMembers,
      metric: `${members.filter((m) => m.status === "Online").length || members.length} active`,
      icon: UsersRound,
      tone: "amber",
    },
  ]

  const firstName = user?.name ? user.name.split(" ")[0] : "there"

  return (
    <div className="page dashboard-page">
      <PageHeader
        title={`Good morning, ${firstName}`}
        subtitle="Here's what's happening across your workspace."
        actions={
          <>
            <select
              className="toolbar-select range-select"
              value={range}
              onChange={(event) => setRange(event.target.value)}
              aria-label="Dashboard date range"
            >
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last 90 days</option>
              <option>This year</option>
            </select>
            <Button
              icon={Plus}
              onClick={() => useAppStore.getState().setCreateModal("project")}
            >
              Create project
            </Button>
          </>
        }
      />
      <div className="kpi-grid">
        {displayKpis.map(
          ({ label, value, metric, icon: Icon, tone, trend }) => (
            <Card className="kpi-card" key={label}>
              <div className="kpi-top">
                <span className={`kpi-icon ${tone}`}>
                  <Icon size={19} />
                </span>
              </div>
              <p>{label}</p>
              <div className="kpi-value">
                <strong>{value}</strong>
                {trend && (
                  <span className="positive">
                    <ArrowUpRight size={14} /> 8.2%
                  </span>
                )}
              </div>
              <small>{metric}</small>
            </Card>
          ),
        )}
      </div>
      <div className="dashboard-grid">
        <Card className="completion-card">
          <div className="card-heading">
            <div>
              <h2>Task Completion</h2>
              <p>Tasks completed over the last 12 weeks</p>
            </div>
            <div className="legend">
              <span>
                <i />
                Completed
              </span>
              <select
                className="chart-select"
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                aria-label="Chart interval"
              >
                <option>Weekly</option>
                <option>Monthly</option>
              </select>
            </div>
          </div>
          <CompletionChart dataPoints={analyticsData?.completion} />
        </Card>
        <Card className="progress-card">
          <div className="card-heading">
            <div>
              <h2>Project Progress</h2>
              <p>Active projects</p>
            </div>
          </div>
          <div className="project-progress-list">
            {projects.length > 0 ? (
              projects.slice(0, 4).map((project) => (
                <div key={project.id || project.name}>
                  <div>
                    <span
                      className="project-mini-icon"
                      style={{
                        background: `${project.color}16`,
                        color: project.color,
                      }}
                    >
                      {project.icon || project.name[0]}
                    </span>
                    <span>
                      <Link to={`/projects/${project.id}`}>
                        <strong>{project.name}</strong>
                      </Link>
                      <small>{project.tasks || 0} tasks</small>
                    </span>
                    <b>{project.progress || 0}%</b>
                  </div>
                  <ProgressBar value={project.progress || 0} color={project.color} />
                </div>
              ))
            ) : (
              <p className="empty-hint">No projects yet. Create one to get started.</p>
            )}
          </div>
          <Link to="/projects" className="card-link">
            View all projects <ArrowUpRight size={14} />
          </Link>
        </Card>
        <Card className="workload-card">
          <div className="card-heading">
            <div>
              <h2>Team Workload</h2>
              <p>Assigned tasks across members</p>
            </div>
            <Link className="btn btn-ghost" to="/team">
              View team
            </Link>
          </div>
          <div className="workload-list">
            {members.slice(0, 4).map((person, index) => {
              const assignedCount = tasks.filter(
                (t) =>
                  t.assignee?.email === person.email ||
                  t.assignee?.name === person.name,
              ).length
              const pct = Math.min(
                100,
                Math.round(
                  (assignedCount / Math.max(1, tasks.length)) * 100,
                ) + (index === 0 ? 30 : 15),
              )
              return (
                <div key={person.email || person.name}>
                  <Avatar person={person} size="sm" />
                  <span>
                    <strong>{person.name}</strong>
                    <small>{assignedCount} tasks assigned</small>
                  </span>
                  <div>
                    <ProgressBar
                      value={pct}
                      color={pct > 75 ? "#F59E0B" : "#6366F1"}
                    />
                    <small>{pct}%</small>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
        <Card className="activity-card">
          <div className="card-heading">
            <div>
              <h2>Recent Activity</h2>
              <p>Latest workspace updates</p>
            </div>
            <Link className="btn btn-ghost" to="/tasks">
              View all
            </Link>
          </div>
          <div className="activity-list">
            {activity.length > 0 ? (
              activity.map((item, index) => (
                <div key={item.id || index}>
                  <div className="activity-avatar">
                    <Avatar person={item.person || { name: "User" }} size="sm" />
                    <i />
                  </div>
                  <p>
                    <strong>{item.person?.name || "Member"}</strong> {item.text}{" "}
                    <b>{item.target}</b>
                    <small>{item.time}</small>
                  </p>
                </div>
              ))
            ) : (
              <p className="empty-hint">No recent activity.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
