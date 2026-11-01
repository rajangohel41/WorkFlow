import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, PasswordInput } from "../../components/ui/index.jsx";
import { authService } from "../../services/authService.js";
import { useAppStore } from "../../store/useAppStore.js";
import { queryKeys } from "../../hooks/queryKeys.js";
import { setOrganizationId } from "../../api/client.js";
import { GoogleSignInButton } from "../../components/auth/GoogleSignInButton.jsx";

const strongPasswordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  name: z.string().min(2, "Enter your full name"),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must contain at least 8 characters")
    .refine(
      (value) => strongPasswordRegex.test(value),
      "Password must include uppercase, lowercase, a number, and a symbol",
    ),
});

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
  );
}

function AccountLinkingCard({ linkData, onCancel, onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setError("Please enter your existing password");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await authService.googleLogin({
        idToken: linkData.idToken,
        password,
      });
      onSuccess(result);
    } catch (err) {
      setError(err.message || "Failed to link account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      eyebrow="SECURITY VERIFICATION"
      title="Link Google Account"
      subtitle={`An account with ${linkData.email} already exists.`}
    >
      <div
        style={{
          marginBottom: "1.25rem",
          padding: "0.85rem 1rem",
          borderRadius: "0.5rem",
          backgroundColor: "rgba(99, 102, 241, 0.08)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          fontSize: "0.8125rem",
          color: "var(--color-text, #334155)",
          lineHeight: 1.5,
        }}
      >
        To prevent unauthorized account takeover, please verify your ownership by entering your existing password. Once linked, you can sign in anytime using either Google or your password.
      </div>
      <form onSubmit={handleSubmit}>
        <Field label="Account Password" error={error}>
          <PasswordInput
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </Field>
        {error && <p className="form-error">{error}</p>}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <Button type="submit" loading={loading} className="full">
            Link & Sign In <ArrowRight size={16} />
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}

export function LoginPage() {
  const [formError, setFormError] = useState("");
  const [linkData, setLinkData] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const setAuth = useAppStore((s) => s.setAuth);
  const setOrganization = useAppStore((s) => s.setOrganization);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const handlePostAuthSuccess = async (result) => {
    setAuth(result.user);
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    const me = await authService.me();
    if (!me.organizations?.length) {
      navigate("/onboarding");
    } else {
      const currentId = useAppStore.getState().organizationId;
      const organization =
        me.organizations.find((o) => o.id === currentId) ||
        me.organizations.find((o) => o.role !== "Owner") ||
        me.organizations[0];
      setOrganizationId(organization.id);
      setOrganization(organization);
      navigate(location.state?.from || "/dashboard");
    }
  };

  if (linkData) {
    return (
      <AccountLinkingCard
        linkData={linkData}
        onCancel={() => setLinkData(null)}
        onSuccess={handlePostAuthSuccess}
      />
    );
  }

  return (
    <AuthCard
      eyebrow="WELCOME BACK"
      title="Sign in to your workspace"
      subtitle="Enter your details to continue to WorkFlow."
    >
      <form
        onSubmit={handleSubmit(async (values) => {
          setFormError("");
          try {
            const result = await authService.login(values);
            await handlePostAuthSuccess(result);
          } catch (error) {
            setFormError(error.message || "Unable to sign in");
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
          <PasswordInput
            placeholder="••••••••"
            autoComplete="current-password"
            {...register("password")}
          />
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          margin: "1.25rem 0",
          color: "var(--muted, #64748b)",
          fontSize: "0.8125rem",
        }}
      >
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border, #e2e8f0)" }} />
        <span
          style={{
            padding: "0 0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontSize: "0.75rem",
            fontWeight: 500,
          }}
        >
          or
        </span>
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border, #e2e8f0)" }} />
      </div>

      <GoogleSignInButton
        text="Continue with Google"
        onLinkRequired={(data) => setLinkData(data)}
        onError={(err) => setFormError(err)}
      />

      <p className="auth-switch">
        New to WorkFlow? <Link to="/signup">Create an account</Link>
      </p>
      <div
        style={{
          marginTop: "1.25rem",
          padding: "0.85rem 1rem",
          borderRadius: "0.5rem",
          backgroundColor: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          fontSize: "0.8125rem",
          color: "var(--color-text, #334155)",
          lineHeight: 1.5,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontWeight: 600,
            color: "#2563eb",
            marginBottom: "0.25rem",
          }}
        >
          <Sparkles size={14} /> Reviewer & Hiring Team Note
        </div>
        <div>
          To test the full authenticated app (Dashboard, Kanban, Tasks, Calendar, Settings), you can{" "}
          <Link
            to="/signup"
            style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline" }}
          >
            create an instant account
          </Link>{" "}
          (no email verification required), or explore the read-only{" "}
          <Link
            to="/demo"
            style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline" }}
          >
            Live Interactive Demo
          </Link>.
        </div>
      </div>
    </AuthCard>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setAuth = useAppStore((s) => s.setAuth);
  const setOrganization = useAppStore((s) => s.setOrganization);
  const [formError, setFormError] = useState("");
  const [linkData, setLinkData] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signupSchema) });

  const handlePostAuthSuccess = async (result) => {
    setAuth(result.user);
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    const me = await authService.me();
    if (!me.organizations?.length) {
      navigate("/onboarding");
    } else {
      const currentId = useAppStore.getState().organizationId;
      const organization =
        me.organizations.find((o) => o.id === currentId) ||
        me.organizations.find((o) => o.role !== "Owner") ||
        me.organizations[0];
      setOrganizationId(organization.id);
      setOrganization(organization);
      navigate("/dashboard");
    }
  };

  if (linkData) {
    return (
      <AccountLinkingCard
        linkData={linkData}
        onCancel={() => setLinkData(null)}
        onSuccess={handlePostAuthSuccess}
      />
    );
  }

  return (
    <AuthCard
      eyebrow="START BUILDING"
      title="Create your account"
      subtitle="Join teams doing their best work with WorkFlow."
    >
      <form
        onSubmit={handleSubmit(async (values) => {
          setFormError("");
          try {
            const result = await authService.register(values);
            setAuth(result.user);
            if (result.organization) {
              setOrganizationId(result.organization.id);
              setOrganization({ ...result.organization, role: "Owner" });
            }
            await queryClient.invalidateQueries({ queryKey: queryKeys.me });
            navigate(result.organization ? "/dashboard" : "/onboarding");
          } catch (error) {
            setFormError(error.message || "Unable to create account");
          }
        })}
      >
        <Field label="Full name" error={errors.name?.message}>
          <input
            className="input"
            placeholder="Jane Smith"
            {...register("name")}
          />
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
          hint="Use at least 8 characters with uppercase, lowercase, a number, and a symbol."
          error={errors.password?.message}
        >
          <PasswordInput
            placeholder="Create a strong password"
            autoComplete="new-password"
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          margin: "1.25rem 0",
          color: "var(--muted, #64748b)",
          fontSize: "0.8125rem",
        }}
      >
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border, #e2e8f0)" }} />
        <span
          style={{
            padding: "0 0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontSize: "0.75rem",
            fontWeight: 500,
          }}
        >
          or
        </span>
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border, #e2e8f0)" }} />
      </div>

      <GoogleSignInButton
        text="Continue with Google"
        onLinkRequired={(data) => setLinkData(data)}
        onError={(err) => setFormError(err)}
      />

      <p className="auth-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthCard>
  );
}

export function ForgotPasswordPage({ reset = false }) {
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [params] = useSearchParams();
  const token = params.get("token");
  const [formError, setFormError] = useState("");

  if (!reset) {
    if (sent) {
      return (
        <AuthCard
          title="Check your email"
          subtitle="If an account matches that email address, password reset instructions have been generated."
        >
          <div className="success-mark">
            <CheckCircle2 size={30} />
          </div>
          {devToken ? (
            <div style={{ marginTop: "1rem", textAlign: "center" }}>
              <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted, #64748b)", marginBottom: "0.75rem" }}>
                <strong>Development Mode:</strong> A reset token was generated.
              </p>
              <Button
                className="full"
                onClick={() => location.assign(`/reset-password?token=${encodeURIComponent(devToken)}`)}
              >
                Proceed with reset token
              </Button>
            </div>
          ) : (
            <Button className="full" onClick={() => location.assign("/login")}>
              Back to sign in
            </Button>
          )}
          <Link className="back-link" to="/login" style={{ marginTop: "1rem" }}>
            <ArrowLeft size={15} />
            Back to sign in
          </Link>
        </AuthCard>
      );
    }

    return (
      <AuthCard
        title="Reset your password"
        subtitle="Enter the email address associated with your WorkFlow account."
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setFormError("");
            setLoading(true);
            const data = Object.fromEntries(new FormData(event.currentTarget));
            try {
              const res = await authService.forgotPassword({
                email: String(data.email || "").trim(),
              });
              if (res?.devResetToken) {
                setDevToken(res.devResetToken);
              }
              setSent(true);
            } catch (error) {
              setFormError(
                error.message ||
                  "Self-service password recovery is unavailable. Contact system support or reset from Settings if logged in.",
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="Email address">
            <input
              name="email"
              type="email"
              className="input"
              required
              placeholder="alex@company.com"
              autoComplete="email"
            />
          </Field>
          {formError && <p className="form-error">{formError}</p>}
          <Button className="full" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send reset instructions"}
          </Button>
        </form>
        <Link className="back-link" to="/login">
          <ArrowLeft size={15} />
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  if (sent)
    return (
      <AuthCard
        title="Password updated"
        subtitle="Your password has been reset successfully."
      >
        <div className="success-mark">
          <CheckCircle2 size={30} />
        </div>
        <Button className="full" onClick={() => location.assign("/login")}>
          Back to sign in
        </Button>
      </AuthCard>
    );
  return (
    <AuthCard
      title="Set a new password"
      subtitle="Choose a secure password you haven't used before."
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setFormError("");
          const data = Object.fromEntries(new FormData(event.currentTarget));
          try {
            if (!strongPasswordRegex.test(String(data.password || ""))) {
              setFormError(
                "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.",
              );
              return;
            }
            if (data.password !== data.confirm) {
              setFormError("Passwords do not match");
              return;
            }
            await authService.resetPassword({
              token: token || data.token,
              password: data.password,
            });
            setSent(true);
          } catch (error) {
            setFormError(error.message || "Request failed");
          }
        }}
      >
        {!token && (
          <Field label="Reset token">
            <input name="token" className="input" required />
          </Field>
        )}
        <Field label="New password">
          <PasswordInput
            name="password"
            required
            placeholder="New password"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm password">
          <PasswordInput
            name="confirm"
            required
            placeholder="Confirm password"
            autoComplete="new-password"
          />
        </Field>
        {formError && (
          <div style={{ marginTop: "0.25rem", marginBottom: "0.75rem" }}>
            <p className="form-error" style={{ marginBottom: "0.5rem" }}>
              {formError}
            </p>
            {formError.toLowerCase().includes("invalid") ||
            formError.toLowerCase().includes("expired") ? (
              <Link
                to="/forgot-password"
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--primary)",
                  textDecoration: "underline",
                }}
              >
                Request a new reset link
              </Link>
            ) : null}
          </div>
        )}
        <Button className="full" type="submit">
          Reset password
        </Button>
      </form>
      <Link className="back-link" to="/login">
        <ArrowLeft size={15} />
        Back to sign in
      </Link>
    </AuthCard>
  );
}
