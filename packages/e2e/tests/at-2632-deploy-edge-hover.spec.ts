import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * Every drawn edge is hoverable (#2632,
 * docs/acceptance/2632-edge-hover-affordance.md). The hover highlight and the
 * peer dim (#1186) used to key on `krs-edge--interactive`, which only an edge
 * with a canonical id carries; deploy edges, ghost edges and the edges of a
 * multi-system root never get one. Right-click stays limited to addressable
 * edges.
 */

const DEPLOY = `system Shop {
  service Web { label "Web" }
  service Api { label "API" }
  service Db [database] { label "DB" }
  Web -> Api "calls"
  Api -> Db "reads"
}

deploy Production {
  label "prod"
  oci "web-pod" { label "web"; realizes Web }
  oci "api-pod" { label "api"; realizes Api }
  oci "pg" { label "postgres"; realizes Db }
}
`;

/**
 * Two edges on the base `Web->Api` with no #<id>: the canonical-id pass clears
 * both (#2543). The third keeps its id.
 */
const COLLIDING = `system Shop {
  service Web {}
  service Api {}
  service Db [database] {}
  Web -> Api "reads"
  Web -> Api "writes"
  Api -> Db "queries"
}
`;

const HR_TOOL = readFileSync(
  fileURLToPath(new URL("../../../examples/en/hr-tool/system.krs", import.meta.url)),
  "utf8",
);

const EDGES = ".preview-container svg .krs-edge";
const STROKE = "line:not(.krs-edge__hitline), polyline:not(.krs-edge__hitline), path";

/**
 * The opacity a reader sees: the element's own times every ancestor's. The
 * child's computed opacity alone misses the deploy view's muted ghost group.
 */
const effectiveOpacity = (locator: Locator) =>
  locator.evaluate((el) => {
    let o = 1;
    for (let n: Element | null = el; n !== null; n = n.parentElement) {
      const v = Number.parseFloat(getComputedStyle(n).opacity);
      if (!Number.isNaN(v)) o *= v;
    }
    return Math.round(o * 1000) / 1000;
  });

/**
 * A screen point on edge `nth` where the pointer reaches that edge itself, not
 * a card or another edge drawn over it. `null` when there is none.
 */
const pointOn = (page: Page, nth: number) =>
  page
    .locator(EDGES)
    .nth(nth)
    .evaluate((g) => {
      const line = g.querySelector<SVGGeometryElement>(".krs-edge__hitline");
      if (!line) return null;
      const length = line.getTotalLength();
      const m = line.getScreenCTM()!;
      for (let i = 1; i < 50; i++) {
        const p = line.getPointAtLength((length * i) / 50);
        const x = p.x * m.a + p.y * m.c + m.e;
        const y = p.x * m.b + p.y * m.d + m.f;
        if (document.elementFromPoint(x, y)?.closest(".krs-edge") === g) return { x, y };
      }
      return null;
    });

async function hoverEdge(page: Page, nth: number) {
  const point = await pointOn(page, nth);
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
}

test.describe("AT-2632 every drawn edge is hoverable", () => {
  test("AT-A: a deploy edge highlights on hover and dims its peers, as in the system view", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, DEPLOY);
    await openViewTab(page, "Deploy");
    const edges = page.locator(EDGES);
    await expect(edges).toHaveCount(2);
    // Every deploy edge has the wide target, and none is addressable.
    await expect(page.locator(`${EDGES} .krs-edge__hitline`)).toHaveCount(2);
    await expect(page.locator(".preview-container svg [data-edge-canonical-id]")).toHaveCount(0);

    await hoverEdge(page, 0);
    await expect(edges.nth(1)).toHaveCSS("opacity", "0.25");
    // At full strength, not at the ghost group's 0.3 (the `.krs-edge`
    // transition settles first, hence the poll).
    await expect.poll(() => effectiveOpacity(edges.nth(0))).toBe(1);
    await expect.poll(() => effectiveOpacity(edges.nth(1))).toBe(0.25);
    await expect(edges.nth(0).locator(STROKE).first()).toHaveCSS("stroke-width", "3px");

    // Off the diagram: the deploy view's muted look comes back.
    await page.mouse.move(1, 1);
    await expect.poll(() => effectiveOpacity(edges.nth(0))).toBe(0.3);
    await expect.poll(() => effectiveOpacity(edges.nth(1))).toBe(0.3);
  });

  test("AT-B: right-clicking a deploy edge opens no direction menu", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, DEPLOY);
    await openViewTab(page, "Deploy");
    await expect(page.locator(EDGES)).toHaveCount(2);
    const point = await pointOn(page, 0);
    expect(point).not.toBeNull();
    await page.mouse.click(point!.x, point!.y, { button: "right" });
    await expect(page.locator(".edge-context-menu")).toHaveCount(0);
  });

  test("AT-C: an edge that lost its canonical id dims its peers on hover", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, COLLIDING);
    await openViewTab(page, "System");
    const edges = page.locator(EDGES);
    await expect(edges).toHaveCount(3);
    const nth = await edges.evaluateAll((groups) =>
      groups.findIndex((g) => !g.hasAttribute("data-edge-canonical-id")),
    );
    expect(nth).toBeGreaterThanOrEqual(0);
    const peer = nth === 0 ? 1 : 0;

    await hoverEdge(page, nth);
    await expect(edges.nth(peer)).toHaveCSS("opacity", "0.25");
    await expect(edges.nth(nth).locator(STROKE).first()).toHaveCSS("stroke-width", "3px");
  });

  test("AT-D: an edge drawn as a gapped <path> for its hop marks thickens on hover", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, HR_TOOL);
    await openViewTab(page, "System");
    await expect(page.locator(".preview-container svg [data-edges]").first()).toBeAttached();
    // An edge whose visible stroke is a <path> (#1859 P2c-C), and that the
    // pointer can reach.
    const nth = await page
      .locator(EDGES)
      .evaluateAll((groups) => groups.findIndex((g) => g.querySelector(":scope > path") !== null));
    expect(nth).toBeGreaterThanOrEqual(0);
    await hoverEdge(page, nth);
    await expect(page.locator(EDGES).nth(nth).locator(":scope > path").first()).toHaveCSS(
      "stroke-width",
      "3px",
    );
  });
});
