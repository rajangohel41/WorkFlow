import {
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Paperclip,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  useCurrentUser,
  useMembers,
  useProjects,
  useTask,
  useWorkflowMutations,
} from "../../hooks/useWorkflowQueries.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Avatar, Badge, Button, IconButton } from "../ui/index.jsx";
import { getTaskStatusPermission } from "../../utils/taskPermissions.js";

// Simple debounce hook — fires callback after `delay` ms of inactivity
function useDebounce(callback, delay) {
  const timerRef = useRef(null);
  return useCallback(
    (...args) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callback(...args), delay);
    },
    [callback, delay],
  );
}

export default function TaskDrawer() {
  const { task: selectedTask, setTask, addToast, user: storeUser } = useAppStore();

  const { data: fetchedTask } = useTask(selectedTask?.id);
  const task = fetchedTask || selectedTask;

  const { data: projectsData } = useProjects();
  const { data: membersData } = useMembers();
  const projects = projectsData?.projects || [];
  const members = membersData?.members || [];
  const { data: meData } = useCurrentUser();
  const currentUser = meData?.user;
  const user = currentUser || storeUser;
  const { canChange: canChangeStatus, reason: statusChangeReason } =
    getTaskStatusPermission(task, user);

  const {
    updateTask,
    deleteTask,
    duplicateTask,
    addComment,
    deleteComment,
    uploadAttachment,
    deleteAttachment,
  } = useWorkflowMutations();

  const [comment, setComment] = useState("");
  const [newItem, setNewItem] = useState("");
  const fileInputRef = useRef(null);

  const apply = (updates) => {
    if (!task) return;
    updateTask.mutate({
      id: task.id,
      payload: { ...updates, version: task.version },
    });
  };

  // Debounced apply for text inputs — prevents one API call per keystroke
  const applyDebounced = useDebounce(apply, 500);

  if (!task) return null;

  const checklist = task.checklist || [];

  const updateChecklist = (items) => {
    apply({ checklist: items });
  };

  const comments = task.commentsList || [];

  const sendComment = () => {
    if (!comment.trim()) return;
    addComment.mutate({ taskId: task.id, text: comment.trim() });
    setComment("");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    uploadAttachment.mutate({ taskId: task.id, formData, file });
    e.target.value = "";

  };

  const currentAssigneeValue = task.assignee?.email || "";
  const currentProjectValue =
    projects.find((project) => project._id === task.projectId)?.id ||
    task.projectId ||
    "";

  // task.dueDate is the raw ISO Date from the serializer; task.due is the formatted string
  const dueDateValue = task.dueDate
    ? new Date(task.dueDate).toISOString().slice(0, 10)
    : "";

  return (
    <div className="drawer-overlay" onMouseDown={() => setTask(null)}>
      <aside
        className="task-drawer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <Badge>{task.id}</Badge>
            <input
              className="drawer-title-input"
              defaultValue={task.title || ""}
              onChange={(event) =>
                applyDebounced({ title: event.target.value })
              }
              aria-label="Task title"
            />
          </div>
          <div className="drawer-header-actions">
            <IconButton
              label="Duplicate task"
              onClick={() => {
                duplicateTask.mutate(task.id);
                setTask(null);
              }}
            >
              <Copy size={18} />
            </IconButton>
            <IconButton
              label="Delete task"
              onClick={() => {
                if (window.confirm(`Delete ${task.title}?`)) {
                  deleteTask.mutate(task.id);
                  setTask(null);
                }
              }}
            >
              <Trash2 size={18} />
            </IconButton>
            <IconButton label="Close task" onClick={() => setTask(null)}>
              <X size={20} />
            </IconButton>
          </div>
        </header>
        <div className="drawer-scroll">
          <div className="task-properties">
            <span>Status</span>
            <div className="property-field-group">
              <select
                className="property-select"
                value={task.status || "Backlog"}
                disabled={!canChangeStatus}
                title={!canChangeStatus ? statusChangeReason : "Change status"}
                onChange={(event) => apply({ status: event.target.value })}
              >
                {["Backlog", "Todo", "In Progress", "In Review", "Done"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
              {!canChangeStatus && (
                <p
                  className="task-status-hint"
                  style={{
                    fontSize: "11px",
                    color: "var(--muted)",
                    marginTop: "4px",
                    lineHeight: "1.3",
                  }}
                >
                  {statusChangeReason}
                </p>
              )}
            </div>
            <span>Priority</span>
            <select
              className="property-select"
              value={task.priority || "Medium"}
              onChange={(event) => apply({ priority: event.target.value })}
            >
              {["Low", "Medium", "High", "Urgent"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <span>Assignee</span>
            <select
              className="property-select"
              value={currentAssigneeValue}
              onChange={(event) => {
                apply({ assigneeEmail: event.target.value });
              }}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.email} value={member.email}>
                  {member.name}
                </option>
              ))}
            </select>
            <span>Due date</span>
            <input
              className="property-select"
              type="date"
              value={dueDateValue}
              onChange={(event) =>
                apply({ dueDate: event.target.value || null })
              }
            />
            <span>Project</span>
            <select
              className="property-select"
              value={currentProjectValue}
              onChange={(event) => apply({ projectId: event.target.value })}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <span>Label</span>
            <input
              className="property-select"
              defaultValue={task.label || ""}
              onChange={(event) =>
                applyDebounced({ label: event.target.value })
              }
            />
          </div>
          <section className="drawer-section">
            <h3>Description</h3>
            <textarea
              className="drawer-description"
              defaultValue={task.description || ""}
              placeholder="Add some context..."
              onChange={(event) =>
                applyDebounced({ description: event.target.value })
              }
            />
          </section>
          <section className="drawer-section">
            <div className="section-heading">
              <h3>Checklist</h3>
              <small>
                {checklist.filter((item) => item.done).length} /{" "}
                {checklist.length} completed
              </small>
            </div>
            <div className="checklist">
              {checklist.map((item, index) => (
                <div className="checklist-row" key={item.id || index}>
                  <button
                    onClick={() =>
                      updateChecklist(
                        checklist.map((entry, idx) =>
                          (entry.id ? entry.id === item.id : idx === index)
                            ? { ...entry, done: !entry.done }
                            : entry,
                        ),
                      )
                    }
                  >
                    <span className={item.done ? "checked" : ""}>
                      {item.done && <Check size={13} />}
                    </span>
                    <i className={item.done ? "done" : ""}>{item.title}</i>
                  </button>
                  <IconButton
                    label={`Delete ${item.title}`}
                    onClick={() =>
                      updateChecklist(
                        checklist.filter((entry, idx) =>
                          entry.id ? entry.id !== item.id : idx !== index,
                        ),
                      )
                    }
                  >
                    <X size={14} />
                  </IconButton>
                </div>
              ))}
            </div>
            <form
              className="checklist-add"
              onSubmit={(event) => {
                event.preventDefault();
                if (newItem.trim()) {
                  updateChecklist([
                    ...checklist,
                    { id: `${Date.now()}`, title: newItem.trim(), done: false },
                  ]);
                  setNewItem("");
                }
              }}
            >
              <input
                value={newItem}
                onChange={(event) => setNewItem(event.target.value)}
                placeholder="Add checklist item..."
              />
              <Button type="submit" variant="ghost" icon={Plus}>
                Add
              </Button>
            </form>
          </section>
          {task.attachments && task.attachments.length > 0 && (
            <section className="drawer-section">
              <h3>Attachments ({task.attachments.length})</h3>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginTop: "0.5rem",
                }}
              >
                {task.attachments.map((att) => (
                  <div
                    key={att.id || att._id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.3rem 0.6rem",
                      borderRadius: "6px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid var(--border)",
                      fontSize: "0.82rem",
                    }}
                  >
                    <Paperclip size={13} />
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)" }}
                    >
                      {/* BUGFIX: serializer returns att.name, not att.filename */}
                      {att.name || att.filename || "Attachment"}
                    </a>
                    <button
                      type="button"
                      aria-label={`Remove ${att.name || att.filename || "attachment"}`}
                      onClick={() =>
                        deleteAttachment.mutate({
                          taskId: task.id,
                          attachmentId: att.id || att._id,
                        })
                      }
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--muted)",
                        padding: "2px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="drawer-section">
            <h3>Comments</h3>
            {comments.map((item) => (
              <div className="comment" key={item.id}>
                <Avatar
                  person={item.author || { name: "User", initials: "U" }}
                  size="sm"
                />
                <div>
                  <p>
                    <strong>{item.author?.name || "Member"}</strong> {item.text}
                  </p>
                  <small>{item.time}</small>
                  {/* Check by userId or name */}
                  {(item.author?.id === currentUser?.id ||
                    item.author?.name === currentUser?.name) && (
                    <button
                      className="delete-comment"
                      onClick={() =>
                        deleteComment.mutate({
                          taskId: task.id,
                          commentId: item.id,
                        })
                      }
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="comment-box">
              <Avatar
                person={
                  currentUser
                    ? {
                        name: currentUser.name,
                        initials:
                          currentUser.initials ||
                          currentUser.name.slice(0, 2).toUpperCase(),
                        color: currentUser.color,
                      }
                    : { name: "User", initials: "U", color: "#6366F1" }
                }
                size="sm"
              />
              <div>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  onKeyDown={(event) => {
                    // Ctrl+Enter / Cmd+Enter to send
                    if (
                      (event.ctrlKey || event.metaKey) &&
                      event.key === "Enter"
                    ) {
                      event.preventDefault();
                      sendComment();
                    }
                  }}
                  placeholder="Write a comment… (Ctrl+Enter to send)"
                />
                <div>
                  <span>
                    <button
                      type="button"
                      aria-label="Attach file"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip size={15} />
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: "none" }}
                      onChange={handleFileUpload}
                    />
                  </span>
                  <Button icon={Send} onClick={sendComment}>
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
        <footer>
          <Button variant="secondary" onClick={() => setTask(null)}>
            Close
          </Button>
          <Button
            icon={CheckCircle2}
            onClick={() => {
              addToast("Changes saved");
              setTask(null);
            }}
          >
            Done
          </Button>
        </footer>
      </aside>
    </div>
  );
}
