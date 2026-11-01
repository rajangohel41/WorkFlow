import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Workflow,
  ArrowRight,
  CheckCircle2,
  Shield,
  Zap,
  Layers,
  Kanban,
  Calendar,
  BarChart3,
  Users,
  Check,
  Sparkles,
  Lock,
  Clock,
  Play,
  ChevronRight,
  Code2,
  FolderGit2,
  CheckSquare,
  ShieldCheck,
  TrendingUp,
  Cpu,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore.js";

export default function LandingPage() {
  const user = useAppStore((state) => state.user);
  const [activeTab, setActiveTab] = useState("kanban");

  return (
    <div className="landing-container">
      {/* Navigation Header */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand">
            <span>
              <Workflow size={22} />
            </span>
            <strong>WorkFlow</strong>
          </Link>

          <nav className="landing-links" aria-label="Main Navigation">
            <a href="#features">Features</a>
            <a href="#solutions">Solutions</a>
            <a href="#security">Security</a>
            <Link to="/demo" className="demo-link-highlight">
              <Sparkles size={14} /> Try Live Demo
            </Link>
          </nav>

          <div className="landing-auth-actions">
            {user ? (
              <Link to="/dashboard" className="btn btn-primary">
                Go to Dashboard <ArrowRight size={15} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="landing-link-login">
                  Sign In
                </Link>
                <Link to="/demo" className="btn btn-secondary">
                  <Play size={13} /> Live Demo
                </Link>
                <Link to="/signup" className="btn btn-primary">
                  Get Started <ArrowRight size={14} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-badge">
          <Sparkles size={14} />
          <span>Enterprise Project & Team Management SaaS</span>
        </div>

        <h1 className="landing-hero-title">
          Plan better. Build faster. <br />
          <span className="gradient-text">Work together seamlessly.</span>
        </h1>

        <p className="landing-hero-subtitle">
          WorkFlow brings multi-tenant project planning, interactive Kanban boards,
          sprint velocity analytics, and real-time Socket.IO collaboration into one
          lightning-fast workspace.
        </p>

        <div className="landing-hero-ctas">
          <Link to="/demo" className="btn btn-primary btn-hero-primary">
            <Play size={16} /> Try Live Demo
            <span className="cta-badge">No Login Required</span>
          </Link>
          <Link to="/signup" className="btn btn-secondary btn-hero-secondary">
            Get Started Free <ArrowRight size={16} />
          </Link>
        </div>

        {/* Feature Highlights Pills */}
        <div className="hero-features-strip">
          <span>
            <CheckCircle2 size={15} color="#10B981" /> Strict Multi-Tenant Isolation
          </span>
          <span>
            <CheckCircle2 size={15} color="#10B981" /> Real-Time WebSocket Sync
          </span>
          <span>
            <CheckCircle2 size={15} color="#10B981" /> Argon2 Security Hardening
          </span>
          <span>
            <CheckCircle2 size={15} color="#10B981" /> Assignee-Only RBAC Controls
          </span>
        </div>

        {/* Interactive Hero Showcase Preview */}
        <div className="landing-hero-showcase">
          <div className="showcase-frame">
            <div className="showcase-frame-header">
              <div className="showcase-frame-dots">
                <span />
                <span />
                <span />
              </div>
              <div className="showcase-address-bar">
                <Lock size={12} /> workflow.app/dashboard
              </div>
              <div className="showcase-user-pill">
                <span className="user-dot" />
                <span>Madhav Patel (Online)</span>
              </div>
            </div>

            <div className="showcase-content-grid">
              {/* Preview KPI row */}
              <div className="preview-kpi-row">
                <div className="preview-kpi-card">
                  <span className="preview-kpi-label">Active Projects</span>
                  <strong>12</strong>
                  <small className="positive">+18% this month</small>
                </div>
                <div className="preview-kpi-card">
                  <span className="preview-kpi-label">Tasks Completed</span>
                  <strong>148</strong>
                  <small className="positive">94.2% sprint velocity</small>
                </div>
                <div className="preview-kpi-card">
                  <span className="preview-kpi-label">Cycle Time</span>
                  <strong>2.1d</strong>
                  <small className="positive">-15% turnaround</small>
                </div>
                <div className="preview-kpi-card">
                  <span className="preview-kpi-label">Team Members</span>
                  <strong>32</strong>
                  <small>Across 4 squads</small>
                </div>
              </div>

              {/* Preview Board Lanes */}
              <div className="preview-board-row">
                <div className="preview-board-col">
                  <div className="preview-col-title">
                    <span>Backlog</span>
                    <span className="count">4</span>
                  </div>
                  <div className="preview-task-card">
                    <span className="task-tag neutral">SEC-104</span>
                    <h5>Zero-trust network policy review</h5>
                    <div className="task-meta">
                      <span className="priority">Medium</span>
                      <span className="avatar-chip">RJ</span>
                    </div>
                  </div>
                </div>

                <div className="preview-board-col">
                  <div className="preview-col-title">
                    <span>To Do</span>
                    <span className="count">6</span>
                  </div>
                  <div className="preview-task-card">
                    <span className="task-tag info">MOB-201</span>
                    <h5>Implement biometric authentication</h5>
                    <div className="task-meta">
                      <span className="priority high">High</span>
                      <span className="avatar-chip blue">MP</span>
                    </div>
                  </div>
                </div>

                <div className="preview-board-col">
                  <div className="preview-col-title">
                    <span>In Progress</span>
                    <span className="count">3</span>
                  </div>
                  <div className="preview-task-card active">
                    <span className="task-tag purple">API-302</span>
                    <h5>Socket.IO multi-tenant rooms</h5>
                    <div className="task-meta">
                      <span className="priority urgent">Urgent</span>
                      <span className="avatar-chip purple">SK</span>
                    </div>
                  </div>
                </div>

                <div className="preview-board-col">
                  <div className="preview-col-title">
                    <span>Done</span>
                    <span className="count">18</span>
                  </div>
                  <div className="preview-task-card done">
                    <span className="task-tag success">FE-108</span>
                    <h5>Interactive Gantt timeline markers</h5>
                    <div className="task-meta">
                      <span className="priority done">Completed</span>
                      <span className="avatar-chip green">NV</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Core Features Showcase */}
      <section id="features" className="landing-section">
        <div className="landing-section-header">
          <span className="section-eyebrow">COMPREHENSIVE SAAS PLATFORM</span>
          <h2>Engineered for Teams That Demand Excellence</h2>
          <p>
            Explore modular toolsets designed for enterprise scalability, intuitive
            collaboration, and developer-grade productivity.
          </p>
        </div>

        {/* Feature Tab Selectors */}
        <div className="feature-nav-tabs">
          <button
            type="button"
            className={`feature-nav-btn ${activeTab === "kanban" ? "active" : ""}`}
            onClick={() => setActiveTab("kanban")}
          >
            <Kanban size={17} /> Kanban Boards
          </button>
          <button
            type="button"
            className={`feature-nav-btn ${activeTab === "projects" ? "active" : ""}`}
            onClick={() => setActiveTab("projects")}
          >
            <FolderGit2 size={17} /> Project Management
          </button>
          <button
            type="button"
            className={`feature-nav-btn ${activeTab === "tasks" ? "active" : ""}`}
            onClick={() => setActiveTab("tasks")}
          >
            <CheckSquare size={17} /> Task Management
          </button>
          <button
            type="button"
            className={`feature-nav-btn ${activeTab === "team" ? "active" : ""}`}
            onClick={() => setActiveTab("team")}
          >
            <Users size={17} /> Team Collaboration
          </button>
          <button
            type="button"
            className={`feature-nav-btn ${activeTab === "calendar" ? "active" : ""}`}
            onClick={() => setActiveTab("calendar")}
          >
            <Calendar size={17} /> Calendar & Scheduling
          </button>
          <button
            type="button"
            className={`feature-nav-btn ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => setActiveTab("analytics")}
          >
            <BarChart3 size={17} /> Analytics & Productivity
          </button>
        </div>

        {/* Active Feature Showcase Box */}
        <div className="feature-display-card">
          {activeTab === "kanban" && (
            <div className="feature-grid-content">
              <div className="feature-copy">
                <span className="feature-pill">Visual Delivery</span>
                <h3>Fluid Kanban Boards with Live Collaboration</h3>
                <p>
                  Visualize workflows across customizable status columns. Track tasks from
                  Backlog through Done with instantaneous WebSocket state synchronization,
                  assignee avatar presence, and strict access controls.
                </p>
                <ul className="feature-checklist">
                  <li>
                    <Check size={16} /> Drag & drop ergonomic column transitions
                  </li>
                  <li>
                    <Check size={16} /> Assignee-only status change RBAC protection
                  </li>
                  <li>
                    <Check size={16} /> Granular priority tagging (Urgent, High, Medium, Low)
                  </li>
                  <li>
                    <Check size={16} /> Instant filter by keyword, assignee, or priority
                  </li>
                </ul>
                <div className="feature-cta-row">
                  <Link to="/demo" className="btn btn-primary">
                    Try Live Kanban Demo <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
              <div className="feature-graphic kanban-graphic">
                <div className="graphic-card">
                  <div className="graphic-col">
                    <strong>In Progress</strong>
                    <div className="mock-task">
                      <div className="mock-header">
                        <span className="badge badge-purple">In Progress</span>
                        <span className="badge badge-error">Urgent</span>
                      </div>
                      <h5>Redis Sentinel failover clustering</h5>
                      <div className="mock-sub">
                        <span>Checklist: 4/5</span>
                        <span className="mock-avatar">MP</span>
                      </div>
                    </div>
                  </div>
                  <div className="graphic-col">
                    <strong>In Review</strong>
                    <div className="mock-task">
                      <div className="mock-header">
                        <span className="badge badge-warning">In Review</span>
                        <span className="badge badge-info">Medium</span>
                      </div>
                      <h5>Argon2 multi-device token invalidation</h5>
                      <div className="mock-sub">
                        <span>Checklist: 3/3</span>
                        <span className="mock-avatar">SK</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "projects" && (
            <div className="feature-grid-content">
              <div className="feature-copy">
                <span className="feature-pill">Portfolio Oversight</span>
                <h3>Multi-Tenant Project Architecture</h3>
                <p>
                  Organize team initiatives across strictly isolated workspaces. Track
                  delivery progress, milestones, team member assignments, and timeline
                  deadlines without cross-tenant data leakage.
                </p>
                <ul className="feature-checklist">
                  <li>
                    <Check size={16} /> Workspace scoping enforced at MongoDB database level
                  </li>
                  <li>
                    <Check size={16} /> Milestone tracking with visual percentage indicators
                  </li>
                  <li>
                    <Check size={16} /> Dedicated project views: Board, List, Files, and Activity
                  </li>
                  <li>
                    <Check size={16} /> Instant member invitation and role assignments
                  </li>
                </ul>
                <div className="feature-cta-row">
                  <Link to="/demo" className="btn btn-primary">
                    Explore Projects in Demo <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
              <div className="feature-graphic project-graphic">
                <div className="graphic-card">
                  <div className="mock-project-box">
                    <div className="mock-proj-top">
                      <span className="mock-icon">CNM</span>
                      <span className="badge badge-success">Active</span>
                    </div>
                    <h4>Cloud Native Migration</h4>
                    <p>Kubernetes multi-cluster deployment and autoscaling</p>
                    <div className="mock-progress-wrap">
                      <div className="mock-bar" style={{ width: "84%" }} />
                    </div>
                    <div className="mock-proj-foot">
                      <span>84% Complete</span>
                      <span>28 Tasks</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "tasks" && (
            <div className="feature-grid-content">
              <div className="feature-copy">
                <span className="feature-pill">Granular Control</span>
                <h3>Deep Task Management & Checklists</h3>
                <p>
                  Every deliverable comes equipped with interactive checklist items,
                  threaded activity comments, authenticated file attachments, and
                  detailed version-controlled audit trails.
                </p>
                <ul className="feature-checklist">
                  <li>
                    <Check size={16} /> Subtask checklists with realtime completion sync
                  </li>
                  <li>
                    <Check size={16} /> Threaded comments with timestamps and authors
                  </li>
                  <li>
                    <Check size={16} /> Authenticated, authorized file attachments
                  </li>
                  <li>
                    <Check size={16} /> Optimistic UI updates with rollback on network failure
                  </li>
                </ul>
                <div className="feature-cta-row">
                  <Link to="/signup" className="btn btn-primary">
                    Start Managing Tasks <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
              <div className="feature-graphic task-graphic">
                <div className="graphic-card">
                  <div className="mock-task-drawer">
                    <span className="badge badge-info">WF-104</span>
                    <h4>Scale Socket.IO rooms to 10k concurrent clients</h4>
                    <div className="mock-checklist-group">
                      <div className="mock-check-item checked">
                        <span>✓</span> Redis adapter cluster verified
                      </div>
                      <div className="mock-check-item checked">
                        <span>✓</span> Room eviction on member departure
                      </div>
                      <div className="mock-check-item">
                        <span className="box" /> Benchmark latency under stress
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "team" && (
            <div className="feature-grid-content">
              <div className="feature-copy">
                <span className="feature-pill">Enterprise RBAC</span>
                <h3>Seamless Team Collaboration</h3>
                <p>
                  Empower engineering and product teams with role-based permissions
                  (Owner, Admin, Manager, Member, Viewer). Manage active sessions,
                  collaborative notifications, and member directories with zero friction.
                </p>
                <ul className="feature-checklist">
                  <li>
                    <Check size={16} /> Multi-device session revocation via token versions
                  </li>
                  <li>
                    <Check size={16} /> Real-time in-app notification center
                  </li>
                  <li>
                    <Check size={16} /> Granular member role assignments and invitations
                  </li>
                  <li>
                    <Check size={16} /> Member workload balancing and capacity views
                  </li>
                </ul>
                <div className="feature-cta-row">
                  <Link to="/demo" className="btn btn-primary">
                    View Team Directory Demo <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
              <div className="feature-graphic team-graphic">
                <div className="graphic-card">
                  <div className="mock-member-row">
                    <span className="avatar-chip blue">MP</span>
                    <div>
                      <strong>Madhav Patel</strong>
                      <small>Product Lead • Owner</small>
                    </div>
                    <span className="badge badge-purple">Owner</span>
                  </div>
                  <div className="mock-member-row">
                    <span className="avatar-chip green">RJ</span>
                    <div>
                      <strong>Riya Joshi</strong>
                      <small>Staff Engineer • Admin</small>
                    </div>
                    <span className="badge badge-info">Admin</span>
                  </div>
                  <div className="mock-member-row">
                    <span className="avatar-chip purple">SK</span>
                    <div>
                      <strong>Sahil Kalani</strong>
                      <small>Senior Backend Dev • Member</small>
                    </div>
                    <span className="badge badge-success">Member</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "calendar" && (
            <div className="feature-grid-content">
              <div className="feature-copy">
                <span className="feature-pill">Visual Timelines</span>
                <h3>Calendar & Milestone Scheduling</h3>
                <p>
                  Coordinate sprint deadlines with intuitive calendar views. Identify
                  bottlenecks, link dependent deliverables, and ensure your engineering
                  schedule stays on track with clear due dates.
                </p>
                <ul className="feature-checklist">
                  <li>
                    <Check size={16} /> Interactive month and agenda calendar views
                  </li>
                  <li>
                    <Check size={16} /> Task due date synchronization and reminders
                  </li>
                  <li>
                    <Check size={16} /> Visual Gantt markers for sprint initiatives
                  </li>
                  <li>
                    <Check size={16} /> Quick rescheduling with intuitive click interactions
                  </li>
                </ul>
                <div className="feature-cta-row">
                  <Link to="/signup" className="btn btn-primary">
                    Schedule with WorkFlow <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
              <div className="feature-graphic calendar-graphic">
                <div className="graphic-card">
                  <div className="mock-calendar-view">
                    <div className="mock-cal-header">
                      <strong>November 2026</strong>
                      <span className="badge badge-neutral">Sprint 24</span>
                    </div>
                    <div className="mock-cal-days">
                      <div className="cal-cell"><span>10</span><small className="pill blue">SOC2 Review</small></div>
                      <div className="cal-cell active"><span>11</span><small className="pill purple">API Deploy</small></div>
                      <div className="cal-cell"><span>12</span><small className="pill green">Migration</small></div>
                      <div className="cal-cell"><span>13</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="feature-grid-content">
              <div className="feature-copy">
                <span className="feature-pill">Data-Driven Velocity</span>
                <h3>Analytics & Team Productivity</h3>
                <p>
                  Eliminate guesswork with real-time productivity dashboards. Monitor
                  completion ratios, workload distribution across team members, and
                  sprint cycle velocity with actionable metrics.
                </p>
                <ul className="feature-checklist">
                  <li>
                    <Check size={16} /> Weekly task completion velocity charts
                  </li>
                  <li>
                    <Check size={16} /> Member workload capacity distribution
                  </li>
                  <li>
                    <Check size={16} /> Sprint burndown tracking and turnaround telemetry
                  </li>
                  <li>
                    <Check size={16} /> Clean visual KPIs with trend direction indicators
                  </li>
                </ul>
                <div className="feature-cta-row">
                  <Link to="/demo" className="btn btn-primary">
                    Inspect Live Analytics <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
              <div className="feature-graphic analytics-graphic">
                <div className="graphic-card">
                  <div className="mock-chart-box">
                    <div className="mock-chart-header">
                      <strong>Sprint Velocity</strong>
                      <span className="badge badge-success">+24.8%</span>
                    </div>
                    <div className="mock-chart-bars">
                      <div className="bar-col"><div className="bar" style={{ height: "45%" }} /><span>Mon</span></div>
                      <div className="bar-col"><div className="bar" style={{ height: "65%" }} /><span>Tue</span></div>
                      <div className="bar-col"><div className="bar" style={{ height: "80%" }} /><span>Wed</span></div>
                      <div className="bar-col"><div className="bar active" style={{ height: "95%" }} /><span>Thu</span></div>
                      <div className="bar-col"><div className="bar" style={{ height: "70%" }} /><span>Fri</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Security & Reliability Section */}
      <section id="security" className="landing-section security-section">
        <div className="landing-section-header">
          <span className="section-eyebrow">ENTERPRISE SECURITY</span>
          <h2>Built With Modern Security Standards</h2>
          <p>
            WorkFlow is designed from the ground up to protect organization data,
            enforce strict tenant isolation, and ensure high-availability operations.
          </p>
        </div>

        <div className="security-cards-grid">
          <div className="security-card">
            <span className="sec-icon"><ShieldCheck size={24} /></span>
            <h4>Tenant Isolation</h4>
            <p>
              Every database query and WebSocket event is scoped by organization ID.
              Cross-tenant access attempts are strictly rejected at the middleware layer.
            </p>
          </div>

          <div className="security-card">
            <span className="sec-icon"><Lock size={24} /></span>
            <h4>Argon2 Password Hashing</h4>
            <p>
              Industry-standard Argon2 password hashing with minimum 8-character
              complexity requirements and cryptographic session token invalidation.
            </p>
          </div>

          <div className="security-card">
            <span className="sec-icon"><Zap size={24} /></span>
            <h4>Real-Time Socket Security</h4>
            <p>
              Socket.IO connections authenticate with JWT cookies, joining dynamic rooms
              strictly bounded by active organization memberships.
            </p>
          </div>

          <div className="security-card">
            <span className="sec-icon"><Cpu size={24} /></span>
            <h4>Optimistic Rollback</h4>
            <p>
              High-responsiveness UI state mutations reconcile immediately with authoritative
              server responses, rolling back on version conflicts or permission denials.
            </p>
          </div>
        </div>
      </section>

      {/* Solutions / Ready to Start Banner */}
      <section id="solutions" className="landing-cta-banner">
        <div className="cta-banner-content">
          <h2>Ready to transform the way your team builds?</h2>
          <p>
            Jump into our interactive live demo with sample enterprise data, or create
            your organization workspace in under 60 seconds.
          </p>
          <div className="cta-banner-buttons">
            <Link to="/demo" className="btn btn-secondary btn-lg">
              <Play size={16} /> Open Public Demo
            </Link>
            <Link to="/signup" className="btn btn-primary btn-lg">
              Create Your Account <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-brand-col">
            <div className="landing-brand">
              <span>
                <Workflow size={20} />
              </span>
              <strong>WorkFlow</strong>
            </div>
            <p>
              Enterprise-grade project and team management SaaS platform built with
              React 19, Vite, Express, MongoDB, Socket.IO, and Tailwind CSS.
            </p>
            <small>© {new Date().getFullYear()} WorkFlow. All rights reserved.</small>
          </div>

          <div className="footer-links-col">
            <strong>Product</strong>
            <Link to="/demo">Live Demo</Link>
            <Link to="/login">Sign In</Link>
            <Link to="/signup">Register</Link>
            <Link to="/dashboard">Dashboard</Link>
          </div>

          <div className="footer-links-col">
            <strong>Features</strong>
            <a href="#features">Project Management</a>
            <a href="#features">Task Management</a>
            <a href="#features">Kanban Boards</a>
            <a href="#features">Calendar & Scheduling</a>
            <a href="#features">Productivity Analytics</a>
          </div>

          <div className="footer-links-col">
            <strong>Security & Stack</strong>
            <span>Multi-Tenant Architecture</span>
            <span>Argon2 Password Hashing</span>
            <span>WebSocket Live Rooms</span>
            <span>Role-Based Permissions</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
