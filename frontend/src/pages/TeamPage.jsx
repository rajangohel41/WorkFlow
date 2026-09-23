import { Plus, Search, Trash2 } from "lucide-react"
import { useState } from "react"
import { useAppStore } from "../store/useAppStore.js"
import { useMembers, useWorkflowMutations } from "../hooks/useWorkflowQueries.js"
import {
  Avatar,
  Badge,
  Button,
  IconButton,
  PageHeader,
} from "../components/ui/index.jsx"

export default function TeamPage() {
  const setCreateModal = useAppStore((state) => state.setCreateModal)
  const { data: membersData, isLoading } = useMembers()
  const { updateMember, removeMember } = useWorkflowMutations()

  const members = membersData?.members || []

  const [query, setQuery] = useState("")
  const [role, setRole] = useState("All")
  const [status, setStatus] = useState("All")

  const filtered = members
    .filter((person) =>
      `${person.name} ${person.email}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .filter((person) => role === "All" || person.role === role)
    .filter((person) => status === "All" || person.status === status)

  const onlineCount = members.filter((person) => person.status === "Online").length

  return (
    <div className="page">
      <PageHeader
        title="Team"
        subtitle="Manage workspace members and permissions."
        actions={
          <Button icon={Plus} onClick={() => setCreateModal("invite")}>
            Invite member
          </Button>
        }
      />
      <div className="team-summary">
        <div>
          <span className="team-stack">
            {members.slice(0, 4).map((person) => (
              <Avatar person={person} size="sm" key={person.id || person.email} />
            ))}
          </span>
          <span>
            <strong>{members.length} workspace members</strong>
            <small>{onlineCount || members.length} active now</small>
          </span>
        </div>
        <Badge tone="success">
          {onlineCount || members.length} online now
        </Badge>
      </div>
      <div className="toolbar">
        <label className="search-input">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email..."
          />
        </label>
        <select
          className="toolbar-select"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          aria-label="Role filter"
        >
          <option>All</option>
          <option>Owner</option>
          <option>Admin</option>
          <option>Manager</option>
          <option>Member</option>
          <option>Viewer</option>
        </select>
        <select
          className="toolbar-select"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Status filter"
        >
          <option>All</option>
          <option>Online</option>
          <option>Away</option>
          <option>Offline</option>
          <option>Pending</option>
        </select>
      </div>
      <div className="table-card team-table">
        {isLoading ? (
          <p className="loading-state">Loading team members...</p>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No members found</h3>
            <p>Invite teammates to collaborate in this workspace.</p>
            <Button icon={Plus} onClick={() => setCreateModal("invite")}>
              Invite member
            </Button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Projects</th>
                <th>Status</th>
                <th>Last active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((person) => (
                <tr key={person.id || person.email}>
                  <td>
                    <div className="member-cell">
                      <Avatar person={person} />
                      <span>
                        <strong>{person.name}</strong>
                        <small>{person.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <select
                      className="role-button"
                      value={person.role || "Member"}
                      onChange={(event) =>
                        updateMember.mutate({
                          userId: person.id,
                          payload: { role: event.target.value },
                        })
                      }
                      disabled={person.role === "Owner"}
                    >
                      <option>Owner</option>
                      <option>Admin</option>
                      <option>Manager</option>
                      <option>Member</option>
                      <option>Viewer</option>
                    </select>
                  </td>
                  <td>{person.projects || 0} projects</td>
                  <td>
                    <span className="role-button">
                      {person.status || "Active"}
                    </span>
                  </td>
                  <td>{person.last || "Recently"}</td>
                  <td>
                    {person.role !== "Owner" && (
                      <IconButton
                        label={`Remove ${person.name}`}
                        onClick={() =>
                          window.confirm(`Remove ${person.name} from the workspace?`) &&
                          removeMember.mutate(person.id)
                        }
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
