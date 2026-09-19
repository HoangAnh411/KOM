import { randomUUID } from "node:crypto";
import { stdin as input, stdout as output } from "node:process";
import { pathToFileURL } from "node:url";
import type { Pool as PoolType } from "pg";
import { Pool } from "pg";
import { hashPassword, normalizeUsername, validateCredentials } from "./auth.js";

type BootstrapResult = "created" | "rotated" | "unchanged";

export async function bootstrapAdmin(pool: PoolType, usernameValue: string, passwordHash: string | undefined, rotate: boolean): Promise<BootstrapResult> {
  const username = normalizeUsername(usernameValue);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`admin:${username}`]);
    const existing = await client.query<{ id: string; role: "player" | "admin" }>("SELECT id,role FROM users WHERE username_normalized=$1 FOR UPDATE", [username]);
    const row = existing.rows[0];
    if (row?.role === "player") throw new Error("username belongs to a player account");
    if (row && !rotate) { await client.query("COMMIT"); return "unchanged"; }
    if (!passwordHash) throw new Error("password hash is required to create or rotate an admin");
    const userId = row?.id ?? randomUUID();
    if (row) await client.query("UPDATE users SET password_hash=$1,status='active',banned_at=NULL,banned_reason=NULL WHERE id=$2", [passwordHash, userId]);
    else await client.query("INSERT INTO users(id,username_normalized,password_hash,status,role) VALUES($1,$2,$3,'active','admin')", [userId, username, passwordHash]);
    await client.query("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
    await client.query("INSERT INTO admin_actions(id,actor_id,action_type,reason,target_type,target_id,outcome,auth_method,metadata) VALUES($1,NULL,$2,$3,'admin',$4,'applied','bootstrap',$5)", [randomUUID(), row ? "admin.password.rotate" : "admin.create", row ? "operator requested password rotation" : "operator bootstrapped admin", userId, JSON.stringify({ source: "admin-bootstrap" })]);
    await client.query("COMMIT");
    return row ? "rotated" : "created";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

function readHiddenLine(label: string): Promise<string> {
  output.write(label);
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      input.off("data", onData);
      input.setRawMode(wasRaw);
      output.write("\n");
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of String(chunk)) {
        if (character === "") { finish(new Error("cancelled")); return; }
        if (character === "\r" || character === "\n") { finish(); return; }
        if (character === "" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
    };
    input.on("data", onData);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2); const rotate = args.includes("--rotate-password"); const positional = args.filter(value => value !== "--rotate-password");
  if (positional.length !== 1 || args.some(value => value.startsWith("--") && value !== "--rotate-password")) throw new Error("usage: npm run admin:bootstrap -- <username> [--rotate-password]");
  const username = normalizeUsername(positional[0]!); const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!input.isTTY) throw new Error("an interactive TTY is required to read the password safely");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const existing = await pool.query<{ role: "player" | "admin" }>("SELECT role FROM users WHERE username_normalized=$1", [username]);
    if (existing.rows[0]?.role === "player") throw new Error("username belongs to a player account");
    if (existing.rows[0]?.role === "admin" && !rotate) { console.log(`admin ${username} already exists; password unchanged`); return; }
    let password = await readHiddenLine("Admin password: "); let confirmation = await readHiddenLine("Confirm password: ");
    if (password !== confirmation) throw new Error("password confirmation does not match");
    validateCredentials(username, password); const passwordHash = await hashPassword(password); password = ""; confirmation = "";
    const result = await bootstrapAdmin(pool, username, passwordHash, rotate);
    console.log(result === "created" ? `created admin ${username}` : result === "rotated" ? `rotated password for admin ${username}` : `admin ${username} already exists; password unchanged`);
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
