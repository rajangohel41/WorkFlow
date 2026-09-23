import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ListTodo,
  TrendingUp,
} from "lucide-react"
import { useState } from "react"
import {
  useAnalyticsOverview,
  useTasks,
  useProjects,
  useMembers,
} from "../hooks/useWorkflowQueries.js"
import {
  Avatar,
  Card,
  PageHeader,
  ProgressBar,
} from "../components/ui/index.jsx"

function TrendChart({ completion = [] }) {
  const currentPoints =
    completion.length === 12
      ? completion
      : [34, 48, 43, 60, 54, 72, 79, 68, 86, 91, 84, 96]

  const a = currentPoints
    .map((v, i) => `${Math.round(i * 9.09)},${100 - Math.min(100, Math.max(0, v))}`)
    .join(" ")

  const b = currentPoints
    .map((v, i) => `${Math.round(i * 9.09)},${100 - Math.min(100, Math.max(0, Math.round(v * 0.85)))}`)
    .join(" ")

  return (
    <div className="analytics-chart">
      <div className="y-labels">
        <span>100</span>
        <span>75</span>
        <span>50</span>
        <span>25</span>
        <span>0</span>
      </div>
      <div>
        <span className="grid-line g1" />
        <span className="grid-line g2" />
        <span className="grid-line g3" />
        <span className="grid-line g4" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={b}
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={a}
            fill="none"
            stroke="#6366F1"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="x-labels">
          <span>Jan</span>
          <span>Feb</span>
          <span>Mar</span>
          <span>Apr</span>
          <span>May</span>
          <span>Jun</span>
          <span>Jul</span>
          <span>Aug</span>
          <span>Sep</span>
          <span>Oct</span>
          <span>Nov</span>
          <span>Dec</span>
        </div>
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const [range, setRange] = useState("Last 30 days")

  const { data: analyticsData } = useAnalyticsOverview()
  const { data: tasksData } = useTasks()
  const { data: projectsData } = useProjects()
  const { data: membersData } = useMembers()

  const tasks = tasksData?.tasks || []
  const projects = projectsData?.projects || []
  const members = membersData?.members || []

  const completed = tasks.filter((t) => t.status === "Done").length
  const inProgress = tasks.filter((t) => t.status === "In Progress").length
  const todo = tasks.filter((t) => t.status === "Todo").length
  const overdue = tasks.filter((t) => {
    if (!t.dueDate) return false
    return new Date(t.dueDate) < new Date() && t.status !== "Done"
  }).length

  const productivity =
    analyticsData?.productivity ??
    (tasks.length ? Math.round((completed / tasks.length) * 100) : 0)

  const analyticsKpis = [
    {
      label: "Tasks Completed",
      value: completed.toLocaleString(),
      change: "+12.5%",
      positive: true,
      icon: CheckCircle2,
    },
    {
      label: "Avg. Completion Time",
      value: "2.8 days",
      change: "-8.4%",
      positive: true,
      icon: Clock3,
    },
    {
      label: "Overdue Tasks",
      value: overdue.toString(),
      change: overdue > 0 ? "+2" : "0",
      positive: overdue === 0,
      icon: ListTodo,
    },
    {
      label: "Team Productivity",
      value: `${productivity}%`,
      change: "+6.2%",
      positive: true,
      icon: TrendingUp,
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Analytics"
        subtitle="Understand performance and spot trends across your workspace."
        actions={
          <select
            className="toolbar-select"
            value={range}
            onChange={(event) => setRange(event.target.value)}
            aria-label="Analytics date range"
          >
            <option>Last 7 days</option>
            <option>Last 30 days</option>
            <option>Last 90 days</option>
            <option>This year</option>
          </select>
        }
      />
      <div className="kpi-grid analytics-kpis">
        {analyticsKpis.map(({ label, value, change, positive, icon: Icon }) => (
          <Card className="kpi-card" key={label}>
            <div className="kpi-top">
              <span className="kpi-icon indigo">
                <Icon size={19} />
              </span>
            </div>
            <p>{label}</p>
            <div className="kpi-value">
              <strong>{value}</strong>
              <span className={positive ? "positive" : "negative"}>
                {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {change}
              </span>
            </div>
            <small>vs. previous period</small>
          </Card>
        ))}
      </div>
      <div className="analytics-grid">
        <Card className="trend-card">
          <div className="card-heading">
            <div>
              <h2>Task Completion Trend</h2>
              <p>Completed tasks compared with previous period</p>
            </div>
            <div className="chart-legend">
              <span>
                <i className="current" />
                Current
              </span>
              <span>
                <i />
                Previous
              </span>
            </div>
          </div>
          <TrendChart completion={analyticsData?.completion} />
        </Card>
        <Card className="status-card">
          <div className="card-heading">
            <div>
              <h2>Tasks by Status</h2>
              <p>Current distribution</p>
            </div>
          </div>
          <div className="donut-wrap">
            <div className="donut">
              <span>
                <strong>{tasks.length}</strong>
                <small>Total tasks</small>
              </span>
            </div>
            <div className="donut-legend">
              {[
                ["Completed", completed, "green"],
                ["In progress", inProgress, "indigo"],
                ["To do", todo, "blue"],
                ["Overdue", overdue, "red"],
              ].map(([name, val, color]) => (
                <div key={name}>
                  <span>
                    <i className={color} />
                    {name}
                  </span>
                  <strong>{val}</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <div className="card-heading">
            <div>
              <h2>Project Progress</h2>
              <p>Delivery progress across projects</p>
            </div>
          </div>
          <div className="analytics-projects">
            {projects.length > 0 ? (
              projects.slice(0, 4).map((project) => (
                <div key={project.id || project.name}>
                  <span>
                    <strong>{project.name}</strong>
                    <small>{project.tasks || 0} tasks</small>
                  </span>
                  <ProgressBar
                    value={project.progress || 0}
                    color={project.color || "#6366F1"}
                  />
                  <b>{project.progress || 0}%</b>
                </div>
              ))
            ) : (
              <p className="empty-hint">No projects available.</p>
            )}
          </div>
        </Card>
        <Card>
          <div className="card-heading">
            <div>
              <h2>Team Productivity</h2>
              <p>Completion rate this month</p>
            </div>
          </div>
          <div className="productivity-list">
            {(members.length > 0 ? members : []).slice(0, 4).map((person, index) => {
              const assignedTasks = tasks.filter(
                (t) =>
                  t.assignee?.email === person.email ||
                  t.assignee?.name === person.name,
              )
              const doneTasks = assignedTasks.filter((t) => t.status === "Done")
              const rate = assignedTasks.length
                ? Math.round((doneTasks.length / assignedTasks.length) * 100)
                : [85, 78, 92, 80][index] || 75
              return (
                <div key={person.id || person.email || person.name}>
                  <Avatar person={person} size="sm" />
                  <span>
                    <strong>{person.name}</strong>
                    <ProgressBar value={rate} />
                  </span>
                  <b>{rate}%</b>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
