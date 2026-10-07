import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test, type OpfsFixture } from "../fixtures/opfs.js";

/**
 * The focus canvas without a mouse (#3057, docs/acceptance/edge-label-focus-canvas.md):
 * the keyboard reaches it through the Outline and the command palette and moves
 * around it with Tab and Enter; touch reaches it through the node detail panel.
 *
 * The dense fixture's domains sit one level below the root, and the keyboard
 * has no way down yet (#3082). Each test drills to that level with one pointer
 * action as setup, then uses only the input it is about.
 */

const DENSE = readFileSync(
  fileURLToPath(
    new URL("../../core/src/renderer/fixtures/dense-domain-canvas.krs", import.meta.url),
  ),
  "utf8",
);

async function openDenseProject(page: Page, opfs: OpfsFixture) {
  await opfs.seed({
    projects: [{ id: "dense", name: "Dense", files: { "index.krs": DENSE } }],
    lastProjectId: "dense",
  });
  await opfs.gotoApp();
  await expect(page.locator('.preview-container svg [data-node-id="UmamiApp"]')).toBeVisible();
}

/** The node's edges on the drilled-down canvas, once all 41 are drawn. */
const edgesTouching = async (page: Page, id: string) => {
  await expect(page.locator(".preview-container svg .krs-edge[data-edge-from]")).toHaveCount(41);
  return page
    .locator(".preview-container svg .krs-edge[data-edge-from]")
    .evaluateAll(
      (gs, node) =>
        gs.filter(
          (g) =>
            g.getAttribute("data-edge-from") === node || g.getAttribute("data-edge-to") === node,
        ).length,
      id,
    );
};

test.describe("AT-3057 focus canvas from the keyboard", () => {
  test("Outline, then the palette command, then Tab and Enter: no mouse past the setup", async ({
    page,
    opfs,
  }) => {
    await openDenseProject(page, opfs);
    // Setup: one level down, where the domains are (no keyboard route yet, #3082).
    await page.locator('.preview-container svg [data-node-id="UmamiApp"]').click();
    await expect(page.locator(".breadcrumb-current")).toHaveText("Umami app");
    const lanesExpected = await edgesTouching(page, "Identity");

    // Keyboard only from here.
    await page.getByRole("button", { name: "Show outline" }).focus();
    await page.keyboard.press("Enter");
    const entry = page.locator(".outline-item", { hasText: "Identity & access" });
    await entry.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.locator('.preview-container svg [data-node-id="Identity"].karasu-highlighted'),
    ).toHaveCount(1);

    await page.keyboard.press("ControlOrMeta+Shift+P");
    await page.keyboard.type("Show Relations");
    await page.keyboard.press("Enter");

    const panel = page.locator(".focus-canvas__panel");
    await expect(page.locator(".focus-canvas__title")).toHaveText("Identity & access");
    await expect(page.locator(".focus-canvas .focus-canvas__lane")).toHaveCount(lanesExpected);
    // Focus is in the canvas, so Tab walks its buttons rather than the page.
    await expect(panel).toBeFocused();

    // Tab past the bar (Close) to the first card or lane in the drawing, and
    // press it: a card moves to its node, a lane to its pair. Either way the
    // canvas has moved on.
    const activeIn = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        return {
          inCanvas: el?.closest(".focus-canvas") !== null,
          inDrawing: el?.closest(".focus-canvas__svg") !== null,
          role: el?.getAttribute("role"),
          label: el?.getAttribute("aria-label"),
        };
      });
    let focused = await activeIn();
    for (let i = 0; i < 5 && !focused.inDrawing; i++) {
      await page.keyboard.press("Tab");
      focused = await activeIn();
    }
    expect(focused.inCanvas).toBe(true);
    expect(focused.role).toBe("button");
    await page.keyboard.press("Enter");
    await expect(page.locator(".focus-canvas__title")).not.toHaveText("Identity & access");
    await expect(panel).toBeFocused();

    // Back is a button too; Esc closes.
    await page.keyboard.press("Escape");
    await expect(page.locator(".focus-canvas")).toHaveCount(0);
  });
});

test.describe("AT-3057 focus canvas from touch", () => {
  test.use({ hasTouch: true });

  test("a tap on ⓘ, then on Relations in the panel, opens the node's canvas", async ({
    page,
    opfs,
  }) => {
    await openDenseProject(page, opfs);
    await page.locator('.preview-container svg [data-node-id="UmamiApp"]').tap();
    await expect(page.locator(".breadcrumb-current")).toHaveText("Umami app");
    const lanesExpected = await edgesTouching(page, "Identity");

    await page.locator('.preview-container svg [data-info-button="Identity"]').tap();
    const relations = page.locator(".node-detail-panel button", { hasText: "⇄ Relations" });
    await expect(relations).toHaveText(`⇄ Relations ${lanesExpected}`);
    await relations.tap();

    await expect(page.locator(".focus-canvas__title")).toHaveText("Identity & access");
    await expect(page.locator(".focus-canvas .focus-canvas__lane")).toHaveCount(lanesExpected);
  });
});
