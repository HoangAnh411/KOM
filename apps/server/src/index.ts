import { createServer } from "./app.js";

const server = createServer();
server.start().catch((error) => { console.error(error); process.exitCode = 1; });
