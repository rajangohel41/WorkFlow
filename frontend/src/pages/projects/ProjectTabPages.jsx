import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Files,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore.js";
import {
  useProjectActivity,
  useTasks,
  useWorkflowMutations,
} from "../../hooks/useWorkflowQueries.js";
import {
  Badge,
  Button,
  Card,
  ProgressBar,
} from "../../components/ui/index.jsx";
import { getTaskStatusPermission } from "../../utils/taskPermissions.js";

function TabState({ loading, error, message, onRetry, children }) {
  if (loading)
    return (
      <Card className="project-tab-content">
        <p>Loading {message}...</p>
      </Card>
    );
  if (error) {
    return (
      <Card className="project-tab-content error-state">
        <p>Unable to load {message}.</p>
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </Card>
    );
  }
  return children;
}

export function ProjectListPage() {
  const { projectId } = useParams();
  const setTask = useAppStore((state) => state.setTask);
  const user = useAppStore((state) => state.user);
  const { data, isLoading, isError, refetch } = useTasks({ projectId });
  const { updateTask, deleteTask } = useWorkflowMutations();
  const [query, setQuery] = useState("");
  const tasks = (data?.tasks || []).filter((task) =>
    `${task.id} ${task.title}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <TabState
      loading={isLoading}
      error={isError}
      message="project tasks"
      onRetry={refetch}
    >
      <Card className="project-tab-content">
        <div className="card-heading">
          <div>
            <h2>Task list</h2>
            <p>Tasks in this project</p>
          </div>
          <label className="search-input">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks..."
            />
          </label>
        </div>
        {tasks.length === 0 ? (
          <p className="empty-hint">No tasks found.</p>
        ) : (
          <div className="simple-task-list">
            {tasks.map((task) => {
              const { canChange, reason } = getTaskStatusPermission(task, user);
              return (
                <div className="project-task-row" key={task.id}>
                  <button onClick={() => setTask(task)}>
                    <span>{task.id}</span>
                    <strong>{task.title}</strong>
                  </button>
                  <Badge tone="info">{task.status}</Badge>
                  <span>{task.priority}</span>
                  <span>{task.assignee?.name || "Unassigned"}</span>
                  <span>{task.due || "No date"}</span>
                  <Button
                    variant="ghost"
                    disabled={!canChange}
                    title={
                      !canChange
                        ? reason
                        : task.status === "Done"
                          ? "Reopen task"
                          : "Complete task"
                    }
                    onClick={() => {
                      if (!canChange) return;
                      updateTask.mutate({
                        id: task.id,
                        payload: {
                          status: task.status === "Done" ? "Todo" : "Done",
                        },
                      });
                    }}
                  >
                    {task.status === "Done" ? "Reopen" : "Complete"}
                  </Button>
                <Button
                  variant="ghost"
                  onClick={() => deleteTask.mutate(task.id)}
                >
                  Delete
                </Button>
              </div>
            );
          })}
          </div>
        )}
      </Card>
    </TabState>
  );
}

const timelineStatuses = [
  "Backlog",
  "Todo",
  "In Progress",
  "In Review",
  "Done",
];

function dateKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function dayLabel(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
  }).format(value);
}

function statusTone(status) {
  return (
    {
      Backlog: "backlog",
      Todo: "todo",
      "In Progress": "progress",
      "In Review": "review",
      Done: "done",
    }[status] || "todo"
  );
}

function TimelineStatus({ status }) {
  return (
    <span className={`timeline-status ${statusTone(status)}`}>
      {status === "Done" ? <CheckCircle2 size={13} /> : <Circle size={11} />}
      {status}
    </span>
  );
}

export function ProjectTimelinePage() {
  const { projectId } = useParams();
  const setTask = useAppStore((state) => state.setTask);
  const setCreateModal = useAppStore((state) => state.setCreateModal);
  const { data, isLoading, isError, refetch } = useTasks({ projectId });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [dateScope, setDateScope] = useState("All");
  const tasks = data?.tasks || [];

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesQuery =
        !normalizedQuery ||
        `${task.id} ${task.title}`.toLowerCase().includes(normalizedQuery);
      const matchesStatus = status === "All" || task.status === status;
      const matchesDate =
        dateScope === "All" ||
        (dateScope === "Scheduled" ? Boolean(task.dueDate) : !task.dueDate);
      return matchesQuery && matchesStatus && matchesDate;
    });
  }, [dateScope, query, status, tasks]);

  const scheduledTasks = useMemo(
    () =>
      filteredTasks
        .filter((task) => task.dueDate)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)),
    [filteredTasks],
  );
  const unscheduledTasks = filteredTasks.filter((task) => !task.dueDate);
  const days = useMemo(() => {
    if (!scheduledTasks.length) return [];
    const dates = scheduledTasks.map((task) => new Date(dateKey(task.dueDate)));
    const first = new Date(Math.min(...dates));
    const last = new Date(Math.max(...dates));
    first.setDate(first.getDate() - 2);
    last.setDate(last.getDate() + 2);
    const result = [];
    for (
      const cursor = new Date(first);
      cursor <= last;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      result.push(new Date(cursor));
    }
    return result;
  }, [scheduledTasks]);
  const dayMap = useMemo(
    () => new Map(days.map((day, index) => [dateKey(day), index + 1])),
    [days],
  );
  const today = dateKey(new Date());

  const openTask = (task) => setTask(task);

  return (
    <TabState
      loading={isLoading}
      error={isError}
      message="project timeline"
      onRetry={refetch}
    >
      <Card className="project-tab-content timeline-workspace">
        <div className="timeline-heading">
          <div>
            <h2>Timeline</h2>
            <p>Scheduled project work</p>
          </div>
          <div className="timeline-controls">
            <label className="search-input">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks..."
                aria-label="Search timeline tasks"
              />
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter timeline by status"
            >
              <option value="All">All statuses</option>
              {timelineStatuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              value={dateScope}
              onChange={(event) => setDateScope(event.target.value)}
              aria-label="Filter timeline by date"
            >
              <option value="All">All dates</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Unscheduled">Unscheduled</option>
            </select>
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="timeline-empty">
            <CalendarDays size={22} />
            <strong>
              {tasks.length
                ? "No tasks match these filters"
                : "No scheduled work yet"}
            </strong>
            <p>
              {tasks.length
                ? "Try a different search or filter."
                : "Create tasks and assign dates to see your project timeline."}
            </p>
            <Button onClick={() => setCreateModal("task")}>Create task</Button>
          </div>
        ) : (
          <>
            {scheduledTasks.length > 0 && (
              <div className="timeline-scroll">
                <div
                  className="timeline-grid"
                  style={{
                    "--timeline-days": days.length,
                    "--today-column": dayMap.get(today) || 0,
                  }}
                >
                  <div className="timeline-grid-header">
                    <div className="timeline-task-heading">Task / due date</div>
                    <div className="timeline-dates">
                      {days.map((day) => (
                        <span
                          className={dateKey(day) === today ? "today" : ""}
                          key={dateKey(day)}
                        >
                          {dayLabel(day)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="timeline-rows">
                    {scheduledTasks.map((task) => {
                      const due = dateKey(task.dueDate);
                      const column = dayMap.get(due);
                      return (
                        <div className="timeline-row" key={task.id}>
                          <button
                            className="timeline-task"
                            onClick={() => openTask(task)}
                          >
                            <span className="timeline-task-id">{task.id}</span>
                            <strong>{task.title}</strong>
                            <span className="timeline-task-meta">
                              <TimelineStatus status={task.status} />
                              {task.priority} ·{" "}
                              {task.assignee?.name || "Unassigned"} ·{" "}
                              {task.due || "No date"}
                            </span>
                          </button>
                          <div
                            className="timeline-lane"
                            style={{ "--due-column": column }}
                          >
                            {dayMap.has(today) && (
                              <span
                                className="timeline-today-line"
                                aria-label="Today"
                                style={{ gridColumn: dayMap.get(today) }}
                              />
                            )}
                            <button
                              className={`timeline-marker ${statusTone(task.status)}`}
                              style={{ gridColumn: column }}
                              onClick={() => openTask(task)}
                              title={`${task.id} · ${task.title} · ${task.status} · Due ${task.due || "not set"}`}
                              aria-label={`Open ${task.id} ${task.title}`}
                            >
                              <span>{task.title}</span>
                              <span className="timeline-tooltip">
                                <strong>
                                  {task.id} · {task.title}
                                </strong>
                                <small>
                                  <TimelineStatus status={task.status} />{" "}
                                  {task.priority} ·{" "}
                                  {task.assignee?.name || "Unassigned"}
                                </small>
                                <small>Due {task.due || "not set"}</small>
                                <small>{task.project || "Project task"}</small>
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {unscheduledTasks.length > 0 && (
              <section className="timeline-unscheduled">
                <div className="timeline-section-heading">
                  <div>
                    <h3>Unscheduled</h3>
                    <p>Tasks without a due date</p>
                  </div>
                  <span>{unscheduledTasks.length}</span>
                </div>
                <div className="timeline-unscheduled-list">
                  {unscheduledTasks.map((task) => (
                    <button key={task.id} onClick={() => openTask(task)}>
                      <span>{task.id}</span>
                      <strong>{task.title}</strong>
                      <TimelineStatus status={task.status} />
                      <small>{task.assignee?.name || "Unassigned"}</small>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </Card>
    </TabState>
  );
}

export function ProjectFilesPage() {
  const { projectId } = useParams();
  const { data, isLoading, isError, refetch } = useTasks({ projectId });
  const tasks = data?.tasks || [];
  const files = tasks.flatMap((task) =>
    (task.attachments || []).map((file) => ({ ...file, task })),
  );

  return (
    <TabState
      loading={isLoading}
      error={isError}
      message="project files"
      onRetry={refetch}
    >
      <Card className="project-tab-content">
        <div className="card-heading">
          <div>
            <h2>Files</h2>
            <p>Attachments from project tasks</p>
          </div>
        </div>
        {files.length === 0 ? (
          <p className="empty-hint">No files yet. Upload files from a task.</p>
        ) : (
          <div className="file-grid">
            {files.map((file) => (
              <button
                key={file.id}
                onClick={() =>
                  window.open(file.url, "_blank", "noopener,noreferrer")
                }
              >
                <Files size={20} />
                <strong>{file.name}</strong>
                <small>
                  {file.task.title} · {file.mimeType || "File"} ·{" "}
                  {file.size
                    ? `${Math.round(file.size / 1024)} KB`
                    : "Size not set"}
                </small>
              </button>
            ))}
          </div>
        )}
      </Card>
    </TabState>
  );
}

export function ProjectActivityPage() {
  const { projectId } = useParams();
  const { data, isLoading, isError, refetch } = useProjectActivity(projectId);
  const activities = data?.activity || [];

  return (
    <TabState
      loading={isLoading}
      error={isError}
      message="project activity"
      onRetry={refetch}
    >
      <Card className="project-tab-content">
        <div className="card-heading">
          <div>
            <h2>Activity</h2>
            <p>Recent changes in this project</p>
          </div>
        </div>
        {activities.length === 0 ? (
          <p className="empty-hint">No activity yet.</p>
        ) : (
          <div className="activity-list">
            {activities.map((item) => (
              <div key={item.id}>
                <CalendarDays size={20} />
                <p>
                  <strong>{item.person?.name || "Team member"}</strong>{" "}
                  {item.text} <b>{item.target}</b>
                  <small>{item.time}</small>
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </TabState>
  );
}
