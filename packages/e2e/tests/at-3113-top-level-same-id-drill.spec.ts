import { bootMemoryApp } from "../fixtures/boot.js";
import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-3113: a top-level node that shares its id with a system's child is
 * reachable from the app, by click and by permalink, and the breadcrumb names
 * it under "Unassigned".
 *
 * The top-level `Api` sits in the Unassigned frame next to `Shop.Api`. Its
 * root card carries `data-node-path="Api"` (no system segment), and
 * `#krs-system-Parked` resolves through `nodePathIndex` to `["Api", "Parked"]`.
 * Both used to resolve to `Shop.Api`: the click opened Shop's `Orders`, and the
 * permalink opened an empty view.
 */

const KRS = `system Shop {
  service Api {
    domain Orders {
      usecase Place {}
    }
  }
}

service Api {
  domain Parked {
    usecase P {}
  }
}
`;

test.describe("AT-3113 top-level node sharing its id with a system's child", () => {
  test("clicking the Unassigned Api card drills into the top-level Api", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS);
    await expect(page.locator(".preview-column svg").first()).toContainText("Unassigned");

    await page.locator('svg [data-node-path="Api"]').click({ position: { x: 4, y: 4 } });

    const svg = page.locator(".preview-column svg").first();
    await expect(svg).toContainText("Parked");
    await expect(svg).not.toContainText("Orders");
    await expect(page.locator(".breadcrumb-link")).toHaveText(["Unassigned"]);
    await expect(page.locator(".breadcrumb-current")).toHaveText("Api");
  });

  test("opening #krs-system-Parked lands on the top-level domain", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "p", name: "P", files: { "index.krs": KRS } }],
      lastProjectId: "p",
    });
    await opfs.gotoApp("/#krs-system-Parked");

    const svg = page.locator(".preview-column svg").first();
    await expect(svg.locator('[data-node-id="P"]')).toHaveCount(1);
    await expect(svg).not.toContainText("Place");
    await expect(page.locator(".breadcrumb-link")).toHaveText(["Unassigned", "Api"]);
    await expect(page.locator(".breadcrumb-current")).toHaveText("Parked");
  });
});
