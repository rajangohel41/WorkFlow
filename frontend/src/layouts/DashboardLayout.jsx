import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FolderKanban,
  Heart,
  LayoutDashboard,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore.js";
import { Avatar, Button, IconButton } from "../components/ui/index.jsx";
import {
  useMe,
  useNotifications,
  useOrganizations,
  useWorkflowMutations,
} from "../hooks/useWorkflowQueries.js";
import { useSocket } from "../hooks/useSocket.js";
import {
  CommandMenu,
  CreateMenu,
  CreateModal,
  NotificationPanel,
  UserMenu,
} from "../components/common/Overlays.jsx";
import TaskDrawer from "../components/common/TaskDrawer.jsx";
import ToastContainer from "../components/common/ToastContainer.jsx";

const mainNav = [
  { label: "Overview", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Projects", icon: FolderKanban, to: "/projects" },
  { label: "Tasks", icon: CheckSquare2, to: "/tasks" },
  { label: "Calendar", icon: CalendarDays, to: "/calendar" },
  { label: "Team", icon: UsersRound, to: "/team" },
  { label: "Analytics", icon: BarChart3, to: "/analytics" },
];
const workspaceNav = [
  { label: "My Tasks", icon: CheckSquare2, to: "/tasks?view=mine" },
  { label: "Favorites", icon: Heart, to: "/projects?view=favorites" },
  { label: "Recent", icon: Clock3, to: "/projects?view=recent" },
];

function Sidebar() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const {
    collapsed,
    mobileNav,
    toggleCollapsed,
    setMobileNav,
    workspace,
    workspaceMenu,
    setWorkspaceMenu,
    setCreateModal,
    profile,
    organizationId,
  } = useAppStore();
  const { data: orgData } = useOrganizations();
  const { switchOrganization } = useWorkflowMutations();
  const isMainActive = (to) => {
    if (to === "/projects") {
      return (
        location.pathname.startsWith("/projects") &&
        !["favorites", "recent"].includes(searchParams.get("view"))
      );
    }
    if (to === "/tasks") {
      return (
        location.pathname.startsWith("/tasks") &&
        searchParams.get("view") !== "mine"
      );
    }
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };
  const isWorkspaceActive = (to) => {
    if (to === "/projects?view=favorites") {
      return (
        location.pathname === "/projects" &&
        searchParams.get("view") === "favorites"
      );
    }
    if (to === "/projects?view=recent") {
      return (
        location.pathname === "/projects" &&
        searchParams.get("view") === "recent"
      );
    }
    return (
      location.pathname === "/tasks" && searchParams.get("view") === "mine"
    );
  };
  return (
    <aside
      className={`sidebar ${collapsed ? "collapsed" : ""} ${
        mobileNav ? "mobile-open" : ""
      }`}
    >
      <div className="brand">
        <span>
          <Workflow size={21} />
        </span>
        {!collapsed && <strong>WorkFlow</strong>}
        <IconButton
          label="Close navigation"
          className="mobile-close"
          onClick={() => setMobileNav(false)}
        >
          <X size={19} />
        </IconButton>
      </div>
      <button
        className="workspace-switcher"
        onClick={() => setWorkspaceMenu(!workspaceMenu)}
      >
        <span className="workspace-logo">
          {workspace?.[0]?.toUpperCase() || "W"}
        </span>
        {!collapsed && (
          <>
            <span>
              <strong>{workspace}</strong>
              <small>Business workspace</small>
            </span>
            <ChevronDown size={15} />
          </>
        )}
      </button>
      {workspaceMenu && (
        <div className="workspace-dropdown">
          {(orgData?.organizations || []).map((org) => (
            <button
              className={organizationId === org.id ? "active" : ""}
              onClick={() => switchOrganization.mutate(org.id)}
              key={org.id}
            >
              {org.name}
            </button>
          ))}
          <hr />
          <button onClick={() => setCreateModal("workspace")}>
            <Plus size={14} /> Create workspace
          </button>
          <NavLink to="/settings" onClick={() => setWorkspaceMenu(false)}>
            <Settings size={14} /> Manage workspaces
          </NavLink>
        </div>
      )}
      <nav>
        <p>MAIN</p>
        {mainNav.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={label}
            to={to}
            className={() => (isMainActive(to) ? "active" : "")}
            onClick={() => setMobileNav(false)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
        <p className="workspace-label">WORKSPACE</p>
        {workspaceNav.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={label}
            to={to}
            className={() => (isWorkspaceActive(to) ? "active" : "")}
            onClick={() => setMobileNav(false)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <a href="mailto:support@workflow.app?subject=WorkFlow support request">
          <CircleHelp size={18} />
          <span>Help & Support</span>
        </a>
        <NavLink to="/settings" end>
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>
        <NavLink to="/settings/profile" className="sidebar-user">
          <Avatar
            person={{
              name: profile.name,
              initials: profile.name
                ?.split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2),
              color: "#6366F1",
            }}
          />
          {!collapsed && (
            <span>
              <strong>{profile.name}</strong>
              <small>{profile.email}</small>
            </span>
          )}
        </NavLink>
      </div>
      <button
        className="collapse-control"
        onClick={toggleCollapsed}
        aria-label="Collapse sidebar"
      >
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>
    </aside>
  );
}

function Header() {
  const location = useLocation();
  const notificationWrapRef = useRef(null);
  const {
    dark,
    workspace,
    toggleTheme,
    setMobileNav,
    setNotifications,
    notificationsOpen,
    setCommandOpen,
    setCreateMenu,
    createMenu,
  } = useAppStore();
  const { data: notificationData } = useNotifications();
  const notifications = notificationData?.notifications || [];
  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const onPointerDown = (event) => {
      if (!notificationWrapRef.current?.contains(event.target)) {
        setNotifications(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [notificationsOpen, setNotifications]);
  const page =
    mainNav.find((item) => location.pathname.startsWith(item.to))?.label ||
    (location.pathname.startsWith("/settings") ? "Settings" : "Project");
  return (
    <header className="topbar">
      <div className="topbar-left">
        <IconButton
          label="Open navigation"
          className="menu-button"
          onClick={() => setMobileNav(true)}
        >
          <Menu size={20} />
        </IconButton>
        <div className="breadcrumb">
          <span>{workspace || "Workspace"}</span>
          <i>/</i>
          <strong>{page}</strong>
        </div>
      </div>
      <button className="global-search" onClick={() => setCommandOpen(true)}>
        <Search size={17} />
        <span>Search projects, tasks, people...</span>
        <kbd>⌘ K</kbd>
      </button>
      <div className="topbar-actions">
        <div className="create-wrap">
          <Button
            icon={Plus}
            className="header-create"
            onClick={() => setCreateMenu(!createMenu)}
          >
            Create
          </Button>
          <CreateMenu />
        </div>
        <IconButton label="Toggle theme" onClick={toggleTheme}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
        <div className="notification-wrap" ref={notificationWrapRef}>
          <IconButton
            label="Notifications"
            onClick={() => setNotifications(!notificationsOpen)}
          >
            <Bell size={18} />
            {(() => {
              const unread = notifications.filter((item) => item.unread).length;
              return unread > 0 ? (
                <span className="unread-badge">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null;
            })()}
          </IconButton>
          <NotificationPanel />
        </div>
        <UserMenu />
      </div>
    </header>
  );
}

export default function DashboardLayout() {
  useSocket();
  useEffect(() => {
    const close = (event) => {
      if (event.key === "Escape") {
        useAppStore.getState().setNotifications(false);
        useAppStore.getState().setTask(null);
        useAppStore.getState().setCreateModal(null);
        useAppStore.getState().setCreateMenu(false);
        useAppStore.getState().setWorkspaceMenu(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-area">
        <Header />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
      <CommandMenu />
      <CreateModal />
      <TaskDrawer />
      <ToastContainer />
    </div>
  );
}
