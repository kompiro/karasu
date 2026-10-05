import { bootMemoryApp } from "../fixtures/boot.js";
import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-2917: the multi-system root draws both same-named services, and a click
 * lands on the card that was clicked.
 *
 * `Shop.Api` and `Admin.Api` used to collapse onto one card. Now the root
 * canvas carries two `data-node-id="Api"` cards, one per system frame, each
 * with its own `data-node-path`. The strict locators below therefore address a
 * card by `data-node-path` (TPL-2920): `[data-node-id="Api"]` resolves to two
 * elements on purpose.
 */

const KRS = `system Shop {
  service Api {
    domain Orders {}
  }
  service Worker {}
  Api -> Worker "queues"
}

system Admin {
  service Api {
    domain Users {}
  }
}
`;

test.describe("AT-2917 multi-system root same-id nodes", () => {
  test("draws one Api card per system, each carrying its own path", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS);
    const svg = page.locator(".preview-column svg").first();
    await expect(svg).toContainText("Worker");

    await expect(page.locator('svg [data-node-id="Api"]')).toHaveCount(2);
    await expect(page.locator('svg [data-node-path="Shop.Api"]')).toHaveCount(1);
    await expect(page.locator('svg [data-node-path="Admin.Api"]')).toHaveCount(1);
    await expect(page.locator('svg [data-node-path="Shop.Worker"]')).toHaveCount(1);
  });

  test("clicking the Admin card drills into Admin, not into the Shop winner", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, KRS);
    await expect(page.locator(".preview-column svg").first()).toContainText("Worker");

    await page.locator('svg [data-node-path="Admin.Api"]').click({ position: { x: 4, y: 4 } });

    // The drilled level shows Admin's domain and none of Shop's.
    const svg = page.locator(".preview-column svg").first();
    await expect(svg).toContainText("Users");
    await expect(svg).not.toContainText("Orders");
    await expect(page).toHaveURL(/#krs-system-Api(\?|$)/);
  });

  test("clicking the Shop card drills into Shop", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS);
    await expect(page.locator(".preview-column svg").first()).toContainText("Worker");

    await page.locator('svg [data-node-path="Shop.Api"]').click({ position: { x: 4, y: 4 } });

    const svg = page.locator(".preview-column svg").first();
    await expect(svg).toContainText("Orders");
    await expect(svg).not.toContainText("Users");
  });
});
