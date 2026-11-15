import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootProjectApp } from "../fixtures/boot.js";
import { openTreeContextMenu } from "../fixtures/file-tree.js";
import { pressChord } from "../fixtures/keyboard.js";
import { openViewTab } from "../fixtures/tabs.js";
import {
  formatViolations,
  observedZIndex,
  scanZIndex,
  zTokenNames,
} from "../fixtures/z-index-scan.js";

/**
 * The computed z-index scan sees every layer of the scale (TPL-1468).
 *
 * `network.ts` runs `scanZIndex` after every test, so any surface a spec opens
 * is checked against `tokens.css`. That only means something if the scan
 * actually reaches the surfaces each layer is for, portals included. Each
 * token below has a scenario that opens a surface on that layer, and the test
 * asserts the scan reports an element whose z-index comes from that token.
 * The table is keyed by the tokens parsed from tokens.css, so a new token
 * fails here until it has a scenario. A last test closes a surface before
 * reading, so the observer, not only the final scan, is shown to see it.
 */

const KRS = `system Shop {
  service Storefront
  service Payment

  Storefront -> Payment "pays"
}

deploy Prod {
  oci "storefront-app" {
    runtime "Node.js 20"
    realizes Storefront
  }
}
`;

/** Opens a surface on the token's layer, starting from a booted project. */
const SCENARIOS: Record<string, (page: Page) => Promise<void>> = {
  // Split and sidebar resize handles are there from boot.
  "--z-handle": async () => {},
  // Node detail panel: click a deploy unit.
  "--z-floating-panel": async (page) => {
    await openViewTab(page, "Deploy");
    await page.locator('svg [data-node-id="Storefront::storefront-app"]').first().click();
    await expect(page.locator(".node-detail-panel")).toBeVisible();
  },
  // The focus canvas, opened from a node's Relations pill.
  "--z-panel": async (page) => {
    await page.locator('.preview-container svg [data-node-id="Storefront"]').first().hover();
    await page.locator(".node-focus-pill").click();
    await expect(page.locator(".focus-canvas")).toBeVisible();
  },
  // File-tree context menu.
  "--z-context-menu": async (page) => {
    await openTreeContextMenu(page, "index.krs");
  },
  // Command palette: a shadcn Dialog portalled to <body>.
  "--z-dialog": async (page) => {
    await pressChord(page, "Shift+P");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
  },
  // Documentation links: a shadcn DropdownMenu portalled to <body>.
  "--z-menu": async (page) => {
    await page.getByRole("button", { name: "Documentation links" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
  },
  // Format button tooltip: a shadcn Tooltip portalled to <body>.
  "--z-tooltip": async (page) => {
    await page.getByRole("button", { name: /Format/ }).hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
  },
};

test.describe("z-index scale scan (TPL-1468)", () => {
  test("has a scenario for every token in tokens.css", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(zTokenNames().sort());
  });

  for (const [token, open] of Object.entries(SCENARIOS)) {
    test(`sees a surface on ${token}`, async ({ page, opfs }) => {
      await bootProjectApp(page, opfs, KRS);
      await open(page);
      const hits = await scanZIndex(page);
      expect(formatViolations(hits)).toEqual([]);
      expect(hits.map((h) => h.token)).toContain(token);
    });
  }

  test("records a surface that was opened and closed again", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, KRS);
    await SCENARIOS["--z-dialog"](page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toHaveCount(0);
    expect((await scanZIndex(page)).map((h) => h.token)).not.toContain("--z-dialog");
    expect((await observedZIndex(page)).map((h) => h.token)).toContain("--z-dialog");
  });
});
