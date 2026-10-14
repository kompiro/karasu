import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { nodeLocator } from "../fixtures/drill.js";

/**
 * AT-2174: the facet overlay, driven from the preview toolbar. The renderer
 * side (rings, dimming, legend, every surface) and the selector component are
 * unit-tested (`facet-overlay.test.ts`, `FacetSelector.test.tsx`,
 * `useSystemView.test.tsx`); this spec walks the toolbar → recompile → SVG
 * round trip in a real browser, both ways (TPL-1402).
 *
 * Coverage map (test name → AT bullet):
 *  - "picking facets checks them, counts them on the button and rings their members; clearing them restores the picture" → AT-V
 */

const KRS = `facet pii { label "Personal data" }
facet pci { label "Card data" }

system Shop {
  service Accounts { facets pii }
  service Billing { facets pci }
  service Catalog {}

  Accounts -> Billing "charges"
  Catalog -> Accounts "looks up"
}
`;

test.describe("AT-2174 facet overlay from the preview toolbar", () => {
  test("picking facets checks them, counts them on the button and rings their members; clearing them restores the picture (AT-V)", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, KRS);

    const button = page.getByRole("button", { name: /Facets/ });
    await expect(button).toHaveText("◎ Facets");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    // Nothing selected: the overlay leaves no marker of its own (AT-A).
    await expect(page.locator(".preview-container svg [data-facet-ring]")).toHaveCount(0);

    const pii = page.getByRole("menuitemcheckbox", { name: /Personal data/ });
    const pci = page.getByRole("menuitemcheckbox", { name: /Card data/ });
    // While the menu is open Radix hides the rest of the page from the
    // accessibility tree, so the button is read after each Escape.
    await button.click();
    await expect(pii).toHaveAttribute("aria-checked", "false");
    await pii.click();
    await expect(pii).toHaveAttribute("aria-checked", "true");
    // The menu stays open after a pick, so a second pick is the same gesture (AT-O).
    await expect(pci).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(button).toHaveText("◎ Facets (1)");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(nodeLocator(page, "Accounts").locator('[data-facet-ring="pii"]')).toHaveCount(1);
    await expect(page.locator('.preview-container svg [data-facet-ring="pci"]')).toHaveCount(0);

    await button.click();
    await pci.click();
    await expect(pci).toHaveAttribute("aria-checked", "true");
    await expect(pii).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(button).toHaveText("◎ Facets (2)");
    await expect(nodeLocator(page, "Billing").locator('[data-facet-ring="pci"]')).toHaveCount(1);

    // Clearing both returns to the unselected picture (TPL-1402).
    await button.click();
    await pii.click();
    await pci.click();
    await expect(pii).toHaveAttribute("aria-checked", "false");
    await expect(pci).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");
    await expect(button).toHaveText("◎ Facets");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".preview-container svg [data-facet-ring]")).toHaveCount(0);
  });
});
