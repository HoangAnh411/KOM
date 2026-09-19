import { test, expect } from "@playwright/test";
import { gameRules, regionAt, regions, regionTileCounts } from "@kingdoms/shared";

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
  // Login and the two drawer opens under SwiftShader, then the march (three tiles,
  // a tick each), then capture — which is not arrival: the seat must be *held* for
  // `captureDurationMs` before the province flips, and the row lands on the next
  // snapshot after that — then six seconds of standing still to prove the row does
  // not multiply, and the Claims 2–3 sweeps. The 30s standing time is why the
  // expect below and this timeout both read the rule instead of a number that
  // would silently rot the next time the rule changes.
  test.setTimeout(150_000);
  // The wide band, and not for coverage: at 1440 both columns are tracks from the start,
  // so `focusCity` centres the city in the canvas the map is finally going to have.
  // Opening a column later shrinks the map, and the camera compensates for the origin
  // shift instead of re-centring — which would leave the city half a column off centre
  // and every click below off by the same amount.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByPlaceholder("Tên người chơi").fill(`Territory E2E ${testInfo.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Vào kingdom" }).click();
  await page.getByRole("button", { name: "Vương quốc", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Bảng điều khiển" })).toBeVisible();
  await page.getByRole("button", { name: "Nhiệm vụ", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Dòng hoạt động" })).toBeVisible();

  // --- Provision a composition army for this territory scenario. The existing
  // campaign coverage owns train → reserve → create; this file should stay about
  // territory selection, movement, activity and navigation. ---
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kingdoms-session")!) as { token: string });
  const provisioned = await request.post(`${api}/api/dev/army-v2`, { headers: { authorization: `Bearer ${session.token}` } });
  expect(provisioned.ok()).toBeTruthy();

  // Where we are, and which seat is nearest: asked of the server and of the authored
  // world, never written down here. Placement is deterministic but it is also the thing
  // M-4 changed, and a spec that pinned (12,2) would fail for the wrong reason.
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
    const dx = x - city.x;
    const dy = y - city.y;
    const pixelsPerWorldUnit = 0.075 * box.height / 55;
    const screenRight = (dx - dy) * 6 / Math.sqrt(2) * pixelsPerWorldUnit;
    const screenDown = (dx + dy) * 6 * (1.08 / Math.sqrt(2)) * pixelsPerWorldUnit;
    return [centerX + screenRight, centerY + screenDown];
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
  await expect(tray).toContainText("Bộ binh · 10");
  await tray.locator('[data-command="move"]').click();
  const moved = page.waitForResponse(response => response.url().endsWith("/api/commands/move-army"));
  await page.mouse.click(...at(seat.seatX, seat.seatY));
  const order = await (await moved).json() as { result: string; snapshot: { armies: { ownerPlayerId?: string | null; targetX?: number; targetY?: number }[] } };
  expect(order.result).toBe("accepted");
  const ordered = order.snapshot.armies.find(army => army.ownerPlayerId === player.id)!;
  expect([ordered.targetX, ordered.targetY]).toEqual([seat.seatX, seat.seatY]);

  const feed = page.getByRole("region", { name: "Hoạt động gần đây" });
  const captured = feed.locator('[data-kind="region-captured"]');
  // The order returns the moment the army starts walking, not when the province is
  // taken: march (a tick per tile) + `captureDurationMs` of standing on the seat +
  // one snapshot push all happen after it. A flat 30s missed the row by three
  // seconds every run once capture gained its standing time.
  await expect(captured).toHaveCount(1, { timeout: gameRules.territory.captureDurationMs + 25_000 });
  // The name and the size, because the size is what the 300 territory points are made
  // of — and never the province code, which is an authoring detail of two char grids.
  await expect(captured).toContainText(`Đã kiểm soát ${seat.name} — ${tileCounts[seat.code]} ô.`);
  expect(await captured.textContent()).not.toContain(`${seat.code} `);

  // Claim 1. Six more snapshots arrive while the army stands still, and the province is
  // ours in every one of them.
  await page.waitForTimeout(6000);
  await expect(captured).toHaveCount(1);

  // --- Claim 2. Any tile of the province, not just the seat, names its holder. The
  // seat itself is no good for this: our own army is standing on it and wins the
  // pick. Its neighbours are no better: the entity pick takes any army marker within
  // ~50px (six to ten tiles) of the click, and with WORLD_EVENT_SPAWN_CHANCE=1 a
  // migration mob can park that close. Waiting it out is not a recovery — mobs act
  // every 10s and only when a player army is within 3 tiles, so one dormant by the
  // seat is a permanent squatter. A tile of the province's interior, clear of every
  // seat, city and army on the live snapshot, can only ever be picked as ground. ---
  const held = `Vùng ${seat.name} · bạn đang giữ`;
  const liveSnapshot = async () => {
    const live = await request.get(`${api}/api/bootstrap`, { headers: { authorization: `Bearer ${session.token}` } });
    expect(live.ok()).toBeTruthy();
    return await live.json() as { snapshot: { armies: { x: number; y: number }[]; cities: { x: number; y: number }[] } };
  };
  const clearTile = (snapshot: { armies: { x: number; y: number }[]; cities: { x: number; y: number }[] }) => {
    const clear = (x: number, y: number) =>
      regions.every(region => Math.abs(x - region.seatX) + Math.abs(y - region.seatY) > 16)
      && snapshot.cities.every(city => Math.abs(x - city.x) + Math.abs(y - city.y) > 16)
      && snapshot.armies.every(army => Math.abs(x - army.x) + Math.abs(y - army.y) > 12);
    // Closest clear tile to the seat: still "a tile of the province", and as deep in
    // it as the squatters allow. Terrain relief is ±2.5 world units, so the flat
    // projection below lands within a few pixels of the tile the renderer picks.
    return [...Array(65 * 65).keys()].map(index => ({ x: seat.seatX - 32 + index % 65, y: seat.seatY - 32 + Math.floor(index / 65) }))
      .filter(({ x, y }) => x >= 0 && y >= 0 && x < 256 && y < 256 && regionAt(x, y)?.code === seat.code && clear(x, y))
      .sort((a, b) => (Math.abs(a.x - seat.seatX) + Math.abs(a.y - seat.seatY)) - (Math.abs(b.x - seat.seatX) + Math.abs(b.y - seat.seatY)))[0];
  };
  let target = clearTile((await liveSnapshot()).snapshot);
  expect(target, "a click-safe tile of the province exists").toBeDefined();
  await expect.poll(async () => {
    await page.mouse.click(...at(target!.x, target!.y));
    const text = await subject.textContent();
    // A migration event can land on the chosen tile after it was chosen; re-derive
    // the tile from a fresh snapshot instead of clicking into the squatter until
    // the timeout. The refetch only happens on a mismatch, so the good path costs
    // one read against the 60/min bucket.
    if (!text?.includes(held)) {
      const next = clearTile((await liveSnapshot()).snapshot);
      if (next) target = next;
    }
    return text;
  }, { timeout: 15_000 }).toContain(held);

  // --- Claim 3. Move off the army panel first: a jump that lands where the player
  // already was would pass for free. ---
  const armyNav = page.getByRole("button", { name: "Quân đội", exact: true });
  await page.getByRole("button", { name: "Vận tải", exact: true }).click();
  await expect(armyNav).not.toHaveAttribute("aria-current", "true");
  await captured.getByRole("button").click();
  await expect(armyNav).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("region", { name: "Quân đội" })).toBeInViewport();
});
