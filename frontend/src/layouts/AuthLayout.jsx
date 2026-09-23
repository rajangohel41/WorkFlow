import { Workflow } from "lucide-react"
import { Outlet } from "react-router-dom"

export default function AuthLayout() {
  return (
    <div className="auth-layout">
      <section className="auth-showcase">
        <div className="auth-brand">
          <span>
            <Workflow size={22} />
          </span>
          <strong>WorkFlow</strong>
        </div>
        <div className="showcase-content">
          <span className="eyebrow">BUILT FOR MOMENTUM</span>
          <h1>
            Plan better.
            <br />
            Build faster.
            <br />
            Work together.
          </h1>
          <p>
            One calm, focused workspace for your team to turn ambitious plans
            into meaningful progress.
          </p>
          <div className="testimonial">
            <p>
              “WorkFlow gave our team the clarity we were missing. Everyone
              knows what matters and what comes next.”
            </p>
            <div>
              <span>SP</span>
              <strong>
                Sarah Patel <small>Product Lead at Acme</small>
              </strong>
            </div>
          </div>
        </div>
        <div className="showcase-grid" />
      </section>
      <main className="auth-main">
        <Outlet />
      </main>
    </div>
  )
}
