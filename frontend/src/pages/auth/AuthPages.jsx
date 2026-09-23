import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Workflow,
} from "lucide-react"
import { useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useQueryClient } from "@tanstack/react-query"
import { Button, Field } from "../../components/ui/index.jsx"
import { authService } from "../../services/authService.js"
import { useAppStore } from "../../store/useAppStore.js"
import { queryKeys } from "../../hooks/queryKeys.js"

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

const signupSchema = z.object({
  name: z.string().min(2, "Enter your full name"),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

function AuthCard({ eyebrow, title, subtitle, children }) {
  return (
    <div className="auth-card">
      <div className="mobile-auth-brand">
        <span>
          <Workflow size={20} />
        </span>
        <strong>WorkFlow</strong>
      </div>
      {eyebrow && <span className="auth-eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {children}
    </div>
  )
}

export function LoginPage() {
  const [show, setShow] = useState(false)
  const [formError, setFormError] = useState("")
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const setAuth = useAppStore((s) => s.setAuth)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
  })
  return (
    <AuthCard
      eyebrow="WELCOME BACK"
      title="Sign in to your workspace"
      subtitle="Enter your details to continue to WorkFlow."
    >
      <form
        onSubmit={handleSubmit(async (values) => {
          setFormError("")
          try {
            const result = await authService.login(values)
            setAuth(result.user)
            await queryClient.invalidateQueries({ queryKey: queryKeys.me })
            const me = await authService.me()
            if (!me.user.emailVerified) navigate("/verify-email")
            else if (!me.organizations?.length) navigate("/onboarding")
            else navigate(location.state?.from || "/dashboard")
          } catch (error) {
            setFormError(error.message || "Unable to sign in")
          }
        })}
      >
        <Field label="Email address" error={errors.email?.message}>
          <div className="input-icon">
            <Mail size={17} />
            <input
              className="input"
              type="email"
              placeholder="you@company.com"
              {...register("email")}
            />
          </div>
        </Field>
        <Field
          label={
            <span className="label-row">
              Password <Link to="/forgot-password">Forgot password?</Link>
            </span>
          }
          error={errors.password?.message}
        >
          <div className="input-icon input-action">
            <LockKeyhole size={17} />
            <input
              className="input"
              type={show ? "text" : "password"}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label="Show password"
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </Field>
        <label className="remember">
          <input type="checkbox" defaultChecked />
          Remember me for 30 days
        </label>
        {formError && <p className="form-error">{formError}</p>}
        <Button type="submit" loading={isSubmitting} className="full">
          Sign in <ArrowRight size={16} />
        </Button>
      </form>
      <p className="auth-switch">
        New to WorkFlow? <Link to="/signup">Create an account</Link>
      </p>
    </AuthCard>
  )
}

export function SignupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setAuth = useAppStore((s) => s.setAuth)
  const [formError, setFormError] = useState("")
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signupSchema) })
  return (
    <AuthCard
      eyebrow="START BUILDING"
      title="Create your account"
      subtitle="Join teams doing their best work with WorkFlow."
    >
      <form
        onSubmit={handleSubmit(async (values) => {
          setFormError("")
          try {
            const result = await authService.register(values)
            setAuth(result.user)
            await queryClient.invalidateQueries({ queryKey: queryKeys.me })
            navigate("/verify-email")
          } catch (error) {
            setFormError(error.message || "Unable to create account")
          }
        })}
      >
        <Field label="Full name" error={errors.name?.message}>
          <input className="input" placeholder="Alex Kumar" {...register("name")} />
        </Field>
        <Field label="Work email" error={errors.email?.message}>
          <input
            className="input"
            type="email"
            placeholder="you@company.com"
            {...register("email")}
          />
        </Field>
        <Field
          label="Password"
          hint="Use at least 8 characters."
          error={errors.password?.message}
        >
          <input
            className="input"
            type="password"
            placeholder="Create a strong password"
            {...register("password")}
          />
        </Field>
        <label className="remember">
          <input type="checkbox" required />I agree to the Terms of Service and
          Privacy Policy
        </label>
        {formError && <p className="form-error">{formError}</p>}
        <Button type="submit" className="full" loading={isSubmitting}>
          Create account <ArrowRight size={16} />
        </Button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthCard>
  )
}

export function ForgotPasswordPage({ reset = false }) {
  const [sent, setSent] = useState(false)
  const [params] = useSearchParams()
  const token = params.get("token")
  const [formError, setFormError] = useState("")
  if (sent)
    return (
      <AuthCard
        title={reset ? "Password updated" : "Check your inbox"}
        subtitle={
          reset
            ? "Your password has been reset successfully."
            : "If an account exists for that email, we sent a reset link."
        }
      >
        <div className="success-mark">
          <CheckCircle2 size={30} />
        </div>
        <Button className="full" onClick={() => location.assign("/login")}>
          Back to sign in
        </Button>
      </AuthCard>
    )
  return (
    <AuthCard
      title={reset ? "Set a new password" : "Reset your password"}
      subtitle={
        reset
          ? "Choose a secure password you haven't used before."
          : "Enter your email and we'll send you a reset link."
      }
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setFormError("")
          const data = Object.fromEntries(new FormData(event.currentTarget))
          try {
            if (reset) {
              if (data.password !== data.confirm) {
                setFormError("Passwords do not match")
                return
              }
              await authService.resetPassword({
                token: token || data.token,
                password: data.password,
              })
            } else {
              await authService.forgotPassword(data.email)
            }
            setSent(true)
          } catch (error) {
            setFormError(error.message || "Request failed")
          }
        }}
      >
        {reset ? (
          <>
            {!token && (
              <Field label="Reset token">
                <input name="token" className="input" required />
              </Field>
            )}
            <Field label="New password">
              <input name="password" className="input" type="password" required />
            </Field>
            <Field label="Confirm password">
              <input name="confirm" className="input" type="password" required />
            </Field>
          </>
        ) : (
          <Field label="Email address">
            <input
              name="email"
              className="input"
              type="email"
              placeholder="you@company.com"
              required
            />
          </Field>
        )}
        {formError && <p className="form-error">{formError}</p>}
        <Button className="full" type="submit">
          {reset ? "Reset password" : "Send reset link"}
        </Button>
      </form>
      <Link className="back-link" to="/login">
        <ArrowLeft size={15} />
        Back to sign in
      </Link>
    </AuthCard>
  )
}

export function VerifyPage() {
  const [resent, setResent] = useState(false)
  const [code, setCode] = useState(["", "", "", "", "", ""])
  const [error, setError] = useState("")
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const profile = useAppStore((s) => s.profile)
  const updateDigits = (index, value) => {
    const next = [...code]
    next[index] = value.slice(-1)
    setCode(next)
  }
  return (
    <AuthCard
      title="Verify your email"
      subtitle={`We've sent a six-digit verification code to ${profile.email || "your email"}.`}
    >
      <div className="otp">
        {code.map((digit, index) => (
          <input
            key={index}
            value={digit}
            onChange={(event) => updateDigits(index, event.target.value)}
            maxLength="1"
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      <Button
        className="full"
        onClick={async () => {
          setError("")
          try {
            await authService.verifyEmail(code.join(""))
            await queryClient.invalidateQueries({ queryKey: queryKeys.me })
            navigate("/onboarding")
          } catch (err) {
            setError(err.message || "Invalid code")
          }
        }}
      >
        Verify email
      </Button>
      <p className="auth-switch">
        {resent ? (
          "A new code was sent."
        ) : (
          <>
            Didn't receive a code?{" "}
            <button
              type="button"
              onClick={async () => {
                await authService.resendVerification()
                setResent(true)
              }}
            >
              Resend code
            </button>
          </>
        )}
      </p>
    </AuthCard>
  )
}
