import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListTodo,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useAnalyticsOverview,
  useMembers,
  useProjects,
} from "../hooks/useWorkflowQueries.js";
import {
  Avatar,
  Button,
  Card,
  PageHeader,
  ProgressBar,
} from "../components/ui/index.jsx";

const statuses = ["Backlog", "Todo", "In Progress", "In Review", "Done"];
const statusTones = {
  Backlog: "backlog",
  Todo: "todo",
  "In Progress": "in-progress",
  "In Review": "in-review",
  Done: "done",
};

function CompletionChart({ values = [], labels = [] }) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) {
    return (
      <div className="analytics-chart-empty">
        <CalendarDays size={21} />
        <strong>No completion data yet</strong>
        <span>Complete tasks to start seeing your delivery trend.</span>
      </div>
    );
  }

  const max = Math.max(...values, 1);
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));
  return (
    <div
      className="analytics-completion-chart"
      role="img"
      aria-label="Completed tasks per date"
    >
      <div className="analytics-chart-scale">
        <span>{max}</span>
        <span>{Math.ceil(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="analytics-chart-plot">
        <span className="analytics-chart-grid top" />
        <span className="analytics-chart-grid middle" />
        <span className="analytics-chart-grid bottom" />
        <div
          className="analytics-chart-bars"
          style={{ "--bar-count": values.length }}
        >
          {values.map((value, index) => (
            <div className="analytics-chart-cell" key={labels[index] || index}>
              <span
                className="analytics-chart-bar"
                style={{
                  height: value ? `${Math.max(4, (value / max) * 100)}%` : 0,
                }}
                title={`${labels[index]}: ${value} completed`}
                aria-label={`${labels[index]}: ${value} completed`}
              />
              {index % labelStep === 0 && <small>{labels[index]}</small>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState("Last 30 days");
  const { data, isLoading, isError, refetch } = useAnalyticsOverview(range);
  const {
    data: projectsData,
    isLoading: projectsLoading,
    isError: projectsError,
    refetch: refetchProjects,
  } = useProjects();
  const {
    data: membersData,
    isLoading: membersLoading,
    isError: membersError,
    refetch: refetchMembers,
  } = useMembers();

  const projects = projectsData?.projects || [];
  const members = membersData?.members || [];
  const activeMembers = members.filter((member) => member.status !== "Pending");
  const workloads = data?.workloads || [];
  const totalTasks = data?.totalTasks || 0;
  const byStatus = data?.byStatus || {};
  const metrics = [
    ["Total Tasks", data?.totalTasks, ListTodo, "blue"],
    ["Completed", data?.completedTasks, CheckCircle2, "green"],
    ["In Progress", data?.inProgressTasks, Activity, "indigo"],
    ["Overdue", data?.overdueTasks, Clock3, "amber"],
  ];

  return (
    <div className="page">
      <PageHeader
        title="Analytics"
        subtitle="Workspace performance and delivery overview."
        actions={
          <select
            className="toolbar-select range-select"
            value={range}
            onChange={(event) => setRange(event.target.value)}
            aria-label="Analytics date range"
          >
            <option>Last 7 days</option>
            <option>Last 30 days</option>
            <option>Last 90 days</option>
            <option>This month</option>
            <option>Previous month</option>
            <option>This year</option>
          </select>
        }
      />

      <>
        <div className="kpi-grid analytics-kpis">
          {metrics.map(([label, value, Icon, tone]) => (
            <Card className="kpi-card" key={label}>
              <div className="kpi-top">
                <span className={`kpi-icon ${tone}`}>
                  <Icon size={19} />
                </span>
              </div>
              <p>{label}</p>
              <div className="kpi-value">
                <strong>
                  {isError ? "—" : isLoading ? "..." : (value ?? 0)}
                </strong>
              </div>
              <small>
                {label === "Completed" ? range : "Current workspace"}
              </small>
            </Card>
          ))}
        </div>

        <div className="analytics-grid">
          <Card className="trend-card">
            <div className="card-heading">
              <div>
                <h2>Task Completion</h2>
                <p>Completed task events · {range}</p>
              </div>
              <span className="analytics-legend">
                <i /> Completed
              </span>
            </div>
            {isError ? (
              <div className="analytics-chart-empty">
                <strong>Unable to load completion data.</strong>
                <button onClick={() => refetch()}>Retry</button>
              </div>
            ) : isLoading ? (
              <div className="analytics-chart-empty">
                Loading completion data...
              </div>
            ) : (
              <CompletionChart
                values={data?.completion}
                labels={data?.completionLabels}
              />
            )}
          </Card>

          <Card>
            <div className="card-heading">
              <div>
                <h2>Task Status</h2>
                <p>{totalTasks} total tasks</p>
              </div>
            </div>
            {isError ? (
              <div className="analytics-section-state">
                <p>Unable to load task status.</p>
                <button onClick={() => refetch()}>Retry</button>
              </div>
            ) : isLoading ? (
              <p className="analytics-section-state">Loading task status...</p>
            ) : totalTasks === 0 ? (
              <p className="analytics-section-state">No tasks to report yet.</p>
            ) : (
              <div className="analytics-status-list">
                {statuses.map((status) => {
                  const count = byStatus[status] || 0;
                  const color =
                    status === "Done"
                      ? "#22C55E"
                      : status === "In Review"
                        ? "#F59E0B"
                        : "#6366F1";
                  return (
                    <div className="analytics-status-row" key={status}>
                      <span>
                        <i className={statusTones[status]} />
                        {status}
                      </span>
                      <strong>{count}</strong>
                      <ProgressBar
                        value={(count / totalTasks) * 100}
                        color={color}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <div className="card-heading">
              <div>
                <h2>Project Progress</h2>
                <p>Completed tasks by project</p>
              </div>
              <Link className="btn btn-ghost" to="/projects">
                All projects
              </Link>
            </div>
            {projectsLoading ? (
              <p className="analytics-section-state">Loading projects...</p>
            ) : projectsError ? (
              <div className="analytics-section-state">
                <p>Unable to load project progress.</p>
                <button onClick={() => refetchProjects()}>Retry</button>
              </div>
            ) : projects.length === 0 ? (
              <p className="analytics-section-state">No active projects.</p>
            ) : (
              <div className="analytics-project-list">
                {projects.slice(0, 6).map((project) => (
                  <Link
                    className="analytics-project-row"
                    to={`/projects/${project.id}`}
                    key={project.id}
                  >
                    <span
                      className="project-mini-icon"
                      style={{
                        background: `${project.color || "#6366F1"}16`,
                        color: project.color || "#6366F1",
                      }}
                    >
                      {project.icon || project.name?.[0]}
                    </span>
                    <span className="analytics-project-copy">
                      <strong>{project.name}</strong>
                      <small>
                        {project.tasks || "0 / 0"} tasks · {project.status}
                      </small>
                      <ProgressBar
                        value={project.progress || 0}
                        color={project.color || "#6366F1"}
                      />
                    </span>
                    <b>{project.progress || 0}%</b>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="card-heading">
              <div>
                <h2>Team Workload</h2>
                <p>Assigned and completed tasks</p>
              </div>
            </div>
            {isError ? (
              <div className="analytics-section-state">
                <p>Unable to load team workload.</p>
                <button onClick={() => refetch()}>Retry</button>
              </div>
            ) : membersLoading || isLoading ? (
              <p className="analytics-section-state">
                Loading team workload...
              </p>
            ) : membersError ? (
              <div className="analytics-section-state">
                <p>Unable to load team workload.</p>
                <button onClick={() => refetchMembers()}>Retry</button>
              </div>
            ) : activeMembers.length === 0 ? (
              <p className="analytics-section-state">No active team members.</p>
            ) : (
              <div className="analytics-workload-list">
                {activeMembers.slice(0, 8).map((member) => {
                  const workload = workloads.find(
                    (item) => item.userId === member.id,
                  ) || { assigned: 0, completed: 0 };
                  return (
                    <div className="analytics-workload-row" key={member.id}>
                      <Avatar person={member} size="sm" />
                      <span>
                        <strong>{member.name}</strong>
                        <small>
                          {workload.completed}/{workload.assigned} assigned
                          tasks completed
                        </small>
                      </span>
                      <ProgressBar
                        value={
                          workload.assigned
                            ? (workload.completed / workload.assigned) * 100
                            : 0
                        }
                        color="#6366F1"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </>
    </div>
  );
}
