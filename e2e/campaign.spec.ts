import { test, expect, type Page } from "@playwright/test";
import { campaignMissions, gameRules } from "@kingdoms/shared";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

// The regression flows the 07-09 review found untested in a browser: recruit
// through the training queue (P2-9), a campaign sortie that leaves no NPC
// behind whatever the outcome (P2-7), formation presets, and a mixed-engine
// replay that follows the replay pointer instead of dumping every round (P2-10).
//
// A new dev account starts with wood/stone/iron but no food and no passive
// income, and training costs food — so both tests grow their own: farm first
// (10 food/minute), then queue the troops the real way.

/** Build farm + barracks and wait both out. The farm is what pays for training. */
async function buildFarmAndBarracks(page: Page): Promise<void> {
  const cityPanel = page.getByRole("region", { name: "Thành phố & công trình" });
  const farmBuild = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await cityPanel.locator(".building-row").filter({ hasText: "Nông trại" }).getByRole("button", { name: /^Xây/ }).click();
  expect((await farmBuild).ok()).toBeTruthy();
  const barracksBuild = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await page.getByRole("button", { name: "Xây trại lính" }).click();
  expect((await barracksBuild).ok()).toBeTruthy();
  await expect(page.getByText("Hàng đợi xây: 0/2")).toBeVisible({ timeout: 30_000 });
}

/** Wait until the header's food counter reaches `amount` (farm: 10/minute). */
async function waitForFood(page: Page, amount: number): Promise<void> {
  await expect.poll(async () => Number(await page.getByTestId("resource-food").textContent()), { timeout: 150_000 }).toBeGreaterThanOrEqual(amount);
}

/** Queue one +10 infantry batch and wait until the reserve actually holds it. */
async function trainTenInfantry(page: Page): Promise<void> {
  const prep = page.getByRole("region", { name: "Chuẩn bị quân" });
  const train = page.waitForResponse(response => response.url().endsWith("/api/commands/train"));
  await prep.getByRole("button", { name: "+10 Bộ binh khiên" }).click();
  expect((await train).ok()).toBeTruthy();
  // The one-slot badge fills, and only the tick past completesAt delivers.
  await expect(prep.getByText("Hàng đợi 1/1")).toBeVisible();
  await expect(prep.getByText(/Quân dự bị tại thành/)).toContainText("Bộ binh khiên 10", { timeout: 30_000 });
}

/** The session token the app stashed, for direct API reads. */
async function sessionToken(page: Page): Promise<string> {
  return page.evaluate(() => (JSON.parse(sessionStorage.getItem("kingdoms-session")!) as { token: string }).token);
}

test("recruit-reserve rides the training queue instead of granting instantly", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  test.setTimeout(210_000);
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Campaign E2E queue ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await page.getByRole("button", { name: "Vương quốc", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();

  await buildFarmAndBarracks(page);
  await waitForFood(page, 10);

  await page.getByRole("button", { name: "Quân đội", exact: true }).click();
  const prep = page.getByRole("region", { name: "Chuẩn bị quân" });
  await expect(prep).toBeVisible();
  await expect(prep.getByText(/Quân dự bị tại thành/)).toContainText("Bộ binh khiên 0");

  // --- The click that used to grant instantly ---
  const train = page.waitForResponse(response => response.url().endsWith("/api/commands/train"));
  await prep.getByRole("button", { name: "+10 Bộ binh khiên" }).click();
  expect((await train).ok()).toBeTruthy();
  await expect(prep.getByText("Hàng đợi 1/1")).toBeVisible();

  // --- The regression claim: an accepted command is a queue item, not a
  // grant. The reserve must still read zero right after the badge fills ---
  // this is exactly where the instant grant used to land. ---
  await expect(prep.getByText(/Quân dự bị tại thành/)).toContainText("Bộ binh khiên 0");

  // --- ...and the drill delivers on its own schedule, on the tick past
  // completesAt, both in the panel and in the server's own books. ---
  await expect(prep.getByText(/Quân dự bị tại thành/)).toContainText("Bộ binh khiên 10", { timeout: 30_000 });
  const token = await sessionToken(page);
  const snapshot = (await readBootstrap(page, token)).snapshot;
  const available = Object.values(snapshot.troopReserves ?? {}).reduce((sum, item) => sum + (item.available.shield_infantry ?? 0), 0);
  expect(available).toBe(10);
});

test("campaign sortie, formation preset and mixed replay pointer", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  // The sortie now includes two ~47-tile marches (to the objective, then home)
  // at one tile per server tick.
  test.setTimeout(480_000);
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Campaign E2E sortie ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await page.getByRole("button", { name: "Vương quốc", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();

  // --- Twenty trained infantry: ten to found the army, ten more so the preset
  // below has something to add when it is applied. ---
  await buildFarmAndBarracks(page);
  await waitForFood(page, 20);
  await page.getByRole("button", { name: "Quân đội", exact: true }).click();
  const prep = page.getByRole("region", { name: "Chuẩn bị quân" });
  await expect(prep).toBeVisible();
  await trainTenInfantry(page);
  await waitForFood(page, 10);
  await trainTenInfantry(page);
  await expect(prep.getByText(/Quân dự bị tại thành/)).toContainText("Bộ binh khiên 20", { timeout: 30_000 });

  // --- Found the v2 army with the free starter commander ---
  const token = await sessionToken(page);
  const create = page.waitForResponse(response => response.url().endsWith("/api/commands/army/create"));
  await prep.getByRole("button", { name: "Lập đạo quân" }).click();
  expect((await create).ok()).toBeTruthy();
  const armyCard = prep.locator("section").filter({ hasText: "Mẫu đội hình" }).first();
  await expect(armyCard).toContainText("Chỉ huy:", { timeout: 10_000 });
  await expect(armyCard).toContainText("10/100 lính");

  // --- Formation preset: save the 20-strong draft, then apply it ---
  await armyCard.getByLabel("Tiền tuyến số lượng").fill("20");
  await armyCard.getByLabel("Tên mẫu").fill("E2E tiền tuyến 20");
  await armyCard.getByRole("button", { name: "Lưu mẫu" }).click();
  const presetSelect = armyCard.getByLabel(/^Mẫu đội hình/);
  await expect(presetSelect.locator("option", { hasText: "E2E tiền tuyến 20" })).toBeAttached({ timeout: 10_000 });
  await presetSelect.selectOption({ label: "E2E tiền tuyến 20" });
  const apply = page.waitForResponse(response => response.url().endsWith("/api/commands/formation-presets/apply"));
  await armyCard.getByRole("button", { name: "Áp dụng mẫu" }).click();
  expect((await apply).ok()).toBeTruthy();
  // The card's counter follows the local draft, so the proof has to come from
  // the server's own books: the frontline squad really holds 20 now.
  // The server's own books, twice: the reserve gave up its 10, and the
  // frontline squad really holds 20 now. Polled once a second — the read
  // bucket allows 60 bootstrap requests a minute and the walks below would
  // spend a faster poll's whole budget.
  await expect.poll(async () => {
    const snapshot = (await readBootstrap(page, token)).snapshot;
    return Object.values(snapshot.troopReserves ?? {}).reduce((sum, item) => sum + (item?.available.shield_infantry ?? 0), 0);
  }, { timeout: 15_000, intervals: [1_000] }).toBe(0);
  await expect.poll(async () => {
    const snapshot = (await readBootstrap(page, token)).snapshot;
    return snapshot.armies.filter(army => army.composition?.frontline?.count === 20).length;
  }, { timeout: 15_000, intervals: [1_000] }).toBeGreaterThan(0);

  // --- The campaign sortie comes BEFORE the dev battle below: a sortie army is
  // never in transit (the encounter resolves in place), while an army that
  // loses a world battle rides a 120s recovery trip home that would block the
  // sortie with ARMY_IN_TRANSIT. The 20-troop army cannot beat the opening
  // mission's 25-troop NPC in 10 rounds but is never wiped by it either
  // (simulated 800 seed×terrain combinations: all draws, zero wipes), so the
  // assertion is outcome-tolerant — whatever the result, the mission NPC must
  // be gone from the shared world. ---
  // A sortie is only accepted within `gameRules.campaign.arrivalRadius` of the
  // mission's map target, so the test walks the army there the way a player
  // would: a move order through the same API the command tray uses, then the
  // tick loop's one tile per second. The objective line and the target pin are
  // what told the player where to send it.
  const { playerId, snapshot: beforeWalk } = await readBootstrap(page, token);
  const walking = beforeWalk.armies.find(army => army.ownerPlayerId === playerId && army.composition?.frontline?.count === 20);
  expect(walking).toBeDefined();
  const firstMission = campaignMissions.find(item => item.id === "chapter-1-ruins")!;
  expect(Math.abs(walking!.x - firstMission.target.x) + Math.abs(walking!.y - firstMission.target.y)).toBeGreaterThan(gameRules.campaign.arrivalRadius);
  const move = await page.request.post(`${api}/api/commands/move-army`, {
    headers: { authorization: `Bearer ${token}` },
    data: { commandId: `e2e-sortie-move-${Date.now()}`, armyId: walking!.id, targetX: firstMission.target.x, targetY: firstMission.target.y },
  });
  expect(move.ok()).toBeTruthy();
  // ~47 tiles at one per tick. Polled every TWO seconds: the read bucket
  // allows 60 bootstrap requests a minute, and a sustained one-per-second
  // poll across both walks plus the reads between them fills that window
  // — the walk home hit a 429 that way.
  await expect.poll(async () => {
    const { snapshot } = await readBootstrap(page, token);
    const army = snapshot.armies.find(item => item.id === walking!.id);
    return army ? `${army.x},${army.y},${army.targetX === undefined ? "idle" : "moving"}` : "gone";
  }, { timeout: 180_000, intervals: [2_000] }).toBe(`${firstMission.target.x},${firstMission.target.y},idle`);

  // The header's "Vương quốc" button is a *toggle* and the kingdom column has
  // been open since the start — clicking it unconditionally would close the
  // very panel the sortie button lives in.
  const kingdomButton = page.getByRole("button", { name: "Vương quốc", exact: true });
  if ((await kingdomButton.getAttribute("aria-expanded")) !== "true") await kingdomButton.click();
  const campaignPanel = page.getByRole("region", { name: "Chiến dịch và nghiên cứu" });
  await expect(campaignPanel).toBeVisible();
  // The next-mission card says where the objective is and offers to look at it.
  await expect(campaignPanel).toContainText(`Mục tiêu: ${firstMission.target.x},${firstMission.target.y}`);
  await expect(campaignPanel.getByRole("button", { name: "Đi tới mục tiêu" })).toBeVisible();
  const sortie = page.waitForResponse(response => response.url().endsWith("/api/commands/campaign/complete"));
  await campaignPanel.getByRole("button", { name: "Xuất quân" }).click();
  const sortieResponse = await sortie;
  expect(sortieResponse.ok()).toBeTruthy();

  const sortieSnapshot = (await readBootstrap(page, token)).snapshot;
  const missionNpcs = sortieSnapshot.armies.filter(army => typeof army.sourceWorldEventId === "string" && army.sourceWorldEventId.startsWith("campaign:"));
  expect(missionNpcs).toHaveLength(0);

  // --- Walk the army home before the broadcast battle: the dev mob spawns
  // three tiles from the city, and a pursuit order issued 47 tiles away cannot
  // resolve inside the report modal's 25s window. ---
  const home = sortieSnapshot.cities.find(city => city.playerId === playerId);
  expect(home).toBeDefined();
  const returnMove = await page.request.post(`${api}/api/commands/move-army`, {
    headers: { authorization: `Bearer ${token}` },
    data: { commandId: `e2e-return-${Date.now()}`, armyId: walking!.id, targetX: home!.x, targetY: home!.y },
  });
  expect(returnMove.ok()).toBeTruthy();
  await expect.poll(async () => {
    const { snapshot } = await readBootstrap(page, token);
    const army = snapshot.armies.find(item => item.id === walking!.id);
    return army ? `${army.x},${army.y},${army.targetX === undefined ? "idle" : "moving"}` : "gone";
  }, { timeout: 180_000, intervals: [2_000] }).toBe(`${home!.x},${home!.y},idle`);

  // --- A broadcast battle for the report modal: the deterministic dev target,
  // exactly the fixture army.spec uses, because natural mobs wander. The army
  // will lose this one — that is fine, the report modal is the point. ---
  const prepared = await request.post(`${api}/api/dev/battle-target`, { headers: { authorization: `Bearer ${token}` } });
  expect(prepared.ok()).toBeTruthy();
  const targetArmyId = ((await prepared.json()) as { targetArmyId: string }).targetArmyId;
  const armyRow = page.getByTestId("army-row").first();
  await armyRow.getByRole("button", { name: "Tấn công" }).click();
  const attackModal = page.getByRole("dialog", { name: "Tấn công" });
  await expect(attackModal).toBeVisible();
  const targetSelect = attackModal.getByLabel("Mục tiêu tấn công");
  await expect.poll(async () => await targetSelect.locator("option").count(), { timeout: 15_000 }).toBeGreaterThan(1);
  await targetSelect.selectOption(targetArmyId);
  const attack = page.waitForResponse(response => response.url().endsWith("/api/commands/attack"));
  await attackModal.getByRole("button", { name: "Ra lệnh tấn công" }).click();
  expect((await attack).ok()).toBeTruthy();
  const reportModal = page.getByRole("dialog", { name: "Báo cáo trận đánh" });
  await expect(reportModal).toBeVisible({ timeout: 25_000 });

  // --- One replay pointer for both views. Before P2-10 the mixed section
  // rendered every round from the first paint, whatever the slider said. ---
  const mixedDetails = reportModal.locator("details").filter({ hasText: "Phối quân" });
  await expect(mixedDetails).toBeVisible();
  const lastRound = await mixedDetails.locator("strong").last().textContent();
  expect(lastRound).toMatch(/^Hiệp \d+$/);
  await reportModal.getByRole("button", { name: "Xem lại" }).click();
  await expect(mixedDetails.getByText(lastRound!, { exact: true })).toBeHidden();
  await expect(mixedDetails.getByText("Hiệp 1", { exact: true })).toBeVisible({ timeout: 5_000 });
  await reportModal.getByRole("button", { name: "Đóng" }).click();
  await expect(page.getByTestId("army-row").filter({ hasText: "Đang tấn công" })).toHaveCount(0, { timeout: 15_000 });
});

type Snapshot = {
  armies: Array<{ id: string; x: number; y: number; targetX?: number | null; sourceWorldEventId?: string | null; composition?: { frontline?: { count: number } | null } | null; ownerPlayerId?: string | null }>;
  cities: Array<{ id: string; playerId: string; x: number; y: number }>;
  troopReserves?: Record<string, { available: { shield_infantry: number } }>;
  campaignProgress?: Record<string, { completedMissionIds: string[] }>;
};

/** Player id plus snapshot in one read — the army and its owner travel together. */
async function readBootstrap(page: Page, token: string): Promise<{ playerId: string; snapshot: Snapshot }> {
  const bootstrap = await page.request.get(`${api}/api/bootstrap`, { headers: { authorization: `Bearer ${token}` } });
  expect(bootstrap.ok()).toBeTruthy();
  const body = (await bootstrap.json()) as { player: { id: string }; snapshot: Snapshot };
  return { playerId: body.player.id, snapshot: body.snapshot };
}
