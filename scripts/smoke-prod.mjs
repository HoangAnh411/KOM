import { spawn } from "node:child_process";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

async function runCommand(command, args, env = {}, input) {
  return new Promise((resolve, reject) => {
    console.log(`> ${command} ${args.join(" ")}`);
    const proc = spawn(command, args, { stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"], shell: false, env: { ...process.env, ...env } });
    if (input !== undefined) proc.stdin.end(input);
    proc.on("error", reject);
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

function passwordHash(password) {
  const cost = 131072; const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64, { N: cost, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return `scrypt$v=1$N=${cost}$r=8$p=1$${salt}$${derived.toString("hex")}`;
}

async function main() {
  const tmpDir = join(tmpdir(), `kingdoms-smoke-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  const envFile = join(tmpDir, ".env");
  const port = process.env.SMOKE_PORT || 8085;

  const dbUser = "kingdoms";
  const dbPass = randomBytes(16).toString("hex");
  const dbName = "kingdoms";
  const adminUsername = `smoke_admin_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let adminPassword = `${randomBytes(18).toString("base64url")}Aa1!`;
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

    console.log("Bootstrapping a temporary admin account...");
    const bootstrapSql = `INSERT INTO users(id,username_normalized,password_hash,status,role) VALUES('${randomUUID()}','${adminUsername}','${passwordHash(adminPassword)}','active','admin');\n`;
    await runCommand("docker", [...composeArgs, "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", dbUser, "-d", dbName], envVars, bootstrapSql);

    console.log("Running Playwright smoke tests...");
    await runCommand(process.execPath, [playwrightCli, "test", "--project=password-auth", "--project=admin"], {
      ...envVars,
      PLAYWRIGHT_WEB: externalSiteAddress,
      PLAYWRIGHT_API: externalSiteAddress,
      E2E_PROD_SMOKE: "1",
      E2E_ADMIN_USERNAME: adminUsername,
      E2E_ADMIN_PASSWORD: adminPassword
    });

    console.log("Smoke test passed!");
  } catch (error) {
    console.error("Test failed, printing game logs:");
    await runCommand("docker", [...composeArgs, "logs", "game"], envVars).catch(() => {});
    throw error;
  } finally {
    adminPassword = "";
    console.log("Tearing down smoke stack...");
    await runCommand("docker", [...composeArgs, "down", "-v", "--remove-orphans"], envVars);
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
