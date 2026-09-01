import { createServer } from "./app.js";

const server = createServer();

const shutdown = async (signal: string) => {
  console.log(`received ${signal}, starting graceful shutdown`);
  try {
    await server.stop();
    console.log("shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("shutdown failed", error);
    process.exit(1);
  }
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

server.start().catch((error) => { console.error(error); process.exitCode = 1; });