import {
  ArrowLeft,
  Home,
  LockKeyhole,
  ServerCrash,
  WifiOff,
} from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "../components/ui/index.jsx"

export default function ErrorPage({ type = "404" }) {
  const data = {
    404: {
      icon: "404",
      title: "Page not found",
      text: "The page you're looking for doesn't exist or may have been moved.",
    },
    500: {
      icon: <ServerCrash size={32} />,
      title: "Something went wrong",
      text: "An unexpected error occurred. Our team has been notified.",
    },
    network: {
      icon: <WifiOff size={32} />,
      title: "You're offline",
      text: "Check your internet connection and try again.",
    },
    permission: {
      icon: <LockKeyhole size={32} />,
      title: "Permission denied",
      text: "You don't have access to view this page. Contact your workspace admin.",
    },
  }[type]
  return (
    <div className="error-page">
      <div className="error-icon">{data.icon}</div>
      <h1>{data.title}</h1>
      <p>{data.text}</p>
      <div>
        <Link to="/dashboard">
          <Button icon={Home}>Back to dashboard</Button>
        </Link>
        <Button
          variant="secondary"
          icon={ArrowLeft}
          onClick={() => history.back()}
        >
          Go back
        </Button>
      </div>
    </div>
  )
}
