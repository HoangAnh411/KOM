import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

async function runCommand(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    console.log(`> ${command} ${args.join(" ")}`);
    const proc = spawn(command, args, { stdio: "inherit", shell: false, env: { ...process.env, ...env } });
    proc.on("error", reject);
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

async function main() {
  const tmpDir = join(tmpdir(), `kingdoms-smoke-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  const envFile = join(tmpDir, ".env");
  const port = process.env.SMOKE_PORT || 8085;

  const dbUser = "kingdoms";
  const dbPass = randomBytes(16).toString("hex");
  const dbName = "kingdoms";
  const internalSiteAddress = "localhost:8081";
  const externalSiteAddress = `https://localhost:${port}`;
  const playwrightCli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));

  const envContent = `
POSTGRES_USER=${dbUser}
POSTGRES_PASSWORD=${dbPass}
POSTGRES_DB=${dbName}
SITE_ADDRESS=${internalSiteAddress}
CLIENT_ORIGIN=${externalSiteAddress}
SMOKE_PORT=${port}
METRICS_TOKEN=${randomBytes(16).toString("hex")}
ADMIN_TOKEN=${randomBytes(16).toString("hex")}
COOKIE_SECURE=true
`.trim();

  writeFileSync(envFile, envContent);

  const composeArgs = ["compose", "-p", "kingdoms-beta-smoke", "-f", "infra/docker-compose.prod.yml", "-f", "infra/docker-compose.smoke.yml"];
  const envVars = {
    KINGDOMS_ENV_FILE: envFile,
    POSTGRES_USER: dbUser,
    POSTGRES_PASSWORD: dbPass,
    POSTGRES_DB: dbName,
    SITE_ADDRESS: internalSiteAddress,
    CLIENT_ORIGIN: externalSiteAddress,
    SMOKE_PORT: String(port)
  };

  try {
    console.log("Starting smoke stack...");
    await runCommand("docker", [...composeArgs, "up", "--build", "-d", "--wait"], envVars);

    console.log("Running Playwright smoke tests...");
    await runCommand(process.execPath, [playwrightCli, "test", "--project=password-auth"], {
      ...envVars,
      PLAYWRIGHT_WEB: externalSiteAddress,
      PLAYWRIGHT_API: externalSiteAddress,
      E2E_PROD_SMOKE: "1"
    });

    console.log("Smoke test passed!");
  } catch (error) {
    console.error("Test failed, printing game logs:");
    await runCommand("docker", [...composeArgs, "logs", "game"], envVars).catch(() => {});
    throw error;
  } finally {
    console.log("Tearing down smoke stack...");
    await runCommand("docker", [...composeArgs, "down", "-v", "--remove-orphans"], envVars);
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
