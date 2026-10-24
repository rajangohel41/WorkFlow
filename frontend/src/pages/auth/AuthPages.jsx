import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
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
import { Button, Field } from "../../components/ui/index.jsx";
import { authService } from "../../services/authService.js";
import { useAppStore } from "../../store/useAppStore.js";
import { queryKeys } from "../../hooks/queryKeys.js";
import { setOrganizationId } from "../../api/client.js";

const strongPasswordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = z.object({
  name: z.string().min(2, "Enter your full name"),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(12, "Password must contain at least 12 characters")
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

export function LoginPage() {
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState("");
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
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setAuth = useAppStore((s) => s.setAuth);
  const setOrganization = useAppStore((s) => s.setOrganization);
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signupSchema) });
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
          hint="Use at least 12 characters with uppercase, lowercase, a number, and a symbol."
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
  );
}

export function ForgotPasswordPage({ reset = false }) {
  const [sent, setSent] = useState(false);
  const [params] = useSearchParams();
  const token = params.get("token");
  const [formError, setFormError] = useState("");
  if (!reset)
    return (
      <AuthCard
        title="Password recovery unavailable"
        subtitle="WorkFlow does not send password recovery emails. If you can sign in, update your password under Settings > Security. Otherwise, contact system support."
      >
        <Link className="back-link" to="/login">
          <ArrowLeft size={15} />
          Back to sign in
        </Link>
      </AuthCard>
    );
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
                "Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.",
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
          <input name="password" className="input" type="password" required />
        </Field>
        <Field label="Confirm password">
          <input name="confirm" className="input" type="password" required />
        </Field>
        {formError && <p className="form-error">{formError}</p>}
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
