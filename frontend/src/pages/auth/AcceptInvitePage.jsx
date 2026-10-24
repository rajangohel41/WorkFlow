import { useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { useCurrentUser, useWorkflowMutations } from "../../hooks/useWorkflowQueries.js"
import { useAppStore } from "../../store/useAppStore.js"
import { setOrganizationId } from "../../api/client.js"
import { Button } from "../../components/ui/index.jsx"
import { Mail, CheckCircle2, AlertCircle } from "lucide-react"

export default function AcceptInvitePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { data: meData, isLoading: meLoading } = useCurrentUser()
  const currentUser = meData?.user
  const { acceptInvitation } = useWorkflowMutations()
  const setOrganization = useAppStore((s) => s.setOrganization)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const handleAccept = async () => {
    if (!token) return
    setError("")
    setLoading(true)
    try {
      const res = await acceptInvitation.mutateAsync(token)
      if (res?.organization) {
        setOrganizationId(res.organization.id)
        setOrganization(res.organization)
      }
      setSuccess(true)
      setTimeout(() => {
        navigate("/dashboard")
      }, 1000)
    } catch (err) {
      setError(err?.message || "Failed to accept invitation")
    } finally {
      setLoading(false)
    }
  }

  if (meLoading) {
    return (
      <div className="auth-card">
        <p>Loading invitation...</p>
      </div>
    )
  }

  return (
    <div className="auth-card" style={{ maxWidth: "440px", margin: "2rem auto", textAlign: "center" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            color: "#6366F1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1rem auto",
          }}
        >
          {success ? <CheckCircle2 size={32} color="#10B981" /> : <Mail size={32} />}
        </div>
        <h2>{success ? "Welcome to the Team!" : "Workspace Invitation"}</h2>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
          {success
            ? "Your invitation has been accepted. Redirecting to workspace..."
            : "You have been invited to collaborate on WorkFlow."}
        </p>
      </div>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem",
            borderRadius: "8px",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "#EF4444",
            marginBottom: "1rem",
            textAlign: "left",
            fontSize: "0.875rem",
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {currentUser ? (
        <div>
          <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
            Signed in as <strong>{currentUser.email}</strong>
          </p>
          {!success && (
            <Button
              className="button button-primary"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={loading}
              onClick={handleAccept}
            >
              {loading ? "Accepting..." : "Accept Invitation"}
            </Button>
          )}
        </div>
      ) : (
        <div>
          <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
            Please sign in with the email address that received the invitation.
          </p>
          <Link
            to="/login"
            state={{ from: `/invite/${token}` }}
            className="button button-primary"
            style={{ display: "block", textAlign: "center", textDecoration: "none" }}
          >
            Sign in to Accept
          </Link>
        </div>
      )}
    </div>
  )
}
