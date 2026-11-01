import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";

/**
 * AT-2492: the facet membership panel (#2177) opens below the preview toolbar,
 * not over it. The unit tests pin the published CSS variable and the panel's
 * `top` rule (`PreviewColumn.test.tsx`, `FacetSelector.test.tsx`); the overlap
 * itself is a layout fact, so this spec measures it in a real browser, where
 * the tab bar above the toolbar has a height.
 *
 * Coverage map (test name → AT bullet):
 *  - "Membership overview opens below the toolbar, lists each facet's members and closes" → AC-3
 *  - "The panel sits above the diagram and below the toolbar's menus" → AC-4
 */

const KRS = `facet pii { label "Personal data" }
facet pci { label "Card data" }

system Shop {
  service Accounts { facets pii }
  service Billing { facets pci, pii }
  service Catalog {}

  Accounts -> Billing "charges"
}
`;

test.describe("AT-2492 facet overview panel", () => {
  test("Membership overview opens below the toolbar, lists each facet's members and closes", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, KRS);

    await page.getByRole("button", { name: /Facets/ }).click();
    await page.getByRole("menuitem", { name: /Membership overview/ }).click();

    const panel = page.getByRole("dialog", { name: "Facet membership" });
    await expect(panel).toBeVisible();

    // Each facet lists its members; Billing is in both.
    const entries = panel.locator(".facet-overview-entry");
    await expect(entries).toHaveCount(2);
    const pii = entries.filter({ hasText: "Personal data" });
    const pci = entries.filter({ hasText: "Card data" });
    await expect(pii.locator(".facet-overview-member-name")).toHaveText(["Accounts", "Billing"]);
    await expect(pci.locator(".facet-overview-member-name")).toHaveText(["Billing"]);

    // The panel starts at or below the toolbar's bottom edge, so it covers none
    // of the toolbar's buttons (the 28px overlap of #2492).
    const toolbar = await page.locator(".preview-toolbar").boundingBox();
    const box = await panel.boundingBox();
    expect(toolbar).not.toBeNull();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);

    await panel.getByRole("button", { name: "Close the facet overview" }).click();
    await expect(panel).toHaveCount(0);
  });

  // TPL-1468 (4): the stacking order is a computed fact, so it is read back with
  // `elementFromPoint` rather than from the panel's `z-index` rule.
  test("The panel sits above the diagram and below the toolbar's menus", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS);

    await page.getByRole("button", { name: /Facets/ }).click();
    await page.getByRole("menuitem", { name: /Membership overview/ }).click();
    const panel = page.getByRole("dialog", { name: "Facet membership" });
    await expect(panel).toBeVisible();

    const topmostIsInside = (selector: string, x: number, y: number) =>
      page.evaluate(
        ([sel, px, py]) => {
          // A modal Radix menu sets `pointer-events: none` on <body> while it is
          // open, which drops the panel out of hit testing whatever its
          // z-index. Lift it for the probe so the paint order decides.
          const body = document.body.style;
          const saved = body.pointerEvents;
          body.pointerEvents = "auto";
          const hit = document.elementFromPoint(px as number, py as number);
          body.pointerEvents = saved;
          return hit?.closest(sel as string) != null;
        },
        [selector, x, y] as const,
      );

    // Above the diagram: the panel floats over the preview, so its centre is its own.
    const box = (await panel.boundingBox())!;
    expect(
      await topmostIsInside(".facet-overview-panel", box.x + box.width / 2, box.y + box.height / 2),
    ).toBe(true);

    // Below portalled menus: the toolbar's Docs menu drops down over the panel's
    // top edge, and the menu wins where the two overlap.
    await page.getByRole("button", { name: "Documentation links" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const m = (await menu.boundingBox())!;
    const left = Math.max(m.x, box.x);
    const right = Math.min(m.x + m.width, box.x + box.width);
    const top = Math.max(m.y, box.y);
    const bottom = Math.min(m.y + m.height, box.y + box.height);
    expect(right).toBeGreaterThan(left);
    expect(bottom).toBeGreaterThan(top);
    expect(await topmostIsInside("[role='menu']", (left + right) / 2, (top + bottom) / 2)).toBe(
      true,
    );
  });
});
