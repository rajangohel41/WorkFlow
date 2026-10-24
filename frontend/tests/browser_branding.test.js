import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { formatTitle, getRouteTitle, DEFAULT_TITLE } from "../src/hooks/useRouteTitle.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, "..")
const backendRoot = path.resolve(__dirname, "../../backend")

console.log("==================================================")
console.log("=== BROWSER BRANDING & VERCEL CONFIG TEST SUITE ===")
console.log("==================================================")

// 1. Favicon verification
console.log("\n[TEST 1] Favicon SVG asset verification")
const faviconPath = path.join(frontendRoot, "public", "favicon.svg")
assert.ok(fs.existsSync(faviconPath), "frontend/public/favicon.svg must exist")
const faviconContent = fs.readFileSync(faviconPath, "utf8")
assert.ok(faviconContent.includes("<svg"), "favicon.svg must be an SVG file")
assert.ok(faviconContent.includes("#6366F1"), "favicon.svg must feature WorkFlow indigo #6366F1")
assert.ok(faviconContent.includes("<rect") && faviconContent.includes("<path"), "favicon.svg must include node & path geometry")
console.log("  [PASS] 1: favicon.svg is a valid, high-contrast SVG featuring WorkFlow branding")

// 2. index.html verification
console.log("\n[TEST 2] index.html metadata and favicon linkage")
const indexPath = path.join(frontendRoot, "index.html")
const indexContent = fs.readFileSync(indexPath, "utf8")
assert.ok(indexContent.includes('rel="icon"'), "index.html must include link rel='icon'")
assert.ok(indexContent.includes('href="/favicon.svg"'), "index.html must link to /favicon.svg")
assert.ok(indexContent.includes("<title>WorkFlow — Plan better. Build faster. Work together.</title>"), "index.html must have professional default title")
assert.ok(indexContent.includes('name="theme-color" content="#6366F1"'), "index.html must specify theme-color")
const titleMatches = indexContent.match(/<title>/g)
assert.equal(titleMatches?.length, 1, "index.html must not contain duplicate title tags")
console.log("  [PASS] 2: index.html correctly references favicon.svg and defines professional metadata")

// 3. Dynamic route title resolution
console.log("\n[TEST 3] Dynamic browser tab title resolution across routes")
const expectations = [
  ["/dashboard", "Dashboard | WorkFlow"],
  ["/projects", "Projects | WorkFlow"],
  ["/tasks", "Tasks | WorkFlow"],
  ["/calendar", "Calendar | WorkFlow"],
  ["/team", "Team | WorkFlow"],
  ["/analytics", "Analytics | WorkFlow"],
  ["/settings", "Settings | WorkFlow"],
  ["/settings/profile", "Settings | WorkFlow"],
  ["/settings/security", "Settings | WorkFlow"],
  ["/login", "Sign In | WorkFlow"],
  ["/signup", "Create Account | WorkFlow"],
  ["/forgot-password", "Forgot Password | WorkFlow"],
  ["/reset-password", "Reset Password | WorkFlow"],
  ["/invite/some-token", "Accept Invitation | WorkFlow"],
  ["/onboarding", "Get Started | WorkFlow"],
  ["/unknown-path", "Page Not Found | WorkFlow"],
  ["/", DEFAULT_TITLE],
]

for (const [route, expected] of expectations) {
  const resolved = formatTitle(getRouteTitle(route))
  assert.equal(resolved, expected, `Route "${route}" should resolve to title "${expected}"`)
}

// Custom entity titles
assert.equal(formatTitle("Redesign"), "Redesign | WorkFlow")
assert.equal(formatTitle("WF-124 Implement API"), "WF-124 Implement API | WorkFlow")
assert.equal(formatTitle("Page Not Found"), "Page Not Found | WorkFlow")
assert.equal(formatTitle(DEFAULT_TITLE), DEFAULT_TITLE)
console.log("  [PASS] 3: Dynamic route title resolution matches all required standard and custom route specs")

// 4. frontend/vercel.json verification
console.log("\n[TEST 4] frontend/vercel.json configuration")
const feVercelPath = path.join(frontendRoot, "vercel.json")
assert.ok(fs.existsSync(feVercelPath), "frontend/vercel.json must exist")
const feVercel = JSON.parse(fs.readFileSync(feVercelPath, "utf8"))
assert.equal(feVercel.$schema, "https://openapi.vercel.sh/vercel.json")
assert.equal(feVercel.framework, "vite")
assert.equal(feVercel.buildCommand, "npm run build")
assert.equal(feVercel.outputDirectory, "dist")
assert.ok(Array.isArray(feVercel.rewrites), "frontend rewrites must be an array")
assert.equal(feVercel.rewrites[0].source, "/(.*)")
assert.equal(feVercel.rewrites[0].destination, "/index.html")
console.log("  [PASS] 4: frontend/vercel.json is valid and configures SPA rewrites for Vite")

// 5. backend/vercel.json verification
console.log("\n[TEST 5] backend/vercel.json configuration")
const beVercelPath = path.join(backendRoot, "vercel.json")
assert.ok(fs.existsSync(beVercelPath), "backend/vercel.json must exist")
const beVercel = JSON.parse(fs.readFileSync(beVercelPath, "utf8"))
assert.equal(beVercel.$schema, "https://openapi.vercel.sh/vercel.json")
assert.ok(Array.isArray(beVercel.rewrites), "backend rewrites must be an array")
assert.equal(beVercel.rewrites[0].source, "/(.*)")
assert.equal(beVercel.rewrites[0].destination, "/api/index.js")
console.log("  [PASS] 5: backend/vercel.json is valid and configures serverless routing to api/index.js")

// 6. backend/api/index.js entrypoint verification
console.log("\n[TEST 6] backend/api/index.js serverless entrypoint")
const beApiIndex = path.join(backendRoot, "api", "index.js")
assert.ok(fs.existsSync(beApiIndex), "backend/api/index.js must exist")
const apiContent = fs.readFileSync(beApiIndex, "utf8")
assert.ok(apiContent.includes("../src/app.js"), "api/index.js must import src/app.js")
assert.ok(apiContent.includes("export default"), "api/index.js must have a default export")
console.log("  [PASS] 6: backend/api/index.js cleanly exports handler for Vercel Express routing")

console.log("\n==================================================")
console.log("ALL BROWSER BRANDING & VERCEL CONFIG TESTS PASSED!")
console.log("==================================================")
