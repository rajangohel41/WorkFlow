import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  setOrganizationId,
  setUnauthorizedHandler,
  setAuthToken,
} from "../api/client.js";
import { useAppStore } from "../store/useAppStore.js";
import { useMe } from "../hooks/useWorkflowQueries.js";
import ErrorPage from "../pages/ErrorPage.jsx";

export function AuthProvider({ children }) {
  const clearAuth = useAppStore((s) => s.clearAuth);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthToken(null);
      clearAuth();
    });
  }, [clearAuth]);

  return children;
}

export function ProtectedRoute() {
  const { data, isLoading, isError, error } = useMe();
  const location = useLocation();
  const organizationId = useAppStore((state) => state.organizationId);

  useEffect(() => {
    if (!data?.user) return;
    const store = useAppStore.getState();
    if (store.user?.id !== data.user.id) {
      store.setAuth(data.user);
    }
    const currentOrgId = store.organizationId;
    const activeOrg =
      data.organizations?.find((o) => o.id === currentOrgId) ||
      data.organizations?.[0];
    if (
      activeOrg &&
      (store.organizationId !== activeOrg.id ||
        store.organization?.id !== activeOrg.id)
    ) {
      setOrganizationId(activeOrg.id);
      store.setOrganization(activeOrg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const activeOrganization =
    data?.organizations?.find(
      (organization) => organization.id === organizationId,
    ) || data?.organizations?.[0];
  const organizationReady =
    !data?.organizations?.length || organizationId === activeOrganization?.id;

  if (isLoading || !organizationReady) {
    return (
      <div className="auth-loading">
        <p>Loading workspace…</p>
      </div>
    );
  }

  if (isError) {
    if (error?.status === 401 || !error?.status) {
      return (
        <Navigate to="/login" replace state={{ from: location.pathname }} />
      );
    }
    return <ErrorPage type="network" />;
  }

  if (!data?.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (data.organizations?.length === 0 && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  if (data.organizations?.length > 0 && location.pathname === "/onboarding") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export function GuestRoute() {
  const { data, isLoading } = useMe();
  if (isLoading) return null;
  if (data?.user) {
    if (!data.organizations?.length) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
