import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { useAppStore } from "../store/useAppStore.js"
import {
  useCalendarEvents,
  useWorkflowMutations,
  useTasks,
} from "../hooks/useWorkflowQueries.js"
import { Button, PageHeader } from "../components/ui/index.jsx"

export default function CalendarPage() {
  const setCreateModal = useAppStore((state) => state.setCreateModal)
  const setTask = useAppStore((state) => state.setTask)
  const workspaceName = useAppStore((state) => state.workspace) || "WorkFlow"

  const { data: calendarData } = useCalendarEvents()
  const { data: tasksData } = useTasks()
  const { removeCalendarEvent } = useWorkflowMutations()

  const events = calendarData?.events || []
  const tasks = tasksData?.tasks || []

  const [view, setView] = useState("Month")
  const [date, setDate] = useState(new Date())

  const month = date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const daysInMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate()
  const firstDayIndex = new Date(
    date.getFullYear(),
    date.getMonth(),
    1,
  ).getDay()
  const today = new Date()

  const days = useMemo(() => {
    const list = []
    const prevMonthDays = new Date(
      date.getFullYear(),
      date.getMonth(),
      0,
    ).getDate()

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      list.push({
        date: prevMonthDays - i,
        muted: true,
        today: false,
      })
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const isToday =
        today.getDate() === i &&
        today.getMonth() === date.getMonth() &&
        today.getFullYear() === date.getFullYear()
      list.push({
        date: i,
        muted: false,
        today: isToday,
      })
    }

    const remaining = 35 - list.length
    for (let i = 1; i <= Math.max(0, remaining); i++) {
      list.push({
        date: i,
        muted: true,
        today: false,
      })
    }

    return list
  }, [date, daysInMonth, firstDayIndex])

  const move = (amount) =>
    setDate(new Date(date.getFullYear(), date.getMonth() + amount, 1))

  const handleEventClick = (event) => {
    if (event.taskId) {
      const foundTask = tasks.find(
        (t) => t.id === event.taskId || t._id === event.taskId,
      )
      if (foundTask) {
        setTask(foundTask)
        return
      }
    }
    if (
      window.confirm(`Remove "${event.title}" from the calendar?`)
    ) {
      removeCalendarEvent.mutate(event.id)
    }
  }

  const eventButton = (event) => (
    <button
      className={`event ${event.color || "indigo"}`}
      key={event.id}
      onClick={() => handleEventClick(event)}
      title={event.taskId ? "Click to view task" : "Click to remove event"}
    >
      <i /> <b>{event.time || ""}</b> {event.title}
    </button>
  )

  return (
    <div className="page calendar-page">
      <PageHeader
        title="Calendar"
        subtitle="Plan and coordinate your team's work."
        actions={
          <Button icon={Plus} onClick={() => setCreateModal("event")}>
            Create event
          </Button>
        }
      />
      <div className="calendar-controls">
        <div>
          <Button variant="secondary" onClick={() => setDate(new Date())}>
            Today
          </Button>
          <span className="control-group">
            <button onClick={() => move(-1)} aria-label="Previous month">
              <ChevronLeft size={17} />
            </button>
            <button onClick={() => move(1)} aria-label="Next month">
              <ChevronRight size={17} />
            </button>
          </span>
          <h2>{month}</h2>
        </div>
        <div className="segmented">
          {["Month", "Week", "Day"].map((name) => (
            <button
              className={view === name ? "active" : ""}
              onClick={() => setView(name)}
              key={name}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      {view === "Month" ? (
        <div className="calendar">
          <div className="weekdays">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="month-grid">
            {days.map((day, index) => (
              <div
                className={`calendar-cell ${day.muted ? "muted" : ""}`}
                key={index}
              >
                <span className={day.today ? "today" : ""}>{day.date}</span>
                {events
                  .filter((event) => event.day === day.date && !day.muted)
                  .map(eventButton)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={`calendar-agenda ${view.toLowerCase()}`}>
          <header>
            <strong>
              {view === "Week"
                ? "This week's schedule"
                : `${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`}
            </strong>
            <span>{events.length} events</span>
          </header>
          {events.length === 0 ? (
            <p className="empty-hint">No scheduled events or task deadlines.</p>
          ) : (
            events.slice(0, view === "Day" ? 3 : 7).map((event) => (
              <div key={event.id}>
                <time>{event.time || "All day"}</time>
                <span className={`agenda-dot ${event.color || "indigo"}`} />
                <button onClick={() => handleEventClick(event)}>
                  <strong>{event.title}</strong>
                  <small>{workspaceName}</small>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
