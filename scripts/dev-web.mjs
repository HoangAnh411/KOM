// Runs the web app locally — server (watch mode, tsx) + client (Vite dev server).
// Both children get this process's stdio so logs interleave; Ctrl+C kills both.
import { spawn } from "node:child_process";

const children = new Set();
const start = (name, command, args) => {
  const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  children.add(child);
  child.on("exit", (code) => {
    children.delete(child);
    console.log(`[dev:web] ${name} exited (${code})`);
    if (code !== 0) shutdown();
  });
  return child;
};

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start("server", "npm", ["run", "dev", "-w", "@kingdoms/server"]);
start("client", "npm", ["run", "dev", "-w", "@kingdoms/client"]);