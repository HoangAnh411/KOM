import { test, expect, type Page } from "@playwright/test";

// UI-5 filled the slot the redesign left open with a comment: "inventing rows that
// look like real events would be worse than an empty state". So the thing to check
// in a browser is not that rows appear — `activity.test.ts` pins every wording,
// glyph and chip against the derivation — but the two claims a pure test cannot
// make, because both are about a live snapshot stream:
//
//   1. One fact is one row. Snapshots arrive every couple of seconds and each one
//      is re-diffed against the last, so a build that finished once must not
//      accumulate a row per tick for as long as the player stays logged in.
//   2. A row leads somewhere. The feed's whole reason to be a list of buttons is
//      that "xây xong" is useless if the player then has to find the city panel.
const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";

test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

const feed = (page: Page) => page.getByRole("region", { name: "Hoạt động gần đây" });
const attention = (page: Page) => page.getByRole("region", { name: "Cần chú ý" });
const rowsOfKind = (page: Page, kind: string) => feed(page).locator(`[data-kind="${kind}"]`);

async function login(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(name);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();
  // 1280x720 is the default project viewport, which is the medium band: the
  // activity column starts closed there and the header toggle is how a player
  // opens it. Driving the real toggle rather than resizing to 1440 also means this
  // spec covers the band where the column is a track the player asked for.
  await page.getByRole("button", { name: "Hoạt động", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Dòng hoạt động" })).toBeVisible();
}

test("one order is one row, however many snapshots restate it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  await login(page, `Feed E2E ${testInfo.project.name} ${Date.now()}`);

  // "Cần chú ý" is the panel that can be asserted empty: it is read from the
  // current snapshot and a fresh world has nothing waiting on the player. The feed
  // cannot be — the suite runs the server with WORLD_EVENT_SPAWN_CHANCE=1, so a
  // world event is real news within a tick or two of the reset, and asserting an
  // empty feed would be asserting that the world is quiet rather than that the
  // client invents nothing.
  await expect(attention(page).getByText("Chưa có gì cần chú ý.")).toBeVisible();
  await expect(rowsOfKind(page, "command-accepted")).toHaveCount(0);
  await expect(rowsOfKind(page, "build-finished")).toHaveCount(0);

  // A warehouse: 80 wood / 25 stone out of a fresh city's 500, and 8 seconds to
  // build, so both halves of one order land inside a single test.
  await page.getByRole("region", { name: "Thành phố & công trình" })
    .getByRole("button", { name: "Xây kho" }).click();

  const accepted = rowsOfKind(page, "command-accepted");
  await expect(accepted).toHaveCount(1);
  await expect(accepted).toContainText("Xây kho — máy chủ đã nhận.");
  // The chip is the kind's, not a literal chosen in the column, and the time is
  // machine-readable beside it.
  await expect(accepted.getByText("Đã xác nhận")).toBeVisible();
  await expect(accepted.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
  // A receipt has nowhere to send anyone: the order is in flight and the control
  // that issued it is already wearing its own chip. So this row is static text, not
  // a button that takes focus, answers Enter and does nothing.
  await expect(accepted.locator("button")).toHaveCount(0);
  await expect(accepted.locator(".activity-row__static")).toHaveCount(1);

  const finished = rowsOfKind(page, "build-finished");
  await expect(finished).toHaveCount(1, { timeout: 20_000 });
  await expect(finished).toContainText("Xây xong Nhà kho cấp 1");

  // The claim of this test. Four more snapshots arrive over the next eight seconds,
  // each diffed against the previous one; the queue is gone from all of them and
  // the level is reached in all of them, so a derivation keyed on "changed since
  // last tick" instead of on the fact's own id would add a row every time.
  await page.waitForTimeout(8000);
  await expect(finished).toHaveCount(1);
  await expect(accepted).toHaveCount(1);
});

test("a row that names a place is the way to it, and one that does not is not a control", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  await login(page, `Jump E2E ${testInfo.project.name} ${Date.now()}`);

  await page.getByRole("region", { name: "Thành phố & công trình" })
    .getByRole("button", { name: "Xây kho" }).click();
  const finished = rowsOfKind(page, "build-finished");
  await expect(finished).toHaveCount(1, { timeout: 20_000 });
  // Move the player somewhere else in the column first. `activePanel` starts at
  // "city", so a jump to the city panel from a standing start would prove nothing:
  // the nav would already be marking it.
  await page.getByRole("button", { name: "Vận tải", exact: true }).click();
  const cityNav = page.getByRole("button", { name: "Thành phố", exact: true });
  await expect(cityNav).not.toHaveAttribute("aria-current", "true");

  await finished.getByRole("button").click();
  // The column's nav marks where the player now is. Whether the panel *scrolled*
  // is not asserted here on purpose: at 1280x720 the whole column fits on screen,
  // so "in view" is true before the click as well and would pass for free.
  await expect(cityNav).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("region", { name: "Thành phố & công trình" })).toBeInViewport();

  // The band where the jump has real work to do. Below 1024px both columns are
  // flyouts over the map and the feed is the one covering it, so a row pointing at
  // the city panel has to open a column that is closed and close the column the
  // click came from. This is `openSurface` rather than `toggleSurface`, and getting
  // it wrong here means the row scrolls to a panel the player cannot see.
  await page.setViewportSize({ width: 900, height: 800 });
  const kingdom = page.getByRole("complementary", { name: "Bảng điều khiển" });
  const activity = page.getByRole("complementary", { name: "Dòng hoạt động" });
  await expect(kingdom).toBeHidden();
  await page.getByRole("button", { name: "Hoạt động", exact: true }).click();
  await expect(activity).toBeVisible();

  await feed(page).locator('[data-kind="build-finished"]').getByRole("button").click();
  await expect(kingdom).toBeVisible();
  await expect(activity).toBeHidden();
  await expect(page.getByRole("region", { name: "Thành phố & công trình" })).toBeInViewport();
});
