import { test, expect, type Page } from "@playwright/test";

// The notice layer, end to end. Everything here runs on the auth screen and never
// creates a player: a dev login with an empty name is refused with 400
// `INVALID_DEV_ACCOUNT`, and `ApiError` already carries the Vietnamese sentence for
// it, so one click produces a real notice with no world state, no Pixi and no
// `/api/dev/reset`.
//
// Three laws, and each one is a bug that shipped:
//  1. A notice can be dismissed. The old dismiss was `onClick` on the toast `<div>`
//     — dead in both directions, because the sheet says `pointer-events: none` and a
//     `<div>` is never in the tab order.
//  2. It can be dismissed without a mouse. The button alone does not give that: a
//     toast lives four seconds and tabbing to it from wherever focus is takes
//     longer, so Escape clears the stack.
//  3. Its body eats no clicks. A notice about one command must not block the
//     control that issues the next, which is why the layer is transparent to
//     hit-testing and only the dismiss button takes pointers back.
const message = "Tên hoặc phe không hợp lệ.";

/** A refused dev login. The name field is cleared rather than left at its default,
 *  and asked for by its label — the label is what UI-7 added, and a placeholder is
 *  not a name once the player has typed. */
async function raiseNotice(page: Page): Promise<void> {
  const name = page.getByLabel("Tên người chơi");
  await name.fill("");
  await page.getByRole("button", { name: "Vào kingdom" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kingdoms of Meridian" })).toBeVisible();
});

test("a notice is dismissable by mouse and by keyboard, and says what went wrong", async ({ page }) => {
  const toast = page.locator(".toast");
  await raiseNotice(page);
  // The sentence, not a code: `ApiError` wraps `errorMessage(code)`, so a raw
  // `INVALID_DEV_ACCOUNT` reaching the player would fail here.
  await expect(toast).toHaveText(new RegExp(message.replace(/\./g, "\\.")));
  await page.getByRole("button", { name: "Đóng thông báo" }).click();
  await expect(toast).toHaveCount(0);

  // Same notice, no mouse. Focus is still on the submit button, i.e. nowhere near
  // the layer, which is the situation Escape exists for.
  await raiseNotice(page);
  await expect(toast).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(toast).toHaveCount(0);
});

test("the body of a notice lets a click through, and only its button catches one", async ({ page }) => {
  await raiseNotice(page);
  const toast = page.locator(".toast");
  await expect(toast).toHaveCount(1);
  const body = await toast.locator(".toast__text").boundingBox();
  const close = await toast.getByRole("button", { name: "Đóng thông báo" }).boundingBox();
  expect(body, "the notice must be on screen to be hit-tested").toBeTruthy();
  expect(close).toBeTruthy();

  // What the browser would hand a click at each point. The text of the notice must
  // not be the answer anywhere except on the button — `pointer-events: none` on the
  // layer is what makes the notice sit over the HUD without taking it hostage.
  const hits = await page.evaluate(([over, onClose]) => {
    const at = (point: { x: number; y: number }) => document.elementFromPoint(point.x, point.y);
    const named = (element: Element | null) => (element?.closest(".toast") ? "toast" : element?.tagName.toLowerCase() ?? "none");
    return {
      body: named(at(over)),
      close: named(at(onClose)),
      closeIsButton: Boolean(at(onClose)?.closest("button")),
    };
  }, [
    { x: body!.x + body!.width / 2, y: body!.y + body!.height / 2 },
    { x: close!.x + close!.width / 2, y: close!.y + close!.height / 2 },
  ] as const);
  expect(hits.body, "a click on the notice's text must reach whatever is under it").not.toBe("toast");
  expect(hits.close).toBe("toast");
  expect(hits.closeIsButton, "the dismiss button must be the one thing that catches a pointer").toBe(true);

  // And behaviourally: clicking the body is not a dismiss, so a notice cannot be
  // wiped by a click aimed at the control underneath it.
  await page.mouse.click(body!.x + body!.width / 2, body!.y + body!.height / 2);
  await expect(page.locator(".toast")).toHaveCount(1);
});

test("two notices stack instead of printing the second one on top of the first", async ({ page }) => {
  // Every toast used to be `position: fixed` at the same corner, so a second notice
  // landed on the first and the first was never read. They share a flex column now.
  // Two clicks on one cleared field, because a notice lives four seconds and
  // re-typing between them would spend that budget.
  await page.getByLabel("Tên người chơi").fill("");
  const submit = page.getByRole("button", { name: "Vào kingdom" });
  await submit.click();
  await submit.click();
  const toasts = page.locator(".toast");
  await expect(toasts).toHaveCount(2);
  const first = await toasts.nth(0).boundingBox();
  const second = await toasts.nth(1).boundingBox();
  expect(first!.y + first!.height).toBeLessThanOrEqual(second!.y);
  // Both inside the viewport: a stack that grows off the bottom of the screen is the
  // same bug wearing a different rule.
  const height = page.viewportSize()!.height;
  expect(first!.y).toBeGreaterThanOrEqual(0);
  expect(second!.y + second!.height).toBeLessThanOrEqual(height);
});
