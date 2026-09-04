import { test, expect, type Page } from "@playwright/test";

// The tray's right half shipped as a label in an empty box, plus a `display: none`
// that hid even the label below 1024px — so on the one band where the kingdom
// column is a flyout over the map, the strip that sits under the map said nothing
// at all. `tray-groups.test.ts` pins which commands a selection produces; only a
// browser can say whether they fit.
//
// Two claims here that no unit test can make. The tray shares a grid row with the
// map, and the map's box is what Pixi sizes its canvas from, so a tray that grows
// a second row when commands appear silently resizes the renderer: the height is
// measured before and after. And a blocked command must be *disabled beside its
// reason* rather than hidden — hidden reads as a feature the game does not have.
const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/api/dev/reset`);
});

const trayHeight = async (page: Page): Promise<number> => {
  const box = await page.locator(".command-tray").boundingBox();
  expect(box, "the command tray is not on screen").not.toBeNull();
  return Math.round(box!.height);
};

const overflowX = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** The centre of the map container. The camera starts on the player's city, so
 *  this is that city's tile — and after a recruit, the army standing on it. */
async function mapCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("world-map").locator("canvas").boundingBox();
  expect(box, "the map canvas is not on screen").not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function login(page: Page, name: string) {
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(name);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await expect(page.locator(".command-tray")).toBeVisible();
  // Generous for the same reason `situation-room.spec.ts` is: the canvas only
  // exists once the pixi chunk has loaded and Chromium has handed out a WebGL
  // context, which is slow late in a full run and is not what this file claims.
  await expect(page.locator(".map canvas")).toBeVisible({ timeout: 15_000 });
}

test("selecting your own army fills the tray without changing its height", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized map interaction");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, `Tray E2E ${testInfo.project.name} ${Date.now()}`);
  const tray = page.getByRole("region", { name: "Lệnh cho lựa chọn" });
  const empty = await trayHeight(page);
  // Nothing selected is a group too, not an empty box: it says what to click.
  await expect(tray).toContainText("Chưa chọn gì");

  // --- An army to command. The barracks gates recruiting, so the enabled state of
  // the recruit button is the "it finished building" signal.
  const built = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await page.getByRole("button", { name: "Xây trại lính" }).click();
  expect((await built).ok()).toBeTruthy();
  const recruit = page.getByRole("button", { name: "Tuyển quân mới" });
  await expect(recruit).toBeEnabled({ timeout: 25_000 });
  await recruit.click();
  const recruitModal = page.getByRole("dialog", { name: "Tuyển quân" });
  await recruitModal.getByRole("radio", { name: /^Bộ binh/ }).check();
  const recruited = page.waitForResponse(response => response.url().endsWith("/api/commands/recruit"));
  await recruitModal.getByRole("button", { name: /^Tuyển 10/ }).click();
  expect((await recruited).ok()).toBeTruthy();
  await expect(page.getByTestId("army-row").first()).toContainText("Bộ binh · 10");

  // --- Click it on the map: the subject and the commands for it, in one strip ---
  const centre = await mapCentre(page);
  await page.mouse.click(centre.x, centre.y);
  await expect(tray).toContainText("Bộ binh · 10");
  await expect(tray.getByRole("group", { name: "Lệnh quân đội" })).toBeVisible();
  for (const label of ["Di chuyển", "Tấn công", "Hợp nhất", "Hủy lệnh"]) {
    await expect(tray.getByRole("button", { name: label, exact: true }), `no "${label}" command`).toBeVisible();
  }
  expect(await trayHeight(page), "the tray grew when commands appeared").toBe(empty);
  expect(await overflowX(page), "the tray started horizontal page scrolling").toBeLessThanOrEqual(0);

  // --- The law: a command the player cannot run is greyed beside its sentence ---
  // A single army has nobody to merge with and no order to cancel, so both of those
  // are blocked here, and blocked has to mean visible-and-explained. Counting the
  // reasons rather than reading one is the stronger claim: the primitive wraps a
  // button in `.kom-btn-gate` only when it is disabled *and* carries a reason, so
  // one gate per disabled button means none of them went dark without saying why.
  await expect(tray.getByRole("button", { name: "Hủy lệnh", exact: true })).toBeDisabled();
  await expect(tray.getByRole("button", { name: "Hợp nhất", exact: true })).toBeDisabled();
  const blocked = await tray.locator("button:disabled").count();
  expect(blocked, "a lone army can neither merge nor cancel an order").toBeGreaterThanOrEqual(2);
  expect(await tray.locator(".kom-btn-gate .kom-btn-reason").count(), "a disabled command with no reason beside it")
    .toBe(blocked);
  for (const reason of await tray.locator(".kom-btn-reason").all()) await expect(reason).not.toBeEmpty();

  // --- Selecting on the map moves the kingdom nav to the panel that commands it ---
  const nav = page.getByRole("navigation", { name: "Điều hướng" });
  await expect(nav.getByRole("button", { name: "Quân đội", exact: true })).toHaveAttribute("aria-current", "true");

  // --- Mid-order the tray is one button and a sentence, and still one row high ---
  await tray.getByRole("button", { name: "Di chuyển", exact: true }).click();
  await expect(tray).toContainText("Nhấp vào bản đồ");
  expect(await trayHeight(page), "the order hint took the tray onto a second row").toBe(empty);
  await tray.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(tray.getByRole("group", { name: "Lệnh quân đội" })).toBeVisible();
});

test("the compact band gets the commands too, and they open the closed column", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized map interaction");
  // 900px is the band the reserved slot used to be `display: none` in — both
  // columns are flyouts here and both start closed, so the tray is the only thing
  // on screen that can say where a city's controls went.
  await page.setViewportSize({ width: 900, height: 800 });
  await login(page, `Tray Compact ${testInfo.project.name} ${Date.now()}`);
  const tray = page.getByRole("region", { name: "Lệnh cho lựa chọn" });
  const kingdom = page.locator(".kingdom-column");
  await expect(kingdom).toBeHidden();
  const empty = await trayHeight(page);

  const centre = await mapCentre(page);
  await page.mouse.click(centre.x, centre.y);
  const group = tray.getByRole("group", { name: "Thành phố của bạn" });
  await expect(group, "the commands are hidden in the compact band again").toBeVisible();
  expect(await trayHeight(page), "the tray grew when commands appeared").toBe(empty);
  expect(await overflowX(page), "the commands started horizontal page scrolling").toBeLessThanOrEqual(0);

  // The whole point of the group: the panel it names is behind a closed flyout, and
  // pressing the command opens it rather than leaving the player to find the toggle.
  await group.getByRole("button", { name: "Mở bảng Thành phố" }).click();
  await expect(kingdom).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Điều hướng" })
    .getByRole("button", { name: "Thành phố", exact: true })).toHaveAttribute("aria-current", "true");
});
