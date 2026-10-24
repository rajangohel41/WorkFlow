import {
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Plus,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore.js";
import {
  useDashboardStats,
  useProjects,
  useMembers,
  useAnalyticsOverview,
} from "../../hooks/useWorkflowQueries.js";
import {
  Avatar,
  Button,
  Card,
  PageHeader,
  ProgressBar,
} from "../../components/ui/index.jsx";

function CompletionChart({
  dataPoints = [],
  labels = [],
  loading,
  error,
  onRetry,
}) {
  if (loading)
    return <div className="chart-empty">Loading completion data...</div>;
  if (error)
    return (
      <div className="chart-empty">
        <strong>Unable to load completion data.</strong>
        <button onClick={onRetry}>Retry</button>
      </div>
    );
  if (!dataPoints.length || dataPoints.every((value) => value === 0))
    return (
      <div className="chart-empty">
        <strong>No completed tasks yet</strong>
        <span>Complete a task to start seeing delivery trends.</span>
      </div>
    );
  const max = Math.max(...dataPoints);
  const labelStep = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <div
      className="completion-chart"
      role="img"
      aria-label="Completed task counts per date"
    >
      <div className="completion-scale">
        <span>{max}</span>
        <span>{Math.ceil(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="completion-plot">
        <div className="completion-grid-line top" />
        <div className="completion-grid-line middle" />
        <div className="completion-grid-line bottom" />
        <div
          className="completion-bars"
          style={{ "--bar-count": dataPoints.length }}
        >
          {dataPoints.map((value, index) => (
            <div className="completion-bar-cell" key={labels[index] || index}>
              <span
                className="completion-bar"
                style={{
                  height: `${value ? Math.max(4, (value / max) * 100) : 0}%`,
                }}
                title={`${labels[index] || "Date"}: ${value} completed`}
                aria-label={`${labels[index] || "Date"}: ${value} completed`}
              />
              {index % labelStep === 0 && <small>{labels[index]}</small>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState("Last 30 days");
  const user = useAppStore((state) => state.user);

  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
    refetch: refetchDashboard,
  } = useDashboardStats(range);
  const { data: projectsData } = useProjects();
  const { data: membersData } = useMembers();
  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    isError: analyticsError,
    refetch: refetchAnalytics,
  } = useAnalyticsOverview(range);

  const projects = projectsData?.projects || [];
  const members = membersData?.members || [];
  const activity = dashboardData?.activity || [];

  const stats = dashboardData?.stats || {
    activeProjects: projects.filter((p) => !p.archived).length,
    openTasks: 0,
    scheduledTasks: 0,
    completedTasks: 0,
    previousCompletedTasks: 0,
    teamMembers: members.length,
  };
  const completionChange =
    stats.previousCompletedTasks > 0
      ? Math.round(
          ((stats.completedTasks - stats.previousCompletedTasks) /
            stats.previousCompletedTasks) *
            100,
        )
      : null;

  const displayKpis = [
    {
      label: "Active Projects",
      value: stats.activeProjects,
      metric: `${stats.activeProjects} active project${stats.activeProjects === 1 ? "" : "s"}`,
      icon: BriefcaseBusiness,
      tone: "indigo",
    },
    {
      label: "Open Tasks",
      value: stats.openTasks,
      metric: `${stats.scheduledTasks || 0} scheduled`,
      icon: Clock3,
      tone: "blue",
    },
    {
      label: "Completed",
      value: stats.completedTasks,
      metric: `${stats.completedTasks} completed in period`,
      icon: CheckCircle2,
      tone: "green",
      trend: completionChange,
    },
    {
      label: "Team Members",
      value: stats.teamMembers,
      metric: `${members.filter((m) => m.status === "Online").length || members.length} active`,
      icon: UsersRound,
      tone: "amber",
    },
  ];

  const firstName = user?.name ? user.name.split(" ")[0] : "there";

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
              <option>This month</option>
              <option>Previous month</option>
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
                <strong>{dashboardLoading ? "..." : value}</strong>
                {trend !== undefined && (
                  <span
                    className={
                      trend === null
                        ? "neutral-change"
                        : trend >= 0
                          ? "positive"
                          : "negative"
                    }
                  >
                    {trend === null ? (
                      "No previous data"
                    ) : (
                      <>
                        <ArrowUpRight size={14} /> {trend >= 0 ? "+" : ""}
                        {trend}%
                      </>
                    )}
                  </span>
                )}
              </div>
              <small>{metric}</small>
            </Card>
          ),
        )}
      </div>
      {dashboardError && (
        <Card className="dashboard-query-error">
          <span>Unable to load dashboard metrics.</span>
          <button onClick={() => refetchDashboard()}>Retry</button>
        </Card>
      )}
      <div className="dashboard-grid">
        <Card className="completion-card">
          <div className="card-heading">
            <div>
              <h2>Task Completion</h2>
              <p>Completed tasks · {range}</p>
            </div>
            <div className="legend">
              <span>
                <i />
                Completed
              </span>
            </div>
          </div>
          <CompletionChart
            dataPoints={analyticsData?.completion}
            labels={analyticsData?.completionLabels}
            loading={analyticsLoading || dashboardLoading}
            error={analyticsError}
            onRetry={refetchAnalytics}
          />
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
                  <ProgressBar
                    value={project.progress || 0}
                    color={project.color}
                  />
                </div>
              ))
            ) : (
              <p className="empty-hint">
                No projects yet. Create one to get started.
              </p>
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
            {members.filter((person) => person.status !== "Pending").length ? (
              members
                .filter((person) => person.status !== "Pending")
                .slice(0, 4)
                .map((person) => {
                  const workload = dashboardData?.workloads?.find(
                    (item) => item.userId === person.id,
                  ) || { assigned: 0, completed: 0 };
                  const assignedCount = workload.assigned;
                  const completedCount = workload.completed;
                  return (
                    <div key={person.email || person.name}>
                      <Avatar person={person} size="sm" />
                      <span>
                        <strong>{person.name}</strong>
                        <small>{assignedCount} tasks assigned</small>
                      </span>
                      <div>
                        <ProgressBar
                          value={
                            assignedCount
                              ? Math.round(
                                  (completedCount / assignedCount) * 100,
                                )
                              : 0
                          }
                          color="#6366F1"
                        />
                        <small>
                          {completedCount}/{assignedCount} done
                        </small>
                      </div>
                    </div>
                  );
                })
            ) : (
              <p className="empty-hint">No active team members yet.</p>
            )}
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
                    <Avatar
                      person={item.person || { name: "User" }}
                      size="sm"
                    />
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
  );
}
