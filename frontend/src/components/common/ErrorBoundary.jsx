import { Component } from "react";
import { Link } from "react-router-dom";
import { Button } from "../ui/index.jsx";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("WorkFlow route error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page empty-state">
        <h1>Something went wrong</h1>
        <p>The page encountered an unexpected error.</p>
        <div className="page-actions">
          <Button
            variant="secondary"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </Button>
          <Link className="btn btn-primary" to="/dashboard">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }
}
