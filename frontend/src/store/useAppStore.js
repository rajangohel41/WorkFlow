import { create } from "zustand"
import { persist } from "zustand/middleware"
import { setOrganizationId } from "../api/client.js"

export const useAppStore = create(
  persist(
    (set, get) => ({
      collapsed: false,
      mobileNav: false,
      dark: false,
      themeMode: "light",
      notificationsOpen: false,
      commandOpen: false,
      createMenu: false,
      task: null,
      createModal: null,
      createModalStatus: "Backlog",
      createModalProjectId: null,
      workspaceMenu: false,
      organizationId: null,
      organization: null,
      workspace: "",
      user: null,
      role: "Member",
      favorites: [],
      recent: [],
      toasts: [],
      preferences: {
        assignments: true,
        mentions: true,
        projectUpdates: false,
      },
      profile: {
        name: "",
        email: "",
        title: "",
      },
      plan: "Business",
      toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
      setMobileNav: (mobileNav) => set({ mobileNav }),
      setTheme: (mode) => {
        const dark =
          mode === "dark" ||
          (mode === "system" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches)
        document.documentElement.classList.toggle("dark", dark)
        set({ dark, themeMode: mode })
      },
      toggleTheme: () => get().setTheme(get().dark ? "light" : "dark"),
      setNotifications: (notificationsOpen) => set({ notificationsOpen }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setCreateMenu: (createMenu) => set({ createMenu }),
      setTask: (task) => set({ task }),
      setCreateModal: (createModal, options = {}) =>
        set({
          createModal,
          createModalStatus: options.status || "Backlog",
          createModalProjectId: options.projectId || null,
          createMenu: false,
        }),
      setWorkspaceMenu: (workspaceMenu) => set({ workspaceMenu }),
      setAuth: (user) =>
        set({
          user,
          profile: {
            name: user.name,
            email: user.email,
            title: user.title || "",
          },
          preferences: user.preferences || get().preferences,
        }),
      clearAuth: () =>
        set({
          user: null,
          organization: null,
          organizationId: null,
          workspace: "",
          role: "Member",
          plan: "Business",
          profile: { name: "", email: "", title: "" },
          preferences: {
            assignments: true,
            mentions: true,
            projectUpdates: false,
          },
          favorites: [],
          recent: [],
          notificationsOpen: false,
          commandOpen: false,
          createMenu: false,
          createModal: null,
          workspaceMenu: false,
          task: null,
        }),
      setOrganization: (organization) => {
        if (organization?.id) {
          setOrganizationId(organization.id)
        }
        set({
          organization,
          organizationId: organization?.id || null,
          workspace: organization?.name || "",
          role: organization?.role || "Member",
          plan: organization?.plan || "Business",
          workspaceMenu: false,
        })
      },
      addToast: (message, tone = "success") => {
        const id = Date.now() + Math.random()
        set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }))
        window.setTimeout(() => get().dismissToast(id), 3200)
      },
      dismissToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((toast) => toast.id !== id),
        })),
      addRecent: (item) =>
        set((state) => ({
          recent: [
            item,
            ...state.recent.filter((recent) => recent.id !== item.id),
          ].slice(0, 10),
        })),
      updatePreferences: (key, value) =>
        set((state) => ({
          preferences: { ...state.preferences, [key]: value },
        })),
      updateProfileLocal: (profile) => set({ profile }),
      setPlan: (plan) => {
        set({ plan })
        get().addToast(`Plan changed to ${plan}`, "success")
      },
    }),
    {
      name: "workflow-app",
      partialize: (state) => ({
        dark: state.dark,
        themeMode: state.themeMode,
        organizationId: state.organizationId,
        favorites: state.favorites,
        recent: state.recent,
        preferences: state.preferences,
        profile: state.profile,
        plan: state.plan,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setTheme(state.themeMode || (state.dark ? "dark" : "light"))
        if (state?.organizationId) {
          setOrganizationId(state.organizationId)
        }
      },
    },
  ),
)
