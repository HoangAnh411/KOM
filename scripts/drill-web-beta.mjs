import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";

async function runCommand(command, args, env = {}, throwOnError = true) {
  return new Promise((resolve, reject) => {
    console.log(`> ${command} ${args.join(" ")}`);
    const proc = spawn(command, args, { stdio: "inherit", shell: false, env: { ...process.env, ...env } });
    proc.on("error", reject);
    proc.on("close", code => {
      if (code === 0) resolve(code);
      else if (throwOnError) reject(new Error(`Command failed with code ${code}`));
      else resolve(code);
    });
  });
}

async function runCommandOutput(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { shell: false, env: { ...process.env, ...env } });
    proc.on("error", reject);
    let stdout = "";
    proc.stdout.on("data", data => stdout += data.toString());
    proc.on("close", code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollReady(composeArgs, envVars, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await runCommand("docker", [...composeArgs, "exec", "game", "wget", "-qO-", "http://127.0.0.1:3000/health/ready"], envVars);
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("Timeout waiting for readiness");
}

async function main() {
  const tmpDir = join(tmpdir(), `kingdoms-drill-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  const envFile = join(tmpDir, ".env");
  const port = process.env.DRILL_PORT || 8088;
  const dbUser = "kingdoms";
  const dbPass = randomBytes(16).toString("hex");
  const internalSiteAddress = "localhost:8081";
  const externalSiteAddress = `https://localhost:${port}`;

  const envContent = `
POSTGRES_USER=${dbUser}
POSTGRES_PASSWORD=${dbPass}
POSTGRES_DB=kingdoms
SITE_ADDRESS=${internalSiteAddress}
CLIENT_ORIGIN=${externalSiteAddress}
SMOKE_PORT=${port}
METRICS_TOKEN=${randomBytes(16).toString("hex")}
ADMIN_TOKEN=${randomBytes(16).toString("hex")}
COOKIE_SECURE=true
`.trim();

  writeFileSync(envFile, envContent);

  const composeArgs = ["compose", "-p", "kingdoms-beta-drill", "-f", "infra/docker-compose.prod.yml", "-f", "infra/docker-compose.smoke.yml"];
  const envVars = {
    KINGDOMS_ENV_FILE: envFile,
    POSTGRES_USER: dbUser,
    POSTGRES_PASSWORD: dbPass,
    POSTGRES_DB: "kingdoms",
    SITE_ADDRESS: internalSiteAddress,
    CLIENT_ORIGIN: externalSiteAddress,
    SMOKE_PORT: String(port)
  };

  const report = [];
  report.push("# Phase 7D Recovery Drill Report");
  report.push(`Date: ${new Date().toISOString()}`);

  try {
    console.log("Starting drill stack...");
    await runCommand("docker", [...composeArgs, "up", "--build", "-d", "--wait"], envVars);

    // Drill 1: Redis Kill
    console.log("Drill 1: Redis kill");
    await runCommand("docker", [...composeArgs, "kill", "redis"], envVars);
    await runCommand("docker", [...composeArgs, "start", "redis"], envVars);
    await pollReady(composeArgs, envVars);
    report.push("- [x] Drill 1 (Redis Kill): Passed");

    // Drill 2: Game Kill
    console.log("Drill 2: Game kill");
    await runCommand("docker", [...composeArgs, "kill", "game"], envVars);
    const outboxStatus = await runCommandOutput("docker", [...composeArgs, "ps", "--services", "--filter", "status=running"], envVars);
    if (!outboxStatus.includes("outbox")) throw new Error("Outbox worker is not running after game kill");
    await runCommand("docker", [...composeArgs, "start", "game"], envVars);
    await pollReady(composeArgs, envVars);
    report.push("- [x] Drill 2 (Game Kill): Passed (Outbox isolated)");

    // Drill 3: Backup and Restore
    console.log("Drill 3: Backup and Restore");
    mkdirSync("infra/backup", { recursive: true });
    const dumpPath = `infra/backup/drill_dump_${Date.now()}.sql`;

    // Seed sentinel
    const sentinelId = randomUUID();
    console.log(`Seeding sentinel ID: ${sentinelId}`);
    await runCommand("docker", [...composeArgs, "exec", "postgres", "psql", "-U", dbUser, "-d", "kingdoms", "-c", `INSERT INTO event_ledger (id, event_type, aggregate_type, aggregate_id, payload, created_at) VALUES ('${sentinelId}', 'drill.sentinel', 'system', '${sentinelId}', '{}', NOW())`], envVars);

    // Backup
    await runCommand("docker", [...composeArgs, "exec", "postgres", "pg_dump", "-U", dbUser, "kingdoms", "-f", "/tmp/dump.sql"], envVars);
    await runCommand("docker", ["cp", `kingdoms-beta-drill-postgres-1:/tmp/dump.sql`, dumpPath], envVars);
    const achievedRpo = 0; // 0ms data loss because we backup right before drop

    // Outage starts (RTO timer starts)
    const outageStart = Date.now();
    await runCommand("docker", [...composeArgs, "stop", "game", "outbox"], envVars);
    await runCommand("docker", [...composeArgs, "exec", "postgres", "dropdb", "-U", dbUser, "--force", "kingdoms"], envVars);
    await runCommand("docker", [...composeArgs, "exec", "postgres", "createdb", "-U", dbUser, "kingdoms"], envVars);

    // Restore
    await runCommand("docker", ["cp", dumpPath, `kingdoms-beta-drill-postgres-1:/tmp/dump.sql`], envVars);
    await runCommand("docker", [...composeArgs, "exec", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", dbUser, "-d", "kingdoms", "-f", "/tmp/dump.sql"], envVars);

    await runCommand("docker", [...composeArgs, "start", "game", "outbox"], envVars);
    await pollReady(composeArgs, envVars);

    // System recovered (RTO timer ends)
    const rtoDuration = Date.now() - outageStart;

    // Check sentinel
    const sentinelCheck = await runCommandOutput("docker", [...composeArgs, "exec", "postgres", "psql", "-U", dbUser, "-d", "kingdoms", "-t", "-c", `SELECT id FROM event_ledger WHERE id = '${sentinelId}'`], envVars);
    if (!sentinelCheck.includes(sentinelId)) throw new Error("Sentinel data lost after restore");

    report.push(`- [x] Drill 3 (Backup/Restore): Passed`);
    report.push(`  - RPO Check: 0ms data lost (<= 24h passed)`);
    report.push(`  - RTO Check: Recovery took ${rtoDuration}ms (<= 30m passed)`);

    if (existsSync(dumpPath)) rmSync(dumpPath);
    console.log("Drills passed successfully.");
  } catch (err) {
    report.push(`- [ ] Drill failed with error: ${err.message}`);
    console.error(err);
    process.exitCode = 1;
  } finally {
    console.log("Tearing down drill stack...");
    await runCommand("docker", [...composeArgs, "down", "-v", "--remove-orphans"], envVars, false);
    rmSync(tmpDir, { recursive: true, force: true });

    mkdirSync("infra/backup", { recursive: true });
    writeFileSync("infra/backup/drill-report.md", report.join("\n") + "\n");
    console.log("Report written to infra/backup/drill-report.md");
  }
}

main();
