import { useEffect, lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout.jsx";
import AuthLayout from "./layouts/AuthLayout.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import { ProtectedRoute, GuestRoute } from "./providers/AuthProvider.jsx";
import { useAppStore } from "./store/useAppStore.js";
import { useTask } from "./hooks/useWorkflowQueries.js";
import { RouteTitleTracker, useDocumentTitle } from "./hooks/useRouteTitle.js";

const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage.jsx"));
const ProjectsPage = lazy(() => import("./pages/projects/ProjectsPage.jsx"));
const ProjectPage = lazy(() => import("./pages/projects/ProjectPage.jsx"));
const BoardPage = lazy(() => import("./pages/projects/BoardPage.jsx"));
const ProjectListPage = lazy(() =>
  import("./pages/projects/ProjectTabPages.jsx").then((m) => ({
    default: m.ProjectListPage,
  })),
);
const ProjectTimelinePage = lazy(() =>
  import("./pages/projects/ProjectTabPages.jsx").then((m) => ({
    default: m.ProjectTimelinePage,
  })),
);
const ProjectFilesPage = lazy(() =>
  import("./pages/projects/ProjectTabPages.jsx").then((m) => ({
    default: m.ProjectFilesPage,
  })),
);
const ProjectActivityPage = lazy(() =>
  import("./pages/projects/ProjectTabPages.jsx").then((m) => ({
    default: m.ProjectActivityPage,
  })),
);
const TasksPage = lazy(() => import("./pages/tasks/TasksPage.jsx"));
const CalendarPage = lazy(() => import("./pages/CalendarPage.jsx"));
const TeamPage = lazy(() => import("./pages/TeamPage.jsx"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage.jsx"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage.jsx"));
import ErrorPage from "./pages/ErrorPage.jsx";
const OnboardingPage = lazy(() => import("./pages/OnboardingPage.jsx"));
const LoginPage = lazy(() =>
  import("./pages/auth/AuthPages.jsx").then((m) => ({
    default: m.LoginPage,
  })),
);
const SignupPage = lazy(() =>
  import("./pages/auth/AuthPages.jsx").then((m) => ({
    default: m.SignupPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import("./pages/auth/AuthPages.jsx").then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const AcceptInvitePage = lazy(() =>
  import("./pages/auth/AcceptInvitePage.jsx"),
);

function TaskRoute() {
  const { taskId } = useParams();
  const setTask = useAppStore((state) => state.setTask);
  const { data: task, isLoading, isError, error, refetch } = useTask(taskId);
  useDocumentTitle(task ? `${task.displayId || "Task"} - ${task.title}` : undefined);
  useEffect(() => {
    setTask(task || null);
    return () => setTask(null);
  }, [setTask, task]);

  if (isLoading) {
    return (
      <div className="page loading-state">
        <p>Loading task...</p>
      </div>
    );
  }
  if (isError) {
    const message =
      error?.status === 403
        ? "You are not authorized to view this task."
        : error?.status === 404
          ? "This task was not found or has been deleted."
          : "Unable to load this task.";
    return (
      <div className="page empty-state">
        <h1>
          {error?.status === 404 ? "Task not found" : "Unable to open task"}
        </h1>
        <p>{message}</p>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => refetch()}>
            Try again
          </button>
          <Link className="btn btn-primary" to="/tasks">
            Back to tasks
          </Link>
        </div>
      </div>
    );
  }
  if (!task) {
    return (
      <div className="page empty-state">
        <h1>Task not found</h1>
        <p>This task no longer exists.</p>
        <Link className="btn btn-primary" to="/tasks">
          Back to tasks
        </Link>
      </div>
    );
  }
  return <TasksPage />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <RouteTitleTracker />
      <Suspense
        fallback={
          <div className="page loading-state">
            <p>Loading...</p>
          </div>
        }
      >
        <Routes>
          <Route element={<GuestRoute />}>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route
                path="/reset-password"
                element={<ForgotPasswordPage reset />}
              />
            </Route>
          </Route>
          <Route element={<AuthLayout />}>
            <Route path="/invite/:token" element={<AcceptInvitePage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectId" element={<ProjectPage />}>
                <Route path="board" element={<BoardPage />} />
                <Route path="list" element={<ProjectListPage />} />
                <Route path="timeline" element={<ProjectTimelinePage />} />
                <Route path="files" element={<ProjectFilesPage />} />
                <Route path="activity" element={<ProjectActivityPage />} />
              </Route>
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/:taskId" element={<TaskRoute />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/settings/*" element={<SettingsPage />} />
              <Route path="/error" element={<ErrorPage type="500" />} />
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/my-tasks"
            element={<Navigate to="/tasks?view=mine" replace />}
          />
          <Route
            path="/favorites"
            element={<Navigate to="/projects?view=favorites" replace />}
          />
          <Route
            path="/recent"
            element={<Navigate to="/projects?view=recent" replace />}
          />
          <Route path="*" element={<ErrorPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
