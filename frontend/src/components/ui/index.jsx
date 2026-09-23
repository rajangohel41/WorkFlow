import { LoaderCircle, X } from "lucide-react"

export function Button({
  children,
  variant = "primary",
  icon: Icon,
  loading,
  className = "",
  ...props
}) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {loading ? (
        <LoaderCircle className="animate-spin" size={16} />
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      {children}
    </button>
  )
}

export function IconButton({ label, children, className = "", ...props }) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} {...props}>
      {children}
    </button>
  )
}

export function Card({ children, className = "" }) {
  return <section className={`card ${className}`}>{children}</section>
}

export function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Avatar({ person, size = "md" }) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ background: person?.color || "#6366F1" }}
      title={person?.name}
    >
      {person?.initials || "AK"}
    </span>
  )
}

export function AvatarGroup({ people, max = 3 }) {
  return (
    <div className="avatar-group">
      {people.slice(0, max).map((person) => (
        <Avatar person={person} size="sm" key={person.name} />
      ))}
    </div>
  )
}

export function ProgressBar({ value, color = "#6366F1" }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value}>
      <span style={{ width: `${value}%`, background: color }} />
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Field({ label, error, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? (
        <small className="error">{error}</small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </label>
  )
}

export function Modal({ title, children, onClose, footer }) {
  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty-state">
      {Icon && (
        <span>
          <Icon size={24} />
        </span>
      )}
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

export function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}
