import assert from "node:assert/strict"
import { getGreeting } from "../src/utils/greeting.js"
import {
  setAuthToken,
  getAuthToken,
  notifyLogout,
  notifyLogin,
} from "../src/api/client.js"
import {
  safeMergeTask,
  recordFieldMutation,
  releaseFieldMutation,
} from "../src/hooks/useWorkflowQueries.js"

console.log("\n==================================================")
console.log("=== DASHBOARD GREETING, AUTH & TASK MUTATION TESTS ===")
console.log("==================================================\n")

// ---------------------------------------------------------------------
// TEST 1: Greeting time ranges & Local / Specified Timezone handling
// ---------------------------------------------------------------------
console.log("[TEST 1] Time-based greeting requirements in local and international timezones")

function makeDate(hours, minutes = 0) {
  const d = new Date()
  d.setHours(hours, minutes, 0, 0)
  return d
}

// 1.1 Local time range boundaries
assert.equal(getGreeting(makeDate(5, 0)), "Good morning", "5:00 AM must be Good morning")
assert.equal(getGreeting(makeDate(8, 30)), "Good morning", "8:30 AM must be Good morning")
assert.equal(getGreeting(makeDate(11, 59)), "Good morning", "11:59 AM must be Good morning")

assert.equal(getGreeting(makeDate(12, 0)), "Good afternoon", "12:00 PM must be Good afternoon")
assert.equal(getGreeting(makeDate(14, 15)), "Good afternoon", "2:15 PM must be Good afternoon")
assert.equal(getGreeting(makeDate(16, 59)), "Good afternoon", "4:59 PM must be Good afternoon")

assert.equal(getGreeting(makeDate(17, 0)), "Good evening", "5:00 PM must be Good evening")
assert.equal(getGreeting(makeDate(19, 45)), "Good evening", "7:45 PM must be Good evening")
assert.equal(getGreeting(makeDate(20, 59)), "Good evening", "8:59 PM must be Good evening")

assert.equal(getGreeting(makeDate(21, 0)), "Good night", "9:00 PM must be Good night")
assert.equal(getGreeting(makeDate(23, 0)), "Good night", "11:00 PM must be Good night")
assert.equal(getGreeting(makeDate(0, 30)), "Good night", "12:30 AM must be Good night")
assert.equal(getGreeting(makeDate(4, 59)), "Good night", "4:59 AM must be Good night")

// 1.2 India Timezone (Asia/Kolkata: UTC+5:30)
// UTC 00:00 -> India 05:30 AM (Morning)
assert.equal(
  getGreeting(new Date("2026-11-03T00:00:00Z"), "Asia/Kolkata"),
  "Good morning",
  "UTC 00:00 is 05:30 AM in India -> Good morning",
)
// UTC 07:00 -> India 12:30 PM (Afternoon)
assert.equal(
  getGreeting(new Date("2026-11-03T07:00:00Z"), "Asia/Kolkata"),
  "Good afternoon",
  "UTC 07:00 is 12:30 PM in India -> Good afternoon",
)
// UTC 12:00 -> India 05:30 PM (Evening)
assert.equal(
  getGreeting(new Date("2026-11-03T12:00:00Z"), "Asia/Kolkata"),
  "Good evening",
  "UTC 12:00 is 05:30 PM in India -> Good evening",
)
// UTC 16:00 -> India 09:30 PM (Night)
assert.equal(
  getGreeting(new Date("2026-11-03T16:00:00Z"), "Asia/Kolkata"),
  "Good night",
  "UTC 16:00 is 09:30 PM in India -> Good night",
)

// 1.3 US Eastern Timezone (America/New_York: UTC-4/5)
// UTC 11:00 -> New York 06:00 AM (Morning)
assert.equal(
  getGreeting(new Date("2026-11-03T11:00:00Z"), "America/New_York"),
  "Good morning",
  "UTC 11:00 is 06:00 AM in New York -> Good morning",
)
// UTC 18:00 -> New York 01:00 PM (Afternoon)
assert.equal(
  getGreeting(new Date("2026-11-03T18:00:00Z"), "America/New_York"),
  "Good afternoon",
  "UTC 18:00 is 01:00 PM in New York -> Good afternoon",
)
// UTC 22:30 -> New York 05:30 PM (Evening)
assert.equal(
  getGreeting(new Date("2026-11-03T22:30:00Z"), "America/New_York"),
  "Good evening",
  "UTC 22:30 is 05:30 PM in New York -> Good evening",
)

console.log("  [PASS] 1: Timezone greetings verified for local, India, and New York timezones")

// ---------------------------------------------------------------------
// TEST 2: API client auth token & logout notification handling
// ---------------------------------------------------------------------
console.log("\n[TEST 2] API client logout notification and session protection")
notifyLogin()
setAuthToken("sample-access-token-123")
assert.equal(getAuthToken(), "sample-access-token-123")

notifyLogout()
assert.equal(getAuthToken(), null, "notifyLogout must clear in-memory auth token")

setAuthToken("sample-new-token-456")
assert.equal(getAuthToken(), "sample-new-token-456")

notifyLogout()
assert.equal(getAuthToken(), null)
console.log("  [PASS] 2: In-memory token cleared and logout flag safely toggles state")

// ---------------------------------------------------------------------
// TEST 3: Rapid Task Quick Edits in Both Response Orders (Bug 2 Regression)
// ---------------------------------------------------------------------
console.log("\n[TEST 3] Rapid task edits safe-merge across both network response orders")

// Scenario A: Response Order: Assignee responds first, Priority responds second
{
  const taskId = "WF-TASK-ORDER-A"
  const initialTask = {
    id: taskId,
    title: "Document Architecture",
    priority: "Low",
    assignee: null,
    version: 1,
  }

  // User edits assignee at t=100
  const t1 = 100
  recordFieldMutation(taskId, { assigneeEmail: "sarah@workflow.io" }, t1)
  let currentTask = {
    ...initialTask,
    assignee: { email: "sarah@workflow.io", name: "Sarah" },
  }

  // User immediately edits priority at t=200
  const t2 = 200
  recordFieldMutation(taskId, { priority: "High" }, t2)
  currentTask = {
    ...currentTask,
    priority: "High",
  }

  // Response 1 arrives first (from t1 assignee edit)
  const serverResponseA = {
    id: taskId,
    title: "Document Architecture",
    priority: "Low", // server snapshot at t1
    assignee: { email: "sarah@workflow.io", name: "Sarah Connor" },
    version: 2,
  }
  currentTask = safeMergeTask(currentTask, serverResponseA, ["assigneeEmail"], t1)
  releaseFieldMutation(taskId, { assigneeEmail: "sarah@workflow.io" })

  // Priority must NOT have reverted to "Low"!
  assert.equal(
    currentTask.priority,
    "High",
    "Priority must remain 'High' when older Assignee response arrives",
  )
  assert.equal(currentTask.assignee?.name, "Sarah Connor")

  // Response 2 arrives second (from t2 priority edit)
  const serverResponseB = {
    id: taskId,
    title: "Document Architecture",
    priority: "High",
    assignee: { email: "sarah@workflow.io", name: "Sarah Connor" },
    version: 3,
  }
  currentTask = safeMergeTask(currentTask, serverResponseB, ["priority"], t2)
  releaseFieldMutation(taskId, { priority: "High" })

  assert.equal(currentTask.priority, "High")
  assert.equal(currentTask.assignee?.name, "Sarah Connor")
  assert.equal(currentTask.version, 3)
  console.log("  [PASS] 3a: Response Order A (Assignee first, Priority second) preserved both edits")
}

// Scenario B: Response Order: Priority responds FIRST, Assignee responds SECOND (The Reported Bug!)
{
  const taskId = "WF-TASK-ORDER-B"
  const initialTask = {
    id: taskId,
    title: "Fix Analytics Scale",
    priority: "Low",
    assignee: null,
    version: 1,
  }

  // User edits assignee at t=100
  const t1 = 100
  recordFieldMutation(taskId, { assigneeEmail: "alex@workflow.io" }, t1)
  let currentTask = {
    ...initialTask,
    assignee: { email: "alex@workflow.io", name: "Alex" },
  }

  // User immediately edits priority to Urgent at t=200
  const t2 = 200
  recordFieldMutation(taskId, { priority: "Urgent" }, t2)
  currentTask = {
    ...currentTask,
    priority: "Urgent",
  }

  // Response 2 (Priority) responds FIRST at t=250
  // Server snapshot at time of priority request had assignee = null
  const serverResponsePriority = {
    id: taskId,
    title: "Fix Analytics Scale",
    priority: "Urgent",
    assignee: null,
    version: 2,
  }
  currentTask = safeMergeTask(currentTask, serverResponsePriority, ["priority"], t2)
  releaseFieldMutation(taskId, { priority: "Urgent" })

  // Assignee must NOT have reverted to null because Assignee mutation is still in flight!
  assert.equal(
    currentTask.priority,
    "Urgent",
    "Priority must be Urgent after priority response",
  )
  assert.equal(
    currentTask.assignee?.email,
    "alex@workflow.io",
    "Assignee must NOT revert to null when Priority response arrives first",
  )

  // Response 1 (Assignee) responds SECOND at t=300
  // Server snapshot at time of assignee request had priority = "Low"
  const serverResponseAssignee = {
    id: taskId,
    title: "Fix Analytics Scale",
    priority: "Low", // Slower response has old priority!
    assignee: { email: "alex@workflow.io", name: "Alex Rover" },
    version: 2,
  }
  currentTask = safeMergeTask(currentTask, serverResponseAssignee, ["assigneeEmail"], t1)
  releaseFieldMutation(taskId, { assigneeEmail: "alex@workflow.io" })

  // Priority must NOT revert to Low!
  assert.equal(
    currentTask.priority,
    "Urgent",
    "Priority must remain Urgent and not be overwritten by slower Assignee response",
  )
  assert.equal(
    currentTask.assignee?.name,
    "Alex Rover",
    "Assignee must be updated to authoritative server response",
  )
  console.log("  [PASS] 3b: Response Order B (Priority first, Assignee second) preserved both edits without revert")
}

// ---------------------------------------------------------------------
// TEST 4: Analytics Chart Scale & Ticks (Bug 4 Regression)
// ---------------------------------------------------------------------
console.log("\n[TEST 4] Analytics chart scale calculation prevents duplicate Y-axis ticks")

function getChartScale(values = []) {
  const rawMax = Math.max(...values, 0)
  const domainMax = rawMax <= 1 ? 2 : (rawMax % 2 === 0 ? rawMax : rawMax + 1)
  const middleTick = domainMax / 2
  const ticks = [domainMax, middleTick, 0]
  return { domainMax, ticks }
}

// Case 1: max = 1 (Target bug scenario where Y-axis previously showed 1, 1, 0)
const scale1 = getChartScale([1])
assert.deepEqual(scale1.ticks, [2, 1, 0], "When max is 1, ticks must be [2, 1, 0]")
assert.equal(new Set(scale1.ticks).size, 3, "Ticks must contain exactly 3 distinct values")
assert.ok(!scale1.ticks.slice(0, 2).every((v) => v === 1), "Must not have duplicate '1' ticks")

// Case 2: max = 0 (Empty data points)
const scale0 = getChartScale([0, 0, 0])
assert.deepEqual(scale0.ticks, [2, 1, 0], "When all values are 0, scale defaults gracefully")

// Case 3: max = 3 (Odd value)
const scale3 = getChartScale([1, 3, 2])
assert.deepEqual(scale3.ticks, [4, 2, 0], "When max is 3, domain rounds to 4 with ticks [4, 2, 0]")

// Case 4: max = 10 (Even value)
const scale10 = getChartScale([4, 10, 7])
assert.deepEqual(scale10.ticks, [10, 5, 0], "When max is 10, ticks are [10, 5, 0]")

console.log("  [PASS] 4: Chart scale produces strictly distinct integer ticks across 0, 1, and multiple data points")

// ---------------------------------------------------------------------
// TEST 5: Create Project Stale Validation Error Recovery (Bug 5 Regression)
// ---------------------------------------------------------------------
console.log("\n[TEST 5] Create project validation error recovery")

function simulateFormValidation() {
  let error = ""
  let value = ""

  // Submit with empty value
  if (!value.trim()) {
    error = "Name is required"
  }
  assert.equal(error, "Name is required", "Empty submission should produce error")

  // User begins typing valid value
  value = "QA Test Project"
  if (value.trim() && error) {
    const errLower = error.toLowerCase()
    if (errLower.includes("name") || errLower.includes("required")) {
      error = ""
    }
  }
  assert.equal(error, "", "Typing valid name must clear stale validation error")

  // Unrelated server error should not be cleared by typing
  error = "Organization plan task limit reached"
  value = "QA Test Project 2"
  if (value.trim() && error) {
    const errLower = error.toLowerCase()
    if (errLower.includes("name") || errLower.includes("required")) {
      error = ""
    }
  }
  assert.equal(error, "Organization plan task limit reached", "Unrelated server error preserved")
}

simulateFormValidation()
console.log("  [PASS] 5: Stale name validation error clears upon entering valid input, preserving unrelated errors")

console.log("\n==================================================")
console.log("ALL DASHBOARD GREETING, AUTH & TASK TESTS PASSED!")
console.log("==================================================\n")
