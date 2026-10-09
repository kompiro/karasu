import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * AT-2819: an owned-service button on the Org tab navigates to the node its
 * reference names, even when another node's id is spelled like that reference.
 *
 * `owns Shop.Api` names the `Api` inside `Shop`; `owns "Shop.Api"` names the
 * top-level service whose id is `Shop.Api`. The buttons used to carry the same
 * attribute value (`Shop.Api`), and the app looked it up as a bare id, so both
 * opened the top-level service. Each node holds a different domain, which is
 * what tells the two landing canvases apart.
 */

const KRS = `system Shop {
  service Api {
    domain Inner {}
  }
}

service "Shop.Api" {
  domain Outer {}
}

organization Acme {
  team Core {
    owns Shop.Api
    owns "Shop.Api"
  }
}
`;

test.describe("AT-2819 owned-service buttons keep the reference the author wrote", () => {
  const cases = [
    { label: "→ Shop.Api", attr: "Shop.Api", shows: "Inner", hides: "Outer" },
    { label: '→ "Shop.Api"', attr: '"Shop.Api"', shows: "Outer", hides: "Inner" },
  ];

  for (const { label, attr, shows, hides } of cases) {
    test(`${label} opens the node it names`, async ({ page, opfs }) => {
      await bootMemoryApp(page, opfs, KRS);
      await openViewTab(page, "Org");

      const button = page.locator("svg [data-owned-service-button]").filter({ hasText: label });
      await expect(button).toHaveCount(1);
      await expect(button).toHaveAttribute("data-owned-service-button", attr);
      await button.click();

      await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();
      const preview = page.locator(".preview-container svg");
      await expect(preview.locator(`[data-node-id="${shows}"]`)).toHaveCount(1);
      await expect(preview.locator(`[data-node-id="${hides}"]`)).toHaveCount(0);
    });
  }
});
