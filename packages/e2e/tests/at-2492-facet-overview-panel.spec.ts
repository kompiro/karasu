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
});
