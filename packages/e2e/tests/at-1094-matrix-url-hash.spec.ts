import { expect, test } from "../fixtures/opfs.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * AT-1094: the CRUD matrix tab lives in the URL hash.
 *
 * `buildHash` / `parseHash` are unit-tested (AT-A〜G). What the unit layer
 * cannot reach is the browser side: selecting the tab pushes a history entry
 * that Back / Forward walk (AT-H).
 *
 * AT-I: a cold boot or reload at `#krs-matrix` lands on the tab. Until #3208
 * the project seed's VIEW_RESET wiped the restored view, so every non-system
 * hash booted into System; the same cases for `#krs-deploy` and
 * `#krs-org-root` are checked here, since they share the restoration.
 *
 * The hash carries `?file=` in OPFS mode (#811), so the view token is matched
 * as a prefix.
 */

const MATRIX_KRS = `system Shop {
  database OrderDB {
    table Orders {}
  }
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {
        resource OrderDB.Orders {
          operations create
        }
      }
    }
  }
}
`;

const VIEWS_KRS = `${MATRIX_KRS}
deploy Prod {
  oci "order-api" { realizes OrderService }
}

organization Acme {
  team Orders {
    owns OrderService
  }
}
`;

const MATRIX_HASH = /^#krs-matrix(?:[:?]|$)/;
const SYSTEM_ROOT_HASH = /^#krs-system-root(?:[:?]|$)/;

test.describe("AT-1094 CRUD matrix tab in the URL hash", () => {
  test("selecting CRUD pushes #krs-matrix; Back returns to the previous tab and Forward re-selects CRUD (AT-H)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [{ id: "matrix", name: "Matrix", files: { "index.krs": MATRIX_KRS } }],
      lastProjectId: "matrix",
    });
    await opfs.gotoApp();
    const hash = () => page.evaluate(() => location.hash);
    const matrixTable = page.locator(".crud-matrix-table");

    // Start from a settled System view so the tab switch is the entry pushed
    // on top of the initial (replaced) root entry.
    await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();
    await expect(page.locator('svg [data-node-id="OrderService"]')).toBeVisible();
    await expect.poll(hash).toMatch(SYSTEM_ROOT_HASH);

    await openViewTab(page, "CRUD");
    await expect(matrixTable).toBeVisible();
    await expect.poll(hash).toMatch(MATRIX_HASH);

    await page.goBack();
    await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();
    await expect(page.locator('svg [data-node-id="OrderService"]')).toBeVisible();
    await expect(matrixTable).toHaveCount(0);
    await expect.poll(hash).toMatch(SYSTEM_ROOT_HASH);

    await page.goForward();
    await expect(page.getByRole("tab", { name: "CRUD", selected: true })).toBeVisible();
    await expect(matrixTable).toBeVisible();
    await expect.poll(hash).toMatch(MATRIX_HASH);
  });

  // AT-I (#3208)
  for (const [hash, tab, pattern, rendered] of [
    ["#krs-matrix", "CRUD", MATRIX_HASH, ".crud-matrix-table"],
    [
      "#krs-deploy",
      "Deploy",
      /^#krs-deploy(?:[:?]|$)/,
      'svg [data-realized-node-id="OrderService"]',
    ],
    ["#krs-org-root", "Org", /^#krs-org-root(?:[:?]|$)/, 'svg [data-node-id="Orders"]'],
  ] as const) {
    test(`a cold boot at ${hash} lands on the ${tab} tab (AT-I)`, async ({ page, opfs }) => {
      await opfs.seed({
        projects: [{ id: "views", name: "Views", files: { "index.krs": VIEWS_KRS } }],
        lastProjectId: "views",
      });
      await opfs.gotoApp(`/${hash}`);

      await expect(page.getByRole("tab", { name: tab, selected: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => location.hash)).toMatch(pattern);
      // Still there once the project has settled: the seed's reset ran before
      // the restored view was re-applied, not after.
      await expect(page.locator(rendered).first()).toBeVisible();
      await expect(page.getByRole("tab", { name: tab, selected: true })).toBeVisible();
    });

    test(`reloading on the ${tab} tab in memory mode stays on it (AT-I)`, async ({
      page,
      opfs,
    }) => {
      await opfs.seed({ mode: "memory" });
      await opfs.gotoApp();
      await openViewTab(page, tab);
      await expect.poll(() => page.evaluate(() => location.hash)).toMatch(pattern);

      await page.reload();

      await expect(page.getByRole("tab", { name: tab, selected: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => location.hash)).toMatch(pattern);
    });
  }
});
