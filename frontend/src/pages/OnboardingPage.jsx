import { ArrowLeft, ArrowRight, Check, Plus, Workflow, X } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Button, Field } from "../components/ui/index.jsx"
import { authService } from "../services/authService.js"
import { projectService } from "../services/projectService.js"
import { useAppStore } from "../store/useAppStore.js"
import { queryKeys } from "../hooks/queryKeys.js"
import { setOrganizationId } from "../api/client.js"

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [teamType, setTeamType] = useState("Product & engineering")
  const [workspaceName, setWorkspaceName] = useState("Acme Technologies")
  const [workspaceSlug, setWorkspaceSlug] = useState("acme")
  const [projectType, setProjectType] = useState("Kanban")
  const [projectName, setProjectName] = useState("Website Redesign")
  const [invite, setInvite] = useState("")
  const [invites, setInvites] = useState(["sarah@acme.io", "rahul@acme.io"])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setOrganization = useAppStore((state) => state.setOrganization)

  const handleFinish = async () => {
    try {
      setLoading(true)
      setError("")
      const result = await authService.completeOnboarding({
        workspaceName: workspaceName.trim() || "My Workspace",
        workspaceSlug: workspaceSlug.trim() || undefined,
        invites,
      })

      if (result.organization) {
        setOrganizationId(result.organization.id)
        setOrganization(result.organization)
      }

      if (projectName.trim()) {
        try {
          await projectService.create({
            name: projectName.trim(),
            description: "Initial workspace project.",
            status: "Planning",
          })
        } catch {
          // ignore initial project creation error if duplicate
        }
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations })
      navigate("/dashboard")
    } catch (err) {
      setError(err.message || "Failed to complete onboarding.")
    } finally {
      setLoading(false)
    }
  }

  const next = () => {
    if (step === 4) {
      handleFinish()
    } else {
      setStep(step + 1)
    }
  }

  const content = {
    1: {
      title: "Welcome to WorkFlow",
      subtitle:
        "Let's tailor your workspace so your team can hit the ground running.",
      body: (
        <div className="onboarding-choice">
          {[
            "Product & engineering",
            "Design & creative",
            "Marketing",
            "Operations",
          ].map((name) => (
            <button
              className={teamType === name ? "selected" : ""}
              onClick={() => setTeamType(name)}
              key={name}
            >
              {name}
              {teamType === name && <Check size={15} />}
            </button>
          ))}
        </div>
      ),
    },
    2: {
      title: "Create your workspace",
      subtitle:
        "Your workspace is where your team will manage projects and collaborate.",
      body: (
        <>
          <Field label="Workspace name">
            <input
              className="input"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Acme Technologies"
              required
            />
          </Field>
          <Field label="Workspace URL">
            <div className="input-prefix">
              <span>workflow.com/</span>
              <input
                className="input"
                value={workspaceSlug}
                onChange={(e) => setWorkspaceSlug(e.target.value)}
                placeholder="acme"
              />
            </div>
          </Field>
        </>
      ),
    },
    3: {
      title: "Invite your team",
      subtitle:
        "Work is better together. Invite teammates now, or add them later.",
      body: (
        <div className="invite-list">
          <div>
            <input
              className="input"
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
              placeholder="teammate@company.com"
            />
            <Button
              variant="secondary"
              onClick={() => {
                if (invite.includes("@")) {
                  setInvites([...invites, invite.trim().toLowerCase()])
                  setInvite("")
                }
              }}
            >
              Add
            </Button>
          </div>
          {invites.map((email) => (
            <span key={email}>
              {email}
              <button
                onClick={() =>
                  setInvites(invites.filter((item) => item !== email))
                }
                aria-label={`Remove ${email}`}
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      ),
    },
    4: {
      title: "Create your first project",
      subtitle:
        "Give your team a focused place to organize tasks, files, and decisions.",
      body: (
        <>
          <Field label="Project name">
            <input
              className="input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Website Redesign"
              required
            />
          </Field>
          <Field label="Project type">
            <div className="project-types">
              {["Kanban", "Simple list", "Timeline"].map((name, index) => (
                <button
                  className={projectType === name ? "selected" : ""}
                  onClick={() => setProjectType(name)}
                  key={name}
                >
                  <span>{index === 0 ? "▦" : index === 1 ? "☷" : "⇥"}</span>
                  {name}
                </button>
              ))}
            </div>
          </Field>
        </>
      ),
    },
  }[step]

  return (
    <div className="onboarding">
      <header>
        <div className="auth-brand">
          <span>
            <Workflow size={21} />
          </span>
          <strong>WorkFlow</strong>
        </div>
        <button onClick={handleFinish} disabled={loading}>
          Skip setup
        </button>
      </header>
      <main>
        <div className="stepper">
          {[1, 2, 3, 4].map((number) => (
            <span key={number} className={number <= step ? "active" : ""}>
              <i>{number < step ? <Check size={13} /> : number}</i>
              <b>{["Welcome", "Workspace", "Team", "Project"][number - 1]}</b>
            </span>
          ))}
        </div>
        <div className="onboarding-card">
          <span className="step-label">STEP {step} OF 4</span>
          <h1>{content.title}</h1>
          <p>{content.subtitle}</p>
          <div className="onboarding-body">{content.body}</div>
          {error && <p className="form-error">{error}</p>}
          <footer>
            {step > 1 ? (
              <Button
                variant="secondary"
                icon={ArrowLeft}
                onClick={() => setStep(step - 1)}
                disabled={loading}
              >
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={next} loading={loading}>
              {step === 4 ? "Finish setup" : "Continue"}
              <ArrowRight size={16} />
            </Button>
          </footer>
        </div>
      </main>
    </div>
  )
}
