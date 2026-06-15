import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-1468: The command palette stacks above the References panel.
 *
 * Regression guard for #1468 — the shadcn `Dialog` primitive sat at a lower
 * z-index than the legacy `.reference-panel-overlay`, so opening the command
 * palette while the References panel was open drew the palette *behind* the
 * panel's dimming layer. The fix is the documented z-index token scale
 * (`--z-*` in `app.css`); this test verifies the resulting stacking order.
 *
 * The check is geometry-derived: it picks a point inside the palette that
 * also overlaps the References panel and asserts the palette is the topmost
 * element there. If the two surfaces ever stop overlapping, `overlapsPanel`
 * fails loudly so the test point is never silently meaningless.
 */
test.describe("AT-1468 Command palette z-index", () => {
  test("renders the command palette above the open References panel", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();

    // Open the References panel (now itself a shadcn Dialog, #1548 — keyed by
    // the `.reference-dialog` class to tell it apart from the palette dialog).
    await page.getByRole("button", { name: "Open reference" }).click();
    await expect(page.locator(".reference-dialog")).toBeVisible();

    // Open the command palette while the panel is still open.
    await page.keyboard.press("Control+Shift+P");
    const search = page.getByRole("combobox", { name: "Search commands" });
    await expect(search).toBeVisible();

    // The palette must win the stacking order over the References panel.
    const stacking = await page.evaluate(() => {
      const panel = document.querySelector(".reference-dialog") as HTMLElement | null;
      // The palette is the other dialog — the one holding the search combobox.
      const palette = Array.from(document.querySelectorAll('[role="dialog"]')).find(
        (d) => d !== panel && d.querySelector('[role="combobox"]'),
      ) as HTMLElement | null;
      if (!palette || !panel) return { ready: false } as const;

      const pr = palette.getBoundingClientRect();
      const nr = panel.getBoundingClientRect();
      // A point near the palette's right edge — the region that overlaps the
      // right-anchored References panel.
      const x = pr.right - 8;
      const y = pr.top + 8;
      const top = document.elementFromPoint(x, y);

      return {
        ready: true,
        overlapsPanel: x >= nr.left && x <= nr.right,
        topIsPalette: top != null && palette.contains(top),
      } as const;
    });

    expect(stacking.ready).toBe(true);
    expect(stacking.overlapsPanel).toBe(true);
    expect(stacking.topIsPalette).toBe(true);
  });
});
