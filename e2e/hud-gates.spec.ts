import { test, expect, type Locator, type Page } from "@playwright/test";

// The two rules UI-3 put on every control in the kingdom column, end to end.
//
// 1. A control the player cannot use is disabled *and* carries the sentence
//    saying why, and the click it refuses never becomes an HTTP request. Before
//    this pass `CityPanel` let every build through and used the server's 400 as
//    the answer, so "I cannot afford this" arrived as `insufficient_resources`
//    in a red toast after the order was already committed.
// 2. The state of an order is shown beside the control that issued it. The strip
//    at the foot of the column is below the fold at 288px and closed entirely in
//    the compact band, so it cannot be the only answer to "did my click land".
const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";

// Fresh world per file: the ~16-city placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

const cityPanel = (page: Page) => page.getByRole("region", { name: "Thành phố & công trình" });

async function login(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(name);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();
}

/** The element a gated button points at with `aria-describedby`. Asserting the
 *  reason through the wiring rather than by searching the page for the sentence
 *  is the difference between "the reason is on screen somewhere" and "this
 *  button is the one that carries it". */
async function reasonOf(page: Page, button: Locator): Promise<Locator> {
  const id = await button.getAttribute("aria-describedby");
  expect(id, "a disabled button must point at the reason it is disabled").toBeTruthy();
  // Attribute selector, not `#id`: React's `useId` emits colons, which are not
  // valid in a CSS id selector without escaping.
  return page.locator(`[id="${id}"]`);
}

test("a build the city cannot pay for is gated with its reason and sends nothing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");

  // POSTs only: the API is a different origin from the dev server, so a CORS
  // preflight to the same path would otherwise be counted as an order.
  const builds: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.url().endsWith("/api/commands/build")) builds.push(request.url());
  });

  await login(page, `Gate E2E ${testInfo.project.name} ${Date.now()}`);
  const city = cityPanel(page);
  const depot = city.getByRole("button", { name: "Xây trạm trung chuyển" });
  const warehouse = city.getByRole("button", { name: "Xây kho" });

  // A fresh city holds 500 wood / 500 stone / 500 iron and every building is
  // affordable, so the stockpile has to be spent down through real commands —
  // there is no dev endpoint that sets resources.
  await city.getByRole("button", { name: "Xây trại lính" }).click();   // barracks: 150 wood, 100 stone, 50 iron
  await depot.click();                                                 // road_depot: 120 wood, 80 stone, 20 iron
  await expect(page.getByText("Hàng đợi xây: 2/2")).toBeVisible({ timeout: 10000 });

  // 230 wood left, so the city can pay for a warehouse — and is still refused,
  // because the queue is full. Which reason shows is the assertion: a control
  // states the condition the player should act on first, not every condition.
  await expect(warehouse).toBeDisabled();
  await expect(await reasonOf(page, warehouse)).toContainText("Hàng đợi xây đang đầy (2/2)");

  // Barracks is the slower of the two (15s).
  await expect(page.getByText("Hàng đợi xây: 0/2")).toBeVisible({ timeout: 25000 });

  // A second barracks — the cost is flat per level — takes wood to 80: under the
  // 120 a supply depot needs, over the 80 a warehouse needs. One shortcut closes
  // and the one beside it stays open, which is what makes this a gate on the
  // building's own price rather than a blanket freeze on the panel.
  await city.getByRole("button", { name: "Xây trại lính" }).click();
  await expect(page.getByText("Hàng đợi xây: 1/2")).toBeVisible({ timeout: 10000 });
  await expect(depot).toBeDisabled();
  const reason = await reasonOf(page, depot);
  await expect(reason).toContainText("Không đủ Gỗ");
  // And it says what the thing costs, so the player knows how short they are
  // instead of only that they are short.
  await expect(reason).toContainText("120 Gỗ");
  await expect(warehouse).toBeEnabled();
  expect(await warehouse.getAttribute("aria-describedby"), "an open control describes nothing").toBeNull();

  // The point of the gate: the refused click stays in the client. A real click on
  // a disabled button fires no `click` event at all, so the handler never runs and
  // no request goes out — `force` is here to skip Playwright's own actionability
  // wait, not to fake the event.
  const sent = builds.length;
  expect(sent).toBe(3);
  await depot.click({ force: true });
  await page.waitForTimeout(700); // a client that let the click through would have sent by now
  expect(builds).toHaveLength(sent);
});

test("the chip for an order sits beside the control that issued it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  await login(page, `Chip E2E ${testInfo.project.name} ${Date.now()}`);

  // Hold the response open: on a local server the command settles in single-digit
  // milliseconds, and a chip that is correct but invisible for 4ms is not evidence.
  await page.route("**/api/commands/build", async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue();
  });

  const city = cityPanel(page);
  // Scoped to the one shortcut's own row: "a chip exists on the page" was already
  // true before this pass — the strip at the foot of the column is full of them.
  const row = city.locator(".city-action").filter({ has: page.getByRole("button", { name: "Xây kho" }) });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Đang gửi")).toHaveCount(0);
  await row.getByRole("button", { name: "Xây kho" }).click();
  await expect(row.getByText("Đang gửi")).toBeVisible();

  // The row a different building's shortcut owns stays quiet: `pendingFor` matches
  // on the command body, so one build in flight lights one control.
  const other = city.locator(".city-action").filter({ has: page.getByRole("button", { name: "Xây trại lính" }) });
  await expect(other.getByText("Đang gửi")).toHaveCount(0);

  // Settled means gone: a chip that outlives its command turns into a permanent
  // "in flight" badge on a control that is idle.
  await expect(page.getByText("Hàng đợi xây: 1/2")).toBeVisible({ timeout: 10000 });
  await expect(row.getByText("Đang gửi")).toHaveCount(0);
});
