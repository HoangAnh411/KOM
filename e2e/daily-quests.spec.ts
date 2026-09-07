import { test, expect, type Page } from "@playwright/test";
import { dailyQuests, dailyQuestDayKey, selectDailyQuestIds } from "@kingdoms/shared";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

// The daily-quest loop a player actually lives: bootstrap hands over the board,
// ordinary play fills the rows, and each claim pays once. The board is drawn
// per-UTC-day, so the test never assumes which quests are on it — it reads
// today's selection from the snapshot and branches (the catalog and the
// selection function come from shared, the same source the server used).

type Snapshot = {
  cities: Array<{ id: string; playerId: string }>;
  dailyQuests?: {
    dayKey: string; refreshesAt: string; points: number;
    quests: Array<{ questId: string; progress: number; claimed: boolean }>;
    claimedMilestones: number[];
  };
};

/** Player id plus snapshot in one read — the board and its owner travel together. */
async function readBootstrap(page: Page, token: string): Promise<{ playerId: string; snapshot: Snapshot }> {
  const bootstrap = await page.request.get(`${api}/api/bootstrap`, { headers: { authorization: `Bearer ${token}` } });
  expect(bootstrap.ok()).toBeTruthy();
  const body = (await bootstrap.json()) as { player: { id: string }; snapshot: Snapshot };
  return { playerId: body.player.id, snapshot: body.snapshot };
}

/** The session token the app stashed, for direct API reads. */
async function sessionToken(page: Page): Promise<string> {
  return page.evaluate(() => (JSON.parse(sessionStorage.getItem("kingdoms-session")!) as { token: string }).token);
}

/** Build road depot + farm and wait both out — two finished levels, i.e. the
 *  whole of daily_build's target, bought the way a player buys them. The depot
 *  is also what unlocks the harvest button below (DEPOT_REQUIRED). */
async function buildDepotAndFarm(page: Page): Promise<void> {
  const cityPanel = page.getByRole("region", { name: "Thành phố & công trình" });
  const depotBuild = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await page.getByRole("button", { name: "Xây trạm trung chuyển" }).click();
  expect((await depotBuild).ok()).toBeTruthy();
  const farmBuild = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await cityPanel.locator(".building-row").filter({ hasText: "Nông trại" }).getByRole("button", { name: /^Xây/ }).click();
  expect((await farmBuild).ok()).toBeTruthy();
  await expect(page.getByText("Hàng đợi xây: 0/2")).toBeVisible({ timeout: 30_000 });
}

test("the daily board fills with ordinary play and pays each claim once", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  // Two build queues plus three harvests, with snapshot waits between them.
  test.setTimeout(150_000);
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Daily E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await page.getByRole("button", { name: "Vương quốc", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();
  const token = await sessionToken(page);

  // --- The board arrives with the session: six quests, nothing done yet, and
  // exactly the ids the shared day-key selection drew — the same board every
  // player sees today, checked against the function that drew it. ---
  const { snapshot: opening } = await readBootstrap(page, token);
  const board = opening.dailyQuests;
  expect(board, "a current server always sends the viewer its board").toBeDefined();
  expect(board!.dayKey).toBe(dailyQuestDayKey(Date.now()));
  expect(board!.quests.map(quest => quest.questId)).toEqual(selectDailyQuestIds(board!.dayKey));
  expect(board!.quests).toHaveLength(6);
  expect(board!.points).toBe(0);
  expect(Date.parse(board!.refreshesAt)).toBeGreaterThan(Date.now());

  // --- Ordinary play: two finished buildings and three harvests. The day left
  // one easy quest out, so finishing BOTH easy quests guarantees at least one
  // of them is on today's board and complete. ---
  await buildDepotAndFarm(page);
  const logisticsPanel = page.getByRole("region", { name: "Kinh tế & vận tải" });
  for (let index = 0; index < 3; index++) {
    const harvest = page.waitForResponse(response => response.url().endsWith("/api/commands/harvest"));
    await logisticsPanel.getByRole("button", { name: "Khai thác" }).first().click();
    expect((await harvest).ok()).toBeTruthy();
  }

  // The board follows the tick, not the click — poll the server's own books
  // for the quests to land, then assert the same facts on screen.
  const { snapshot: played } = await readBootstrap(page, token);
  // A day flip mid-run would move the goalposts: yesterday's quests are
  // forfeit by design, and this test is not about proving that.
  test.skip(played.dailyQuests!.dayKey !== board!.dayKey, "the UTC day rolled over mid-run");
  const finished = (played.dailyQuests!.quests).filter(quest => !quest.claimed && quest.progress >= dailyQuests.find(item => item.id === quest.questId)!.target);
  expect(finished.length, "at least one of the two finished easy quests was drawn today").toBeGreaterThan(0);
  expect(played.dailyQuests!.points).toBeGreaterThanOrEqual(finished.length);
  const toClaim = dailyQuests.find(item => item.id === finished[0]!.questId)!;

  // --- The panel tells the same story: the section, the score, the ✓ row. ---
  const kingdomButton = page.getByRole("button", { name: "Vương quốc", exact: true });
  if ((await kingdomButton.getAttribute("aria-expanded")) !== "true") await kingdomButton.click();
  const progressionPanel = page.getByRole("region", { name: "Chiến dịch và nghiên cứu" });
  await expect(progressionPanel).toBeVisible();
  await expect(progressionPanel.getByText("Nhiệm vụ hằng ngày")).toBeVisible();
  await expect(progressionPanel.getByText(new RegExp(`Hôm nay · \\d+/10 điểm · làm mới sau`))).toBeVisible();
  const questRow = progressionPanel.locator("li").filter({ hasText: toClaim.title });
  await expect(questRow).toContainText(`✓`);
  await expect(questRow).toContainText(`${toClaim.target}/${toClaim.target}`);

  // --- The claim: one click, the reward lands, the button retires. ---
  const wood = page.getByTestId("resource-wood");
  const woodBefore = await wood.textContent();
  const claim = page.waitForResponse(response => response.url().endsWith("/api/commands/daily-quest/claim"));
  await questRow.getByRole("button", { name: "Nhận", exact: true }).click();
  expect((await claim).ok()).toBeTruthy();
  await expect(wood).not.toHaveText(woodBefore ?? "");
  await expect(questRow.getByRole("button", { name: "Đã nhận" })).toBeVisible();
  // Milestones stay out of reach at these points (≤ 2), the reason on the button says so.
  const milestoneButton = progressionPanel.getByRole("button", { name: "Nhận mốc 5đ" });
  await expect(milestoneButton).toBeDisabled();
});
