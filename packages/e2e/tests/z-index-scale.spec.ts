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

/**
 * The probe judges where the winning value comes from. These cases add their
 * own elements to a booted app and close the page at the end, so the
 * after-test check in `network.ts` (which skips closed pages) does not fail
 * them for the violations they plant on purpose.
 */
test.describe("z-index probe on planted elements (TPL-1468)", () => {
  const plant = (page: Page, css: string, html: string) =>
    page.evaluate(
      ([c, h]) => {
        const style = document.createElement("style");
        style.textContent = c;
        document.head.append(style);
        document.body.insertAdjacentHTML("beforeend", h);
      },
      [css, html] as const,
    );
  const verdicts = async (page: Page, prefix: string) =>
    (await observedZIndex(page))
      .filter((h) => h.element.startsWith(prefix))
      .map(({ element, zIndex, token, violation }) => ({ element, zIndex, token, violation }));

  test("passes a token rule, and fails a literal that beats one", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, KRS);
    await plant(
      page,
      ".zt-surface { position: absolute; z-index: var(--z-handle); }",
      '<div class="zt-surface zt-ok"></div><div class="zt-surface zt-literal" style="z-index: 50"></div>',
    );
    expect(await verdicts(page, "div.zt-surface")).toEqual([
      { element: "div.zt-surface.zt-ok", zIndex: "50", token: "--z-handle", violation: false },
      { element: "div.zt-surface.zt-literal", zIndex: "50", token: null, violation: true },
    ]);
    await page.close();
  });

  test("does not lend a child's token to an ordinary parent", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, KRS);
    await plant(
      page,
      ".zt-child { position: absolute; z-index: var(--z-handle); }",
      '<div class="zt-parent" style="position: absolute; z-index: 50"><div class="zt-child"></div></div>',
    );
    expect(await verdicts(page, "div.zt-parent")).toEqual([
      { element: "div.zt-parent", zIndex: "50", token: null, violation: true },
    ]);
    await page.close();
  });

  test("checks descendants when an ancestor's class changes", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, KRS);
    await plant(
      page,
      ".zt-open .zt-menu { position: absolute; z-index: 999; }",
      '<div class="zt-host"><div class="zt-menu"></div></div>',
    );
    await page.evaluate(() => document.querySelector(".zt-host")!.classList.add("zt-open"));
    await page.evaluate(() => document.querySelector(".zt-host")!.classList.remove("zt-open"));
    expect((await scanZIndex(page)).filter((h) => h.element === "div.zt-menu")).toEqual([]);
    expect(await verdicts(page, "div.zt-menu")).toEqual([
      { element: "div.zt-menu", zIndex: "999", token: null, violation: true },
    ]);
    await page.close();
  });

  test("checks a surface that opens through a data attribute alone", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, KRS);
    await plant(
      page,
      '.zt-pop[data-state="open"] { position: absolute; z-index: 999; }',
      '<div class="zt-pop" data-state="closed"></div>',
    );
    await page.evaluate(() =>
      document.querySelector(".zt-pop")!.setAttribute("data-state", "open"),
    );
    await page.evaluate(() =>
      document.querySelector(".zt-pop")!.setAttribute("data-state", "closed"),
    );
    expect(await verdicts(page, "div.zt-pop")).toEqual([
      { element: "div.zt-pop", zIndex: "999", token: null, violation: true },
    ]);
    await page.close();
  });
});
