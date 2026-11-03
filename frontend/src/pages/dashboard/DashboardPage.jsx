import {
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Plus,
  UsersRound,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getGreeting } from "../../utils/greeting.js";
export { getGreeting };
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
  const rawMax = Math.max(...dataPoints, 0);
  const domainMax = rawMax <= 1 ? 2 : (rawMax % 2 === 0 ? rawMax : rawMax + 1);
  const middleTick = domainMax / 2;
  const isSingleBar = dataPoints.length === 1;
  const labelStep = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <div
      className="completion-chart"
      role="img"
      aria-label="Completed task counts per date"
    >
      <div className="completion-scale">
        <span>{domainMax}</span>
        <span>{middleTick}</span>
        <span>0</span>
      </div>
      <div className="completion-plot">
        <div className="completion-grid-line top" />
        <div className="completion-grid-line middle" />
        <div className="completion-grid-line bottom" />
        <div
          className={`completion-bars ${isSingleBar ? "single-bar" : ""}`}
          style={{
            "--bar-count": isSingleBar ? 1 : dataPoints.length,
            ...(isSingleBar ? { paddingInline: "max(32px, 35%)" } : {}),
          }}
        >
          {dataPoints.map((value, index) => (
            <div className="completion-bar-cell" key={labels[index] || index}>
              <span
                className="completion-bar"
                style={{
                  height: `${value ? Math.max(4, (value / domainMax) * 100) : 0}%`,
                }}
                title={`${labels[index] || "Date"}: ${value} completed`}
                aria-label={`${labels[index] || "Date"}: ${value} completed`}
              />
              {(index % labelStep === 0 || isSingleBar) && <small>{labels[index]}</small>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState("Last 30 days");
  const [greeting, setGreeting] = useState(() => getGreeting());
  const user = useAppStore((state) => state.user);

  useEffect(() => {
    const updateGreeting = () => {
      setGreeting(getGreeting());
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        updateGreeting();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", updateGreeting);
    const interval = setInterval(updateGreeting, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", updateGreeting);
      clearInterval(interval);
    };
  }, []);

  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
    refetch: refetchDashboard,
  } = useDashboardStats(range);
  const { data: projectsData, isError: projectsError } = useProjects();
  const { data: membersData, isError: membersError } = useMembers();
  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    isError: analyticsError,
    refetch: refetchAnalytics,
  } = useAnalyticsOverview(range);

  const projects = projectsData?.projects || [];
  const members = membersData?.members || [];
  const activity = dashboardData?.activity || [];

  const activeProjectsCount = projectsData
    ? projects.filter((p) => !p.archived).length
    : dashboardData?.stats?.activeProjects;
  const activeProjectsLoading = !projectsData && dashboardLoading;

  const teamMembersCount = membersData
    ? members.length
    : dashboardData?.stats?.teamMembers;
  const teamMembersLoading = !membersData && dashboardLoading;

  const openTasksCount = dashboardData?.stats?.openTasks;
  const openTasksLoading = dashboardLoading && !dashboardData;

  const completedTasksCount = dashboardData?.stats?.completedTasks;
  const completedTasksLoading = dashboardLoading && !dashboardData;

  const stats = dashboardData?.stats || {
    activeProjects: activeProjectsCount ?? 0,
    openTasks: openTasksCount ?? 0,
    scheduledTasks: 0,
    completedTasks: completedTasksCount ?? 0,
    previousCompletedTasks: 0,
    teamMembers: teamMembersCount ?? 0,
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
      value: activeProjectsCount,
      metric: `${activeProjectsCount ?? 0} active project${activeProjectsCount === 1 ? "" : "s"}`,
      icon: BriefcaseBusiness,
      tone: "indigo",
      loading: activeProjectsLoading,
      error: !projectsData && (dashboardError || projectsError),
    },
    {
      label: "Open Tasks",
      value: openTasksCount,
      metric: `${stats.scheduledTasks || 0} scheduled`,
      icon: Clock3,
      tone: "blue",
      loading: openTasksLoading,
      error: !dashboardData && dashboardError,
    },
    {
      label: "Completed",
      value: completedTasksCount,
      metric: `${completedTasksCount ?? 0} completed in period`,
      icon: CheckCircle2,
      tone: "green",
      trend: completionChange,
      loading: completedTasksLoading,
      error: !dashboardData && dashboardError,
    },
    {
      label: "Team Members",
      value: teamMembersCount,
      metric: `${members.filter((m) => m.status === "Online").length || teamMembersCount || 0} active`,
      icon: UsersRound,
      tone: "amber",
      loading: teamMembersLoading,
      error: !membersData && (dashboardError || membersError),
    },
  ];

  const firstName = user?.name ? user.name.split(" ")[0] : "there";

  return (
    <div className="page dashboard-page">
      <PageHeader
        title={`${greeting}, ${firstName}`}
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
          ({ label, value, metric, icon: Icon, tone, trend, loading, error }) => (
            <Card className="kpi-card" key={label}>
              <div className="kpi-top">
                <span className={`kpi-icon ${tone}`}>
                  <Icon size={19} />
                </span>
              </div>
              <p>{label}</p>
              <div className="kpi-value">
                <strong>
                  {loading ? (
                    <span className="kpi-loading-dots">…</span>
                  ) : error ? (
                    <span className="kpi-error-state" title="Failed to load metric">—</span>
                  ) : (
                    value ?? 0
                  )}
                </strong>
                {trend !== undefined && !loading && !error && (
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
              <small>{error ? "Unable to load data" : metric}</small>
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
