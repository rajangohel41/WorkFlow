import { useEffect } from "react"
import { Navigate, Route, Routes, useParams } from "react-router-dom"
import DashboardLayout from "./layouts/DashboardLayout.jsx"
import AuthLayout from "./layouts/AuthLayout.jsx"
import DashboardPage from "./pages/dashboard/DashboardPage.jsx"
import ProjectsPage from "./pages/projects/ProjectsPage.jsx"
import ProjectPage from "./pages/projects/ProjectPage.jsx"
import BoardPage from "./pages/projects/BoardPage.jsx"
import TasksPage from "./pages/tasks/TasksPage.jsx"
import CalendarPage from "./pages/CalendarPage.jsx"
import TeamPage from "./pages/TeamPage.jsx"
import AnalyticsPage from "./pages/AnalyticsPage.jsx"
import SettingsPage from "./pages/settings/SettingsPage.jsx"
import OnboardingPage from "./pages/OnboardingPage.jsx"
import ErrorPage from "./pages/ErrorPage.jsx"
import {
  ForgotPasswordPage,
  LoginPage,
  SignupPage,
  VerifyPage,
} from "./pages/auth/AuthPages.jsx"
import { ProtectedRoute, GuestRoute } from "./providers/AuthProvider.jsx"
import { useAppStore } from "./store/useAppStore.js"
import { useTasks } from "./hooks/useWorkflowQueries.js"

function TaskRoute() {
  const { taskId } = useParams()
  const { data } = useTasks()
  const task = data?.tasks?.find((item) => item.id === taskId)
  useEffect(() => {
    if (task) useAppStore.getState().setTask(task)
  }, [task])
  return <TasksPage />
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ForgotPasswordPage reset />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/verify-email" element={<VerifyPage />} />
        </Route>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />}>
            <Route path="board" element={<BoardPage />} />
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
      <Route path="*" element={<ErrorPage />} />
    </Routes>
  )
}
