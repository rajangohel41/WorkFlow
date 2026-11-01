import { useState, useEffect, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { authService } from "../../services/authService.js"
import { useAppStore } from "../../store/useAppStore.js"
import { queryKeys } from "../../hooks/queryKeys.js"
import { setOrganizationId } from "../../api/client.js"

// Official Google "G" multicolored SVG logo
export function GoogleIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  )
}

export function GoogleSignInButton({
  text = "Continue with Google",
  onLinkRequired,
  onError,
}) {
  const [loading, setLoading] = useState(false)
  const [gsiReady, setGsiReady] = useState(false)
  const hiddenBtnRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const setAuth = useAppStore((s) => s.setAuth)
  const setOrganization = useAppStore((s) => s.setOrganization)

  const googleClientId =
    (typeof import.meta !== "undefined" &&
      import.meta.env?.VITE_GOOGLE_CLIENT_ID) ||
    ""

  const handleCredentialResponse = async (response) => {
    if (!response?.credential) {
      if (onError) onError("No credential returned from Google.")
      return
    }

    setLoading(true)
    if (onError) onError("")

    try {
      const result = await authService.googleLogin({
        idToken: response.credential,
      })

      if (result.linkRequired) {
        if (onLinkRequired) {
          onLinkRequired({
            email: result.email,
            idToken: response.credential,
            message: result.message,
          })
        }
        return
      }

      // Successful sign in or new registration
      setAuth(result.user)
      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
      const me = await authService.me()

      if (!me.organizations?.length) {
        navigate("/onboarding")
      } else {
        const currentId = useAppStore.getState().organizationId
        const organization =
          me.organizations.find((o) => o.id === currentId) ||
          me.organizations.find((o) => o.role !== "Owner") ||
          me.organizations[0]
        setOrganizationId(organization.id)
        setOrganization(organization)
        navigate(location.state?.from || "/dashboard")
      }
    } catch (err) {
      if (err.data?.linkRequired && onLinkRequired) {
        onLinkRequired({
          email: err.data.email,
          idToken: response.credential,
          message: err.data.message || err.message,
        })
      } else if (onError) {
        onError(err.message || "Failed to sign in with Google")
      }
    } finally {
      setLoading(false)
    }
  }

  // Dynamically load Google Identity Services script
  useEffect(() => {
    if (typeof window === "undefined") return

    if (!googleClientId) {
      // In dev or until client ID is configured
      return
    }

    const initGsi = () => {
      if (!window.google?.accounts?.id) return
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        })
        setGsiReady(true)

        // Render hidden official Google button to trigger programmatic click
        if (hiddenBtnRef.current) {
          window.google.accounts.id.renderButton(hiddenBtnRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "signin_with",
            width: 250,
          })
        }
      } catch (e) {
        console.warn("Failed to initialize Google Identity Services:", e)
      }
    }

    if (window.google?.accounts?.id) {
      initGsi()
      return
    }

    const existingScript = document.getElementById("google-gsi-script")
    if (!existingScript) {
      const script = document.createElement("script")
      script.id = "google-gsi-script"
      script.src = "https://accounts.google.com/gsi/client"
      script.async = true
      script.defer = true
      script.onload = () => initGsi()
      document.head.appendChild(script)
    } else {
      existingScript.addEventListener("load", initGsi)
    }
  }, [googleClientId])

  const handleClick = () => {
    if (!googleClientId) {
      if (onError) {
        onError(
          "Google Sign-In is not configured yet. Please set VITE_GOOGLE_CLIENT_ID in your environment variables.",
        )
      }
      return
    }

    if (loading) return

    // Trigger Google prompt or hidden button click
    if (window.google?.accounts?.id) {
      try {
        // Try clicking the rendered button first for best popup UX
        if (hiddenBtnRef.current) {
          const btn = hiddenBtnRef.current.querySelector('[role="button"]')
          if (btn) {
            btn.click()
            return
          }
        }
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed()) {
            // If One Tap was not displayed, simulate button click or inform user
            console.log("GIS prompt not displayed:", notification.getNotDisplayedReason())
          }
        })
      } catch (err) {
        console.warn("Google prompt error:", err)
        if (onError) onError("Failed to launch Google Sign-In prompt.")
      }
    } else {
      if (onError) {
        onError(
          "Google Identity Services is still loading or was blocked by a browser extension. Please check your network or ad blocker.",
        )
      }
    }
  }

  return (
    <div className="google-auth-wrapper" style={{ width: "100%", margin: "0.5rem 0" }}>
      {/* Hidden container for Google's native button */}
      <div
        ref={hiddenBtnRef}
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
        aria-hidden="true"
      />

      <button
        type="button"
        className="btn btn-secondary full google-btn"
        onClick={handleClick}
        disabled={loading}
        aria-label={text}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.625rem",
          fontWeight: 500,
          backgroundColor: "var(--surface, #ffffff)",
          border: "1px solid var(--border, #e2e8f0)",
          color: "var(--text, #0f172a)",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
          height: "42px",
          borderRadius: "8px",
          width: "100%",
          cursor: loading ? "wait" : "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <GoogleIcon size={18} />
        <span>{loading ? "Connecting to Google..." : text}</span>
      </button>
    </div>
  )
}
