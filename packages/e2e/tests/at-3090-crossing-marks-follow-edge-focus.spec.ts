import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * Crossing marks follow the hover dim (#3090,
 * docs/acceptance/3090-crossing-marks-follow-edge-focus.md). Hops, count chips
 * and trunk bands are drawn in layers outside the edge groups; node focus
 * (#3031) and edge hover (#1186) dim them with the edges they belong to.
 *
 * The model is the hr-tool example, whose system view has hops on several of
 * its edges at the preview's width. The card and the edge are picked from the
 * rendered SVG (one with marks of its own and marks of others), so a layout
 * change moves the pick rather than breaking the spec.
 */

const HR_TOOL = readFileSync(
  fileURLToPath(new URL("../../../examples/en/hr-tool/system.krs", import.meta.url)),
  "utf8",
);

const MARKS = ".preview-container svg [data-edges]";

async function openSystemView(page: Page, opfs: Parameters<typeof bootMemoryApp>[1]) {
  await bootMemoryApp(page, opfs, HR_TOOL);
  await openViewTab(page, "System");
  await expect(page.locator(MARKS).first()).toBeAttached();
}

/**
 * The position (among the marks) of one mark that belongs to an edge in
 * `kept`, and of one that belongs to none of them; -1 when there is none.
 */
const pickMarks = (page: Page, kept: string[]) =>
  page.locator(MARKS).evaluateAll((marks, keep) => {
    const ofKept = (m: Element) =>
      m
        .getAttribute("data-edges")!
        .split(" ")
        .some((e) => keep.includes(e));
    return { own: marks.findIndex(ofKept), other: marks.findIndex((m) => !ofKept(m)) };
  }, kept);

test.describe("AT-3090 crossing marks follow the hover dim", () => {
  test("hovering a card dims the marks of the edges it does not touch, to the edges' opacity", async ({
    page,
    opfs,
  }) => {
    await openSystemView(page, opfs);
    // A card whose edges own some marks but not all of them.
    const pick = await page.evaluate(() => {
      const svg = document.querySelector(".preview-container svg")!;
      const marks = [...svg.querySelectorAll("[data-edges]")].map((m) =>
        m.getAttribute("data-edges")!.split(" "),
      );
      const ids = new Set(
        [...svg.querySelectorAll("[data-node-id]")].map((n) => n.getAttribute("data-node-id")!),
      );
      for (const id of ids) {
        const own = [...svg.querySelectorAll(".krs-edge[data-edge-index]")]
          .filter(
            (g) => g.getAttribute("data-edge-from") === id || g.getAttribute("data-edge-to") === id,
          )
          .map((g) => g.getAttribute("data-edge-index")!);
        const kept = marks.filter((edges) => edges.some((e) => own.includes(e))).length;
        if (kept > 0 && kept < marks.length) return { id, own };
      }
      return null;
    });
    expect(pick).not.toBeNull();
    const picked = await pickMarks(page, pick!.own);

    await page.locator(`.preview-container svg [data-node-id="${pick!.id}"]`).first().hover();
    await expect(page.locator(".node-focus-pill")).toBeVisible();
    await expect(page.locator(MARKS).nth(picked.other)).toHaveCSS("opacity", "0.12");
    await expect(page.locator(MARKS).nth(picked.own)).toHaveCSS("opacity", "1");
  });

  test("hovering an edge dims the other edges' marks and keeps its own", async ({ page, opfs }) => {
    await openSystemView(page, opfs);
    // An interactive edge with marks of its own while others have marks too,
    // and a point on its line where the pointer reaches the edge itself.
    const target = await page.evaluate(() => {
      const svg = document.querySelector(".preview-container svg")!;
      const marks = [...svg.querySelectorAll("[data-edges]")].map((m) =>
        m.getAttribute("data-edges")!.split(" "),
      );
      for (const g of svg.querySelectorAll(".krs-edge--interactive[data-edge-index]")) {
        const index = g.getAttribute("data-edge-index")!;
        if (marks.every((edges) => edges.includes(index))) continue;
        const line = g.querySelector<SVGGeometryElement>(
          ".krs-edge__hitline, path, line, polyline",
        );
        if (!line) continue;
        const length = line.getTotalLength();
        const m = line.getScreenCTM()!;
        for (let i = 1; i < 50; i++) {
          const p = line.getPointAtLength((length * i) / 50);
          const x = p.x * m.a + p.y * m.c + m.e;
          const y = p.x * m.b + p.y * m.d + m.f;
          if (document.elementFromPoint(x, y)?.closest(".krs-edge") === g) return { index, x, y };
        }
      }
      return null;
    });
    expect(target).not.toBeNull();
    const picked = await pickMarks(page, [target!.index]);

    await page.mouse.move(target!.x, target!.y);
    await expect(page.locator(MARKS).nth(picked.other)).toHaveCSS("opacity", "0.25");
    await expect(page.locator(MARKS).nth(picked.own)).toHaveCSS("opacity", "1");

    // Off the diagram: the marks come back with the edges.
    await page.mouse.move(1, 1);
    await expect(page.locator(MARKS).nth(picked.other)).toHaveCSS("opacity", "1");
  });
});
