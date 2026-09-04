import { test, expect } from "@playwright/test";
import { gameRules, regionAt, regions, regionTileCounts } from "@kingdoms/shared";
import { worldPoint } from "../apps/client/src/map-geometry.js";

const api = process.env.PLAYWRIGHT_API ?? "http://127.0.0.1:3000";
// Fresh world per file: the placement cap would 500 later logins in a shared world.
test.beforeEach(async ({ request }) => { await request.post(`${api}/api/dev/reset`); });

// Holding a province is a server rule (`territory.ts`, pure, tested) and a feed
// derivation (`activity.ts`, pure, tested). Three claims are left over that only a
// browser against a live snapshot stream can make:
//
//   1. The row survives the stream. Control is recomputed every tick from where the
//      armies stand, so the fact "we hold Thượng Nguyên" is true in every snapshot from
//      the moment the army arrives. A feed keyed on "changed since the last snapshot"
//      rather than on the fact's own id would add a row a second for as long as the
//      army stays put — the same bug the build receipts were written against.
//   2. The client resolves the province by itself. The wire carries province code →
//      holder id and nothing else; the name, the seat and the tile count are read from
//      `world-map.ts` on the client. Every pure test on both sides would still pass if
//      that lookup pointed at the wrong world, and `worldMapDigest` is what would
//      report it — so the thing to check here is that the sentence a player reads comes
//      out with a name and a size in it.
//   3. The row leads somewhere. A province changing hands is news about an army, so it
//      points at the panel that commands one.
const tileCounts = regionTileCounts();

test("standing on a seat takes the province, and the feed says so once", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-sized HUD interaction");
  // Barracks (~15s), recruit, march, the tick that recomputes control, then six seconds
  // of standing still to prove the row does not multiply.
  test.setTimeout(90_000);
  // The wide band, and not for coverage: at 1440 both columns are tracks from the start,
  // so `focusCity` centres the city in the canvas the map is finally going to have.
  // Opening a column later shrinks the map, and the camera compensates for the origin
  // shift instead of re-centring — which would leave the city half a column off centre
  // and every click below off by the same amount.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Territory E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Dòng hoạt động" })).toBeVisible();

  // --- An army of our own. Cavalry covers two tiles a tick, so the march is a tick or
  // two rather than three or four. ---
  const barracks = page.waitForResponse(response => response.url().endsWith("/api/commands/build"));
  await page.getByRole("button", { name: "Xây trại lính" }).click();
  expect((await barracks).ok()).toBeTruthy();
  await expect(page.getByText("Hàng đợi xây: 0/2")).toBeVisible({ timeout: 25000 });
  await page.getByRole("button", { name: "Tuyển quân mới" }).click();
  const recruitModal = page.getByRole("dialog", { name: "Tuyển quân" });
  await recruitModal.getByRole("radio", { name: /^Kỵ binh/ }).check();
  const recruited = page.waitForResponse(response => response.url().endsWith("/api/commands/recruit"));
  await recruitModal.getByRole("button", { name: /^Tuyển 10/ }).click();
  expect((await recruited).ok()).toBeTruthy();

  // Where we are, and which seat is nearest: asked of the server and of the authored
  // world, never written down here. Placement is deterministic but it is also the thing
  // M-4 changed, and a spec that pinned (12,2) would fail for the wrong reason.
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kingdoms-session")!) as { token: string });
  const bootstrap = await request.get(`${api}/api/bootstrap`, { headers: { authorization: `Bearer ${session.token}` } });
  expect(bootstrap.ok()).toBeTruthy();
  const { player, snapshot } = await bootstrap.json() as {
    player: { id: string };
    snapshot: { cities: { playerId: string; x: number; y: number }[] };
  };
  const city = snapshot.cities.find(item => item.playerId === player.id)!;
  const distance = (x: number, y: number) => Math.abs(x - city.x) + Math.abs(y - city.y);
  const seat = [...regions].sort((a, b) => distance(a.seatX, a.seatY) - distance(b.seatX, b.seatY))[0]!;

  const canvas = page.getByTestId("world-map").locator("canvas");
  const box = (await canvas.boundingBox())!;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  /** Screen point of a tile. The projection is affine, so the offset of a tile from the
   *  focused city is the projection of the grid delta — the renderer's own arithmetic,
   *  imported from it rather than restated as 56 and 28. */
  const at = (x: number, y: number): [number, number] => {
    const [dx, dy] = worldPoint(x - city.x, y - city.y);
    return [centerX + dx, centerY + dy];
  };

  // --- The seat before anyone holds it. One tile in eighty decides a province, and
  // until M-6 this one read "Tiến quân tới đây" — the sentence for bare dirt. ---
  const tray = page.getByRole("region", { name: "Lệnh cho lựa chọn" });
  const subject = tray.locator(".command-tray__detail");
  await page.mouse.click(...at(seat.seatX, seat.seatY));
  await expect(tray.getByRole("group", { name: `Ô lỵ sở ${seat.name}` })).toBeVisible();
  await expect(tray).toContainText(`Đóng quân trong ${gameRules.territory.captureRadius} ô`);
  await expect(subject).toContainText(`Vùng ${seat.name} · chưa ai giữ`);

  // --- Take it: select the army standing on the city, then march it onto the seat ---
  await page.mouse.click(centerX, centerY);
  await expect(tray).toContainText("Kỵ binh · 10");
  await tray.locator('[data-command="move"]').click();
  const moved = page.waitForResponse(response => response.url().endsWith("/api/commands/move-army"));
  await page.mouse.click(...at(seat.seatX, seat.seatY));
  const order = await (await moved).json() as { result: string; snapshot: { armies: { ownerPlayerId?: string | null; targetX?: number; targetY?: number }[] } };
  expect(order.result).toBe("accepted");
  const ordered = order.snapshot.armies.find(army => army.ownerPlayerId === player.id)!;
  expect([ordered.targetX, ordered.targetY]).toEqual([seat.seatX, seat.seatY]);

  const feed = page.getByRole("region", { name: "Hoạt động gần đây" });
  const captured = feed.locator('[data-kind="region-captured"]');
  await expect(captured).toHaveCount(1, { timeout: 30_000 });
  // The name and the size, because the size is what the 300 territory points are made
  // of — and never the province code, which is an authoring detail of two char grids.
  await expect(captured).toContainText(`Đã kiểm soát ${seat.name} — ${tileCounts[seat.code]} ô.`);
  expect(await captured.textContent()).not.toContain(`${seat.code} `);

  // Claim 1. Six more snapshots arrive while the army stands still, and the province is
  // ours in every one of them.
  await page.waitForTimeout(6000);
  await expect(captured).toHaveCount(1);

  // --- Claim 2. Any tile of the province, not just the seat, now names its holder. The
  // seat itself is no good for this: our own army is standing on it and wins the pick. ---
  const inside = ([[seat.seatX + 1, seat.seatY], [seat.seatX - 1, seat.seatY], [seat.seatX, seat.seatY + 1], [seat.seatX, seat.seatY - 1]] as const)
    .find(([x, y]) => regionAt(x, y)?.code === seat.code && !(x === city.x && y === city.y))!;
  // Re-clicked on every poll: the suite runs with WORLD_EVENT_SPAWN_CHANCE=1, so mobs
  // are wandering and one parked on the tile would win the pick instead. They move every
  // tick, which is why polling gets the tile back rather than waiting for nothing.
  await expect.poll(async () => {
    await page.mouse.click(...at(inside[0], inside[1]));
    return await subject.textContent();
  }, { timeout: 15_000 }).toContain(`Vùng ${seat.name} · bạn đang giữ`);

  // --- Claim 3. Move off the army panel first: a jump that lands where the player
  // already was would pass for free. ---
  const armyNav = page.getByRole("button", { name: "Quân đội", exact: true });
  await page.getByRole("button", { name: "Vận tải", exact: true }).click();
  await expect(armyNav).not.toHaveAttribute("aria-current", "true");
  await captured.getByRole("button").click();
  await expect(armyNav).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("region", { name: "Quân đội" })).toBeInViewport();
});
