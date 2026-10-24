import { createServer } from "node:http"
import app from "../src/app.js"
import { initSocketServer } from "../src/sockets/index.js"

const server = createServer(app)
initSocketServer(server, app)

app.server = server

export { server, app }
export default app
