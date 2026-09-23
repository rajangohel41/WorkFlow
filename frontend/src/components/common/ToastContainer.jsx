import { AlertCircle, CheckCircle2, Info, X } from "lucide-react"
import { useAppStore } from "../../store/useAppStore.js"
import { IconButton } from "../ui/index.jsx"

export default function ToastContainer() {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon =
          toast.tone === "error"
            ? AlertCircle
            : toast.tone === "info"
              ? Info
              : CheckCircle2
        return (
          <div className={`toast toast-${toast.tone}`} key={toast.id}>
            <Icon size={17} />
            <strong>{toast.message}</strong>
            <IconButton
              label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
            >
              <X size={15} />
            </IconButton>
          </div>
        )
      })}
    </div>
  )
}
