import { test, expect, type Page } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });
const adminHeaders = { authorization: "Bearer playwright-admin-token" };

async function login(page: Page, name: string): Promise<{ token: string; player: { id: string } }> {
  await page.goto("/"); await page.getByPlaceholder("Tên người chơi").fill(name); await page.getByRole("button", { name: "Vào kingdom" }).click(); await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("kingdoms-session")!) as { token: string; player: { id: string } });
}

test("moderation freezes the HUD before revoking realtime auth", async ({ page, request }, testInfo) => {
  const session = await login(page, `Frozen E2E ${testInfo.project.name} ${Date.now()}`);
  const ban = await request.post(`${api}/api/admin/player/ban`, { headers: adminHeaders, data: { playerId: session.player.id, reason: "playwright moderation" } }); expect(ban.ok()).toBeTruthy();
  await expect(page.getByText(/Tài khoản đang bị khóa/)).toContainText("đóng băng"); await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toHaveAttribute("data-frozen", "true");
  const unban = await request.post(`${api}/api/admin/player/unban`, { headers: adminHeaders, data: { playerId: session.player.id, reason: "playwright cleanup" } }); expect(unban.ok()).toBeTruthy();
});

test("alliance leader vote reaches a passed state", async ({ page, request }, testInfo) => {
  const leaderName = `Vote Leader ${testInfo.project.name} ${Date.now()}`; const candidateName = `Vote Candidate ${testInfo.project.name} ${Date.now()}`; const leader = await login(page, leaderName);
  const candidateLogin = await request.post(`${api}/api/auth/dev`, { data: { displayName: candidateName, factionId: "bastion" } }); expect(candidateLogin.ok()).toBeTruthy(); const candidate = await candidateLogin.json() as { token: string; player: { id: string } };
  const leaderHeaders = { authorization: `Bearer ${leader.token}` }; const candidateHeaders = { authorization: `Bearer ${candidate.token}` };
  const created = await request.post(`${api}/api/commands/alliance/create`, { headers: leaderHeaders, data: { commandId: crypto.randomUUID(), name: `Council ${Date.now()}`, tag: `V${Date.now().toString().slice(-4)}` } }); expect(created.ok()).toBeTruthy(); const createdBody = await created.json(); const allianceId = createdBody.snapshot.alliances.find((item: { leaderPlayerId: string }) => item.leaderPlayerId === leader.player.id).id as string;
  expect((await request.post(`${api}/api/commands/alliance/join`, { headers: candidateHeaders, data: { commandId: crypto.randomUUID(), allianceId } })).ok()).toBeTruthy();
  const opened = await request.post(`${api}/api/commands/alliance/vote/open`, { headers: leaderHeaders, data: { commandId: crypto.randomUUID(), candidatePlayerId: candidate.player.id } }); expect(opened.ok()).toBeTruthy(); const voteId = (await opened.json()).data.id as string;
  expect((await request.post(`${api}/api/commands/alliance/vote/cast`, { headers: leaderHeaders, data: { commandId: crypto.randomUUID(), voteId, vote: true } })).ok()).toBeTruthy(); const passed = await request.post(`${api}/api/commands/alliance/vote/cast`, { headers: candidateHeaders, data: { commandId: crypto.randomUUID(), voteId, vote: true } }); expect(passed.ok()).toBeTruthy(); const body = await passed.json(); expect(body.data.status).toBe("passed"); expect(body.snapshot.alliances.find((item: { id: string }) => item.id === allianceId).leaderPlayerId).toBe(candidate.player.id);
});

test("mob migration is rendered with spawned NPC armies", async ({ page }, testInfo) => {
  await login(page, `NPC E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByTestId("advanced-drawer-toggle").click();
  const event = page.getByTestId("world-event").filter({ hasText: "mob_migration" }).first(); await expect(event).toBeVisible({ timeout: 10_000 });
  // The shared e2e world grows player armies that can kill wandering mobs, so only the
  // mob-count row itself is asserted here; deterministic spawn counts live in unit tests.
  await expect(event).toContainText(/bọn xâm lược/);
});

test("season close is visible in the archive UI", async ({ page, request }, testInfo) => {
  await login(page, `Archive E2E ${testInfo.project.name} ${Date.now()}`); const closed = await request.post(`${api}/api/admin/season/close`, { headers: adminHeaders, data: { reason: "playwright season archive" } }); expect(closed.ok()).toBeTruthy();
  await page.getByTestId("advanced-drawer-toggle").click();
  await page.getByRole("button", { name: "Nạp lịch sử mùa" }).click(); await expect(page.getByTestId("archive-season").first()).toBeVisible();
});
