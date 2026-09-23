import {
  Bell,
  Building2,
  Check,
  ChevronRight,
  CreditCard,
  LockKeyhole,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import { useState, useEffect } from "react"
import { useAppStore } from "../../store/useAppStore.js"
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  PageHeader,
  ProgressBar,
  Modal,
} from "../../components/ui/index.jsx"
import { useWorkflowMutations } from "../../hooks/useWorkflowQueries.js"
import { organizationService } from "../../services/organizationService.js"
import { authService } from "../../services/authService.js"

const settingsNav = [
  ["General", Building2, "/settings"],
  ["Profile", UserRound, "/settings/profile"],
  ["Notifications", Bell, "/settings/notifications"],
  ["Security", LockKeyhole, "/settings/security"],
  ["Members", UsersRound, "/team"],
  ["Billing", CreditCard, "/settings/billing"],
  ["Appearance", Monitor, "/settings/appearance"],
]

function General() {
  const addToast = useAppStore((state) => state.addToast)
  const organization = useAppStore((state) => state.organization)
  const setOrganization = useAppStore((state) => state.setOrganization)

  const [name, setName] = useState(organization?.name || "Acme Technologies")
  const [slug, setSlug] = useState(organization?.slug || "acme-technologies")
  const [view, setView] = useState("Board")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (organization?.name) setName(organization.name)
    if (organization?.slug) setSlug(organization.slug)
  }, [organization])

  const handleSave = async () => {
    try {
      setSaving(true)
      const updated = await organizationService.updateCurrent({ name })
      setOrganization({ ...organization, ...updated })
      addToast("Workspace settings saved", "success")
    } catch (err) {
      addToast(err.message || "Failed to update workspace", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      title="Workspace settings"
      subtitle="Manage your workspace details and preferences."
    >
      <Field
        label="Workspace name"
        hint="This is the name visible to everyone in your workspace."
      >
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Workspace URL">
        <div className="input-prefix">
          <span>workflow.com/</span>
          <input
            className="input"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
      </Field>
      <Field label="Default project view">
        <select
          className="input"
          value={view}
          onChange={(e) => setView(e.target.value)}
        >
          <option>Board</option>
          <option>List</option>
          <option>Timeline</option>
        </select>
      </Field>
      <Save onSave={handleSave} loading={saving} />
    </SettingsSection>
  )
}

function Profile() {
  const { profile, user } = useAppStore()
  const { updateProfile } = useWorkflowMutations()
  const addToast = useAppStore((state) => state.addToast)

  const [draft, setDraft] = useState({
    name: profile.name || user?.name || "",
    title: profile.title || user?.title || "",
    email: profile.email || user?.email || "",
    bio: "Product leader focused on building thoughtful software and high-performing teams.",
  })

  useEffect(() => {
    if (user?.name || profile.name) {
      setDraft((d) => ({
        ...d,
        name: user?.name || profile.name,
        email: user?.email || profile.email,
        title: user?.title || profile.title || d.title,
      }))
    }
  }, [user, profile])

  const currentUser = {
    name: draft.name || "User",
    initials: (draft.name || "User")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2),
    color: "#6366F1",
  }

  const handleSave = () => {
    updateProfile.mutate({
      name: draft.name,
      title: draft.title,
    })
  }

  return (
    <SettingsSection
      title="Profile"
      subtitle="Manage your personal information and public profile."
    >
      <div className="avatar-setting">
        <Avatar person={currentUser} />
        <div>
          <strong>Profile photo</strong>
          <small>JPG or PNG. Max size 2MB.</small>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            addToast("Choose a profile image from your device", "info")
          }
        >
          Change photo
        </Button>
      </div>
      <div className="field-row">
        <Field label="Full name">
          <input
            className="input"
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </Field>
        <Field label="Job title">
          <input
            className="input"
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </Field>
      </div>
      <Field label="Email address">
        <input
          className="input"
          type="email"
          value={draft.email}
          disabled
          title="Email address cannot be changed directly."
        />
      </Field>
      <Field label="Bio">
        <textarea
          className="input textarea"
          value={draft.bio}
          onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
        />
      </Field>
      <Save onSave={handleSave} loading={updateProfile.isPending} />
    </SettingsSection>
  )
}

function Notifications() {
  const { preferences, updatePreferences: updateStorePref } = useAppStore()
  const { updatePreferences } = useWorkflowMutations()
  const addToast = useAppStore((state) => state.addToast)

  const [prefs, setPrefs] = useState(preferences)

  const toggle = (key) => {
    const updated = { ...prefs, [key]: !prefs[key] }
    setPrefs(updated)
    updateStorePref(key, !prefs[key])
  }

  const handleSave = () => {
    updatePreferences.mutate(prefs, {
      onSuccess: () => addToast("Notification preferences saved"),
    })
  }

  return (
    <SettingsSection
      title="Notifications"
      subtitle="Choose what you want to be notified about."
    >
      <div className="toggle-list">
        {[
          [
            "email",
            "Email notifications",
            "Receive a daily digest and important workspace updates.",
          ],
          [
            "assignments",
            "Task assignments",
            "Notify me when I'm assigned a new task.",
          ],
          [
            "mentions",
            "Mentions",
            "Notify me when someone mentions me.",
          ],
          [
            "projectUpdates",
            "Project updates",
            "Receive status and deadline updates for followed projects.",
          ],
        ].map(([key, title, text]) => (
          <div key={key}>
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(prefs[key])}
                onChange={() => toggle(key)}
              />
              <i />
            </label>
          </div>
        ))}
      </div>
      <Save onSave={handleSave} loading={updatePreferences.isPending} />
    </SettingsSection>
  )
}

function Security() {
  const { addToast } = useAppStore()
  const [twoFactor, setTwoFactor] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setError("")
    if (newPassword.length < 8) {
      return setError("New password must contain at least 8 characters.")
    }
    if (newPassword !== confirmPassword) {
      return setError("New passwords do not match.")
    }
    try {
      setLoading(true)
      await authService.changePassword({ currentPassword, newPassword })
      addToast("Password changed successfully", "success")
      setModalOpen(false)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      setError(err.message || "Failed to change password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <SettingsSection
      title="Security"
      subtitle="Protect your account and manage active sessions."
    >
      <Card className="security-item">
        <span>
          <LockKeyhole size={18} />
          <span>
            <strong>Password</strong>
            <small>Ensure your account is using a strong password</small>
          </span>
        </span>
        <Button variant="secondary" onClick={() => setModalOpen(true)}>
          Change password
        </Button>
      </Card>
      <Card className="security-item">
        <span>
          <ShieldCheck size={18} />
          <span>
            <strong>Two-factor authentication</strong>
            <small>Add an extra layer of security to your account</small>
          </span>
        </span>
        <Button
          onClick={() => {
            setTwoFactor(!twoFactor)
            addToast(
              `Two-factor authentication ${twoFactor ? "disabled" : "enabled"}`,
            )
          }}
        >
          {twoFactor ? "Disable 2FA" : "Enable 2FA"}
        </Button>
      </Card>
      <h3 className="settings-subtitle">Active sessions</h3>
      <div className="session">
        <Monitor size={19} />
        <span>
          <strong>
            Current Browser <Badge tone="success">Current</Badge>
          </strong>
          <small>Active session</small>
        </span>
        <button onClick={() => addToast("Other sessions signed out", "info")}>
          Sign out others
        </button>
      </div>

      {modalOpen && (
        <Modal title="Change password" onClose={() => setModalOpen(false)}>
          <form className="modal-form" onSubmit={handleChangePassword}>
            <Field label="Current password">
              <input
                type="password"
                className="input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="New password" hint="Minimum 8 characters">
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </Field>
            {error && <p className="form-error">{error}</p>}
            <footer className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={loading}>
                Update password
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </SettingsSection>
  )
}

function Billing() {
  const { plan, setPlan, addToast, organization, setOrganization } = useAppStore()
  const [currentPlan, setCurrentPlan] = useState(organization?.plan || plan || "Business")

  const handlePlanChange = async (newPlan) => {
    setCurrentPlan(newPlan)
    setPlan(newPlan)
    try {
      const updated = await organizationService.updateCurrent({ plan: newPlan })
      setOrganization({ ...organization, ...updated })
      addToast(`Plan changed to ${newPlan}`, "success")
    } catch {
      addToast(`Plan updated locally to ${newPlan}`, "info")
    }
  }

  return (
    <SettingsSection
      title="Billing & plan"
      subtitle="Manage your subscription, usage, and invoices."
    >
      <div className="plan-card">
        <div>
          <span>
            <Zap size={18} />
          </span>
          <div>
            <Badge tone="purple">{currentPlan.toUpperCase()}</Badge>
            <h3>
              {currentPlan === "Free" ? "$0" : currentPlan === "Pro" ? "$10" : "$16"}{" "}
              <small>/ member / month</small>
            </h3>
            <p>Active workspace subscription</p>
          </div>
        </div>
        <select
          className="plan-select"
          value={currentPlan}
          onChange={(event) => handlePlanChange(event.target.value)}
          aria-label="Select plan"
        >
          <option>Free</option>
          <option>Pro</option>
          <option>Business</option>
        </select>
      </div>
      <div className="usage">
        <h3>Plan usage</h3>
        {[
          ["Team members", 5, currentPlan === "Free" ? 5 : currentPlan === "Pro" ? 15 : 50],
          ["Projects", 5, currentPlan === "Free" ? 5 : currentPlan === "Pro" ? 20 : 100],
          ["Storage", 12, currentPlan === "Free" ? 20 : currentPlan === "Pro" ? 50 : 250],
        ].map(([label, value, max]) => (
          <div key={label}>
            <div>
              <span>{label}</span>
              <strong>
                {value} of {max}
                {label === "Storage" ? " GB" : ""}
              </strong>
            </div>
            <ProgressBar value={(value / max) * 100} />
          </div>
        ))}
      </div>
      <h3 className="settings-subtitle">Recent invoices</h3>
      <div className="invoice">
        <span>
          <strong>Current Billing Period</strong>
          <small>{currentPlan} plan</small>
        </span>
        <strong>{currentPlan === "Free" ? "$0.00" : "$80.00"}</strong>
        <Badge tone="success">Active</Badge>
        <button onClick={() => addToast("Billing statement generated", "info")}>
          Download
        </button>
      </div>
    </SettingsSection>
  )
}

function Appearance() {
  const { dark, setTheme, themeMode, addToast } = useAppStore()
  return (
    <SettingsSection
      title="Appearance"
      subtitle="Customize how WorkFlow looks on your device."
    >
      <div className="theme-options">
        {[
          ["Light", Sun],
          ["Dark", Moon],
          ["System", Monitor],
        ].map(([name, Icon]) => (
          <button
            className={
              (dark && name === "Dark") || (!dark && name === "Light")
                ? "selected"
                : ""
            }
            onClick={() => setTheme(name.toLowerCase())}
            key={name}
          >
            <span>
              <Icon size={22} />
            </span>
            <strong>{name}</strong>
            {((dark && name === "Dark") || (!dark && name === "Light")) && (
              <i>
                <Check size={13} />
              </i>
            )}
          </button>
        ))}
      </div>
      <Save onSave={() => addToast("Appearance preference saved")} />
    </SettingsSection>
  )
}

function Save({ onSave, loading = false }) {
  return (
    <div className="settings-save">
      <Button variant="secondary" onClick={() => history.back()}>
        Cancel
      </Button>
      <Button onClick={onSave} loading={loading}>
        Save changes
      </Button>
    </div>
  )
}

function SettingsSection({ title, subtitle, children }) {
  return (
    <Card className="settings-content">
      <div className="settings-heading">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="settings-form">{children}</div>
    </Card>
  )
}

export default function SettingsPage() {
  const path = useLocation().pathname
  const content = path.endsWith("/profile") ? (
    <Profile />
  ) : path.endsWith("/notifications") ? (
    <Notifications />
  ) : path.endsWith("/security") ? (
    <Security />
  ) : path.endsWith("/billing") ? (
    <Billing />
  ) : path.endsWith("/appearance") ? (
    <Appearance />
  ) : (
    <General />
  )
  return (
    <div className="page settings-page">
      <PageHeader
        title="Settings"
        subtitle="Manage your workspace and account preferences."
      />
      <div className="settings-layout">
        <nav className="settings-nav">
          {settingsNav.map(([label, Icon, to]) => (
            <NavLink end={to === "/settings"} to={to} key={label}>
              <Icon size={17} />
              <span>{label}</span>
              <ChevronRight size={14} />
            </NavLink>
          ))}
        </nav>
        {content}
      </div>
    </div>
  )
}
