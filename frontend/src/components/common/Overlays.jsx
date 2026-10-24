import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCircle2,
  CircleUserRound,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  useCurrentUser,
  useMembers,
  useNotifications,
  useProjects,
  useTasks,
  useWorkflowMutations,
} from "../../hooks/useWorkflowQueries.js";
import { authService } from "../../services/authService.js";
import { disconnectSocket } from "../../hooks/useSocket.js";
import { setAuthToken, setOrganizationId } from "../../api/client.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Avatar, Button, Field, IconButton, Modal } from "../ui/index.jsx";

export function NotificationPanel() {
  const navigate = useNavigate();
  const { notificationsOpen, setNotifications } = useAppStore();
  const {
    data: notificationsData,
    isLoading: notificationsLoading,
    isError: notificationsError,
    refetch: refetchNotifications,
  } = useNotifications();
  const { markNotification, markAllNotifications } = useWorkflowMutations();
  const [tab, setTab] = useState("All");

  if (!notificationsOpen) return null;

  const notifications = notificationsData?.notifications || [];
  const unreadCount = notifications.filter((item) => item.unread).length;

  const filtered = notifications.filter((item) => {
    if (tab === "All") return true;
    if (tab === "Tasks")
      return item.entityType === "task" || item.entityType === "comment";
    if (tab === "Projects") return item.entityType === "project";
    if (tab === "Mentions")
      return item.entityType === "member" || item.entityType === "invitation";
    return true;
  });

  const taskReference = (value) => {
    if (typeof value !== "string") return null;
    const reference = value.trim();
    return /^WF-\d+$/i.test(reference) || /^[a-f\d]{24}$/i.test(reference)
      ? reference
      : null;
  };

  const handleClick = (item) => {
    if (item.unread) {
      markNotification.mutate({ id: item.id, unread: false });
    }
    setNotifications(false);
    // Navigate to the specific entity
    if (item.entityType === "task" || item.entityType === "comment") {
      const taskId = taskReference(item.entityId);
      if (taskId) {
        navigate(`/tasks/${taskId}`);
      } else {
        navigate("/tasks");
      }
    } else if (item.entityType === "project") {
      navigate("/projects");
    } else if (
      item.entityType === "member" ||
      item.entityType === "invitation"
    ) {
      navigate("/team");
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="floating-panel notification-panel">
      <header>
        <div>
          <h3>Notifications</h3>
          <p>{unreadCount} unread</p>
        </div>
        <IconButton label="Close" onClick={() => setNotifications(false)}>
          <X size={18} />
        </IconButton>
      </header>
      <div className="panel-tabs">
        {["All", "Mentions", "Tasks", "Projects"].map((name) => (
          <button
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
            key={name}
          >
            {name}
          </button>
        ))}
      </div>
      <div>
        {notificationsLoading ? (
          <p
            className="empty-hint"
            style={{ padding: "1.5rem", textAlign: "center" }}
          >
            Loading notifications...
          </p>
        ) : notificationsError ? (
          <div
            className="empty-hint"
            style={{ padding: "1.5rem", textAlign: "center" }}
          >
            <p>Unable to load notifications.</p>
            <button onClick={() => refetchNotifications()}>Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <p
            className="empty-hint"
            style={{
              padding: "1.5rem",
              textAlign: "center",
              color: "var(--muted)",
            }}
          >
            No notifications
          </p>
        ) : (
          filtered.map((item) => (
            <button
              className={`notification ${item.unread ? "unread" : ""}`}
              key={item.id}
              onClick={() => handleClick(item)}
            >
              <span className="notification-icon">
                <Bell size={16} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.meta}</small>
              </span>
              {item.unread && <i />}
            </button>
          ))
        )}
      </div>
      <footer>
        <button onClick={() => markAllNotifications.mutate()}>
          Mark all as read
        </button>
      </footer>
    </div>
  );
}

export function CommandMenu() {
  const navigate = useNavigate();
  const { commandOpen, setCommandOpen, setCreateModal, setTask, toggleTheme } =
    useAppStore();
  const { data: projectsData } = useProjects();
  const { data: tasksData } = useTasks();
  const { data: membersData } = useMembers();
  const projects = projectsData?.projects || [];
  const tasks = tasksData?.tasks || [];
  const members = membersData?.members || [];
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(!useAppStore.getState().commandOpen);
      }
      if (event.key === "Escape") setCommandOpen(false);
      if (
        !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        if (event.key.toLowerCase() === "n") setCreateModal("task");
        if (event.key.toLowerCase() === "c")
          useAppStore.getState().setCreateMenu(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setCommandOpen, setCreateModal]);

  useEffect(() => {
    if (!query) return setLoading(false);
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 180);
    return () => clearTimeout(timeout);
  }, [query]);

  if (!commandOpen) return null;

  const commands = [
    {
      name: "Create task",
      type: "Command",
      Icon: Plus,
      action: () => setCreateModal("task"),
    },
    {
      name: "Create project",
      type: "Command",
      Icon: Plus,
      action: () => setCreateModal("project"),
    },
    {
      name: "Go to dashboard",
      type: "Command",
      Icon: LayoutDashboard,
      action: () => navigate("/dashboard"),
    },
    {
      name: "Open settings",
      type: "Command",
      Icon: Settings,
      action: () => navigate("/settings"),
    },
    {
      name: "Toggle dark mode",
      type: "Command",
      Icon: Moon,
      action: toggleTheme,
    },
    ...projects.map((item) => ({
      name: item.name,
      type: "Project",
      Icon: FolderKanban,
      action: () => navigate(`/projects/${item.id}`),
    })),
    ...tasks.map((item) => ({
      name: `${item.id} ${item.title}`,
      type: "Task",
      Icon: CheckCircle2,
      action: () => {
        navigate("/tasks");
        setTimeout(() => setTask(item), 50);
      },
    })),
    ...members.map((item) => ({
      name: item.name,
      type: "Person",
      Icon: UserRound,
      action: () => navigate("/team"),
    })),
  ];

  const results = commands.filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div
      className="overlay command-overlay"
      onMouseDown={() => setCommandOpen(false)}
    >
      <div
        className="command-menu"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-search">
          <Search size={20} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search anything..."
          />
          <kbd>ESC</kbd>
        </div>
        <div className="command-results">
          <p className="command-label">
            {query ? "Search results" : "Suggested commands"}
          </p>
          {loading ? (
            <div className="command-loading">Searching...</div>
          ) : results.length ? (
            results.slice(0, 12).map(({ name, type, Icon, action }) => (
              <button
                key={`${type}-${name}`}
                onClick={() => {
                  action();
                  setCommandOpen(false);
                }}
              >
                <span>
                  <Icon size={17} />
                </span>
                <strong>{name}</strong>
                <small>{type}</small>
                <kbd>↵</kbd>
              </button>
            ))
          ) : (
            <div className="no-results">
              <Search size={24} />
              <strong>No results found</strong>
              <small>Try searching for another project, task, or person.</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CreateMenu() {
  const { createMenu, setCreateMenu, setCreateModal } = useAppStore();
  if (!createMenu) return null;
  return (
    <div className="create-dropdown">
      {[
        ["task", "Create task"],
        ["project", "Create project"],
        ["invite", "Invite member"],
        ["workspace", "Create workspace"],
      ].map(([type, label]) => (
        <button onClick={() => setCreateModal(type)} key={type}>
          <Plus size={15} />
          {label}
        </button>
      ))}
      <button onClick={() => setCreateMenu(false)}>
        <X size={15} />
        Close menu
      </button>
    </div>
  );
}

export function CreateModal() {
  const navigate = useNavigate();
  const {
    createModal: type,
    createModalStatus,
    createModalProjectId,
    setCreateModal,
  } = useAppStore();
  const { data: projectsData } = useProjects();
  const { data: membersData } = useMembers();
  const projects = projectsData?.projects || [];
  const members = membersData?.members || [];
  const {
    createProject,
    createTask,
    inviteMember,
    createCalendarEvent,
    createOrganization,
  } = useWorkflowMutations();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!type) return null;

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (!data.name && !data.title && !data.email) {
      return setError("Please complete the required field.");
    }
    setLoading(true);
    try {
      if (type === "project") {
        const created = await createProject.mutateAsync({
          name: data.name,
          description: data.description || "A new collaborative project.",
          status: data.status || "Planning",
          due: data.due || undefined,
        });
        setCreateModal(null);
        if (created?.id) navigate(`/projects/${created.id}`);
      } else if (type === "task") {
        await createTask.mutateAsync({
          title: data.title,
          description: data.description || "",
          projectId: data.projectId || projects[0]?.id,
          status: data.status || "Backlog",
          priority: data.priority || "Medium",
          dueDate: data.due || undefined,
          label: data.label || "General",
          assigneeEmail: data.assigneeEmail || undefined,
        });
        setCreateModal(null);
      } else if (type === "invite") {
        await inviteMember.mutateAsync({
          email: data.email,
          role: data.role || "Member",
        });
        setCreateModal(null);
      } else if (type === "event") {
        await createCalendarEvent.mutateAsync({
          title: data.title,
          day: Number(data.day),
          time: data.time,
          // data.project holds the project slug (option value is project.id which is the slug)
          projectSlug: data.project || undefined,
        });
        setCreateModal(null);
      } else if (type === "workspace") {
        await createOrganization.mutateAsync({
          name: data.name,
        });
        setCreateModal(null);
      }
    } catch (err) {
      setError(
        err?.response?.data?.message || err.message || "Failed to create",
      );
    } finally {
      setLoading(false);
    }
  };

  const titles = {
    task: "Create new task",
    project: "Create new project",
    invite: "Invite team member",
    workspace: "Create workspace",
    event: "Create event",
  };

  return (
    <Modal title={titles[type]} onClose={() => setCreateModal(null)}>
      <form className="modal-form" onSubmit={submit}>
        {type === "invite" ? (
          <>
            <Field label="Email address">
              <input
                name="email"
                className="input"
                type="email"
                placeholder="name@company.com"
                required
              />
            </Field>
            <Field label="Role">
              <select name="role" className="input">
                <option>Member</option>
                <option>Manager</option>
                <option>Admin</option>
              </select>
            </Field>
            <Field label="Project access">
              <select className="input">
                <option>All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : type === "workspace" ? (
          <Field label="Workspace name">
            <input
              name="name"
              className="input"
              placeholder="Startup Team"
              required
            />
          </Field>
        ) : type === "event" ? (
          <>
            <Field label="Event title">
              <input name="title" className="input" required />
            </Field>
            <div className="field-row">
              <Field label="Day of month">
                <input
                  name="day"
                  className="input"
                  type="number"
                  min="1"
                  max="31"
                  required
                />
              </Field>
              <Field label="Time">
                <input name="time" className="input" type="time" required />
              </Field>
            </div>
            <Field label="Project">
              <select name="project" className="input">
                <option value="">None</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label={type === "task" ? "Task title" : "Project name"}>
              <input
                name={type === "task" ? "title" : "name"}
                className="input"
                placeholder={
                  type === "task"
                    ? "Update onboarding flow"
                    : "Website Redesign"
                }
                required
              />
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                className="input textarea"
                placeholder="Add some context..."
              />
            </Field>
            {type === "task" && (
              <>
                <div className="field-row">
                  <Field label="Project">
                    <select
                      name="projectId"
                      className="input"
                      defaultValue={createModalProjectId || projects[0]?.id}
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Assignee">
                    <select name="assigneeEmail" className="input">
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.email} value={member.email}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="field-row">
                  <Field label="Status">
                    <select
                      name="status"
                      className="input"
                      defaultValue={createModalStatus}
                    >
                      {[
                        "Backlog",
                        "Todo",
                        "In Progress",
                        "In Review",
                        "Done",
                      ].map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select name="priority" className="input">
                      {["Low", "Medium", "High", "Urgent"].map((priority) => (
                        <option key={priority}>{priority}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </>
            )}
            {type === "project" && (
              <Field label="Status">
                <select name="status" className="input">
                  <option>Planning</option>
                  <option>In Progress</option>
                </select>
              </Field>
            )}
            <div className="field-row">
              <Field label="Due date">
                <input name="due" className="input" type="date" />
              </Field>
              {type === "task" && (
                <Field label="Label">
                  <input name="label" className="input" placeholder="Design" />
                </Field>
              )}
            </div>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <footer className="modal-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setCreateModal(null)}
          >
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {loading
              ? "Saving..."
              : type === "invite"
                ? "Send invitation"
                : `Create ${type}`}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

export function UserMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { toggleTheme, clearAuth } = useAppStore();
  const organizationId = useAppStore((state) => state.organizationId);
  const { data: meData } = useCurrentUser();
  const user = meData?.user;
  const activeOrganization =
    meData?.organizations?.find((item) => item.id === organizationId) ||
    meData?.organizations?.[0];
  const userName = user?.name || "";
  const userEmail = user?.email || "";
  const userRole = activeOrganization?.role || user?.role || "Member";
  const userObj = userName
    ? {
        name: userName,
        initials: userName
          .split(/\s+/)
          .map((p) => p[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        color: "#6366f1",
      }
    : { name: "User", initials: "U", color: "#6366f1" };

  const action = (callback) => {
    callback();
    setOpen(false);
  };

  const handleLogout = async () => {
    setOpen(false);
    try {
      await authService.logout();
    } catch (error) {
      console.warn("Server logout failed; clearing the local session.", error);
    } finally {
      disconnectSocket();
      setAuthToken(null);
      setOrganizationId(null);
      await queryClient.cancelQueries();
      queryClient.clear();
      clearAuth();
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="user-menu-wrap">
      <button
        className="user-trigger"
        onClick={() => setOpen(!open)}
        aria-label="User menu"
      >
        <Avatar person={userObj} />
        <span>
          <strong>{userName}</strong>
          <small>{userRole}</small>
        </span>
      </button>
      {open && (
        <div className="user-dropdown">
          <div>
            <Avatar person={userObj} />
            <span>
              <strong>{userName}</strong>
              <small>{userEmail}</small>
            </span>
          </div>
          <button onClick={() => action(() => navigate("/settings/profile"))}>
            <CircleUserRound size={16} /> Profile
          </button>
          <button onClick={() => action(() => navigate("/settings"))}>
            <Settings size={16} /> Settings
          </button>
          <button
            onClick={() => action(() => navigate("/settings/appearance"))}
          >
            <Moon size={16} /> Appearance
          </button>
          <button onClick={() => action(toggleTheme)}>
            <Moon size={16} /> Toggle theme
          </button>
          <button type="button" onClick={handleLogout}>
            <LogOut size={16} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
