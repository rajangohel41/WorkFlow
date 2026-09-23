import {
  CalendarDays,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
} from "lucide-react"
import { useState } from "react"
import { useParams } from "react-router-dom"
import { useAppStore } from "../../store/useAppStore.js"
import {
  useProject,
  useTasks,
  useWorkflowMutations,
} from "../../hooks/useWorkflowQueries.js"
import { Avatar, Badge, Button } from "../../components/ui/index.jsx"

const definitions = [
  ["Backlog", "slate"],
  ["Todo", "blue"],
  ["In Progress", "indigo"],
  ["In Review", "amber"],
  ["Done", "green"],
]

function TaskCard({ task, onStatusChange }) {
  const setTask = useAppStore((state) => state.setTask)
  return (
    <article
      className="kanban-card"
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/task", task.id)}
      onClick={() => setTask(task)}
    >
      <div className="task-id">
        <span>{task.id}</span>
        <select
          aria-label={`Change status for ${task.title}`}
          value={task.status}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onStatusChange(task.id, event.target.value)}
        >
          {definitions.map(([name]) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>
      <strong>{task.title}</strong>
      <div className="task-tags">
        <Badge
          tone={
            task.priority === "High" || task.priority === "Urgent"
              ? "error"
              : task.priority === "Medium"
                ? "warning"
                : "neutral"
          }
        >
          {task.priority}
        </Badge>
        <Badge tone="purple">{task.label || "General"}</Badge>
      </div>
      <div className="task-footer">
        <Avatar person={task.assignee} size="xs" />
        <span>
          <CalendarDays size={13} />
          {task.due || "No date"}
        </span>
        <i>
          <MessageSquare size={13} />
          {task.comments || 0}
        </i>
        {(task.files > 0 || task.attachments?.length > 0) && (
          <i>
            <Paperclip size={13} />
            {task.attachments?.length || task.files}
          </i>
        )}
      </div>
    </article>
  )
}

export default function BoardPage() {
  const { projectId } = useParams()
  const setCreateModal = useAppStore((state) => state.setCreateModal)
  const [query, setQuery] = useState("")

  const { data: project } = useProject(projectId)
  const { data: tasksData } = useTasks({ projectId })
  const { updateTask } = useWorkflowMutations()

  const tasks = tasksData?.tasks || []

  const handleStatusChange = (taskId, status) => {
    updateTask.mutate({ id: taskId, payload: { status } })
  }

  const columns = definitions.map(([name, tone]) => ({
    name,
    tone,
    tasks: tasks.filter(
      (task) =>
        task.status === name &&
        (task.title.toLowerCase().includes(query.toLowerCase()) ||
          task.id.toLowerCase().includes(query.toLowerCase())),
    ),
  }))

  return (
    <div className="board">
      <div className="board-toolbar">
        <div className="board-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search board..."
          />
        </div>
        <span className="spacer" />
        <Button icon={Plus} onClick={() => setCreateModal("task")}>
          Add task
        </Button>
      </div>
      <div className="kanban">
        {columns.map((column) => (
          <section
            className="kanban-column"
            key={column.name}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const taskId = event.dataTransfer.getData("text/task")
              if (taskId) {
                handleStatusChange(taskId, column.name)
              }
            }}
          >
            <header>
              <div>
                <i className={column.tone} />
                <strong>{column.name}</strong>
                <span>{column.tasks.length}</span>
              </div>
              <button
                className="column-add"
                aria-label={`Add task to ${column.name}`}
                onClick={() => setCreateModal("task")}
              >
                <Plus size={16} />
              </button>
            </header>
            <div className="kanban-stack">
              {column.tasks.map((task) => (
                <TaskCard
                  task={task}
                  key={task.id}
                  onStatusChange={handleStatusChange}
                />
              ))}
              <button
                className="add-task"
                onClick={() => setCreateModal("task")}
              >
                <Plus size={15} /> Add task
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
