import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * The focus canvas (#3031, docs/acceptance/edge-label-focus-canvas.md): on a
 * dense canvas, an edge click or a card's Relations pill opens a second canvas
 * over the preview with every label in full.
 *
 * The model is the dense fixture slice A is fenced with: 10 domains, 41
 * labelled edges, most of them left off or cut on the main canvas.
 */

const DENSE = readFileSync(
  fileURLToPath(
    new URL("../../core/src/renderer/fixtures/dense-domain-canvas.krs", import.meta.url),
  ),
  "utf8",
);

async function openDenseCanvas(page: Page, opfs: Parameters<typeof bootMemoryApp>[1]) {
  await bootMemoryApp(page, opfs, DENSE);
  await openViewTab(page, "System");
  await page.locator('.preview-container svg [data-node-id="UmamiApp"]').click();
  await expect(page.locator(".breadcrumb-current")).toHaveText("Umami app");
  await expect(page.locator(".preview-container svg .krs-edge[data-edge-from]")).toHaveCount(41);
}

/**
 * A point on the edge's line where the pointer reaches the edge itself, or
 * null when every sampled point is under a card or another edge's hit area.
 */
const clickPoint = (page: Page, from: string, to: string) =>
  page.evaluate(
    ([a, b]) => {
      const g = document.querySelector(
        `.preview-container svg .krs-edge[data-edge-from="${a}"][data-edge-to="${b}"]`,
      );
      const line = g?.querySelector<SVGGeometryElement>(".krs-edge__hitline, path, line, polyline");
      if (!g || !line) return null;
      const length = line.getTotalLength();
      const m = line.getScreenCTM()!;
      // From the middle outward, every 2% of the line.
      for (let i = 0; i <= 49; i++) {
        for (const t of [0.5 + i / 100, 0.5 - i / 100]) {
          const p = line.getPointAtLength(length * t);
          const x = p.x * m.a + p.y * m.c + m.e;
          const y = p.x * m.b + p.y * m.d + m.f;
          if (document.elementFromPoint(x, y)?.closest(".krs-edge") === g) return { x, y };
        }
      }
      return null;
    },
    [from, to],
  );

/** The labels on the open focus canvas, each one's wrapped lines joined back. */
const laneLabels = (page: Page) =>
  page
    .locator(".focus-canvas .focus-canvas__lane")
    .evaluateAll((lanes) =>
      lanes.map((l) => [...l.querySelectorAll("tspan")].map((t) => t.textContent).join(" ")),
    );

async function openRelations(page: Page, id: string) {
  await page.locator(`.preview-container svg [data-node-id="${id}"]`).first().hover();
  const pill = page.locator(".node-focus-pill");
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(page.locator(".focus-canvas")).toBeVisible();
}

test.describe("AT-3031 focus canvas", () => {
  test("an edge click shows the label the canvas left off, in full", async ({ page, opfs }) => {
    await openDenseCanvas(page, opfs);
    const deferred = page.locator(
      '.preview-container svg .krs-edge[data-edge-label-withheld="deferred"]',
    );
    const candidates = await deferred.evaluateAll((gs) =>
      gs.map((g) => ({
        from: g.getAttribute("data-edge-from")!,
        to: g.getAttribute("data-edge-to")!,
        label: g.getAttribute("data-edge-label")!,
      })),
    );
    expect(candidates.length).toBeGreaterThan(10);

    let opened: (typeof candidates)[number] | null = null;
    for (const c of candidates) {
      const at = await clickPoint(page, c.from, c.to);
      if (!at) continue;
      await page.mouse.click(at.x, at.y);
      opened = c;
      break;
    }
    expect(opened).not.toBeNull();
    await expect(page.locator(".focus-canvas")).toBeVisible();
    const labels = await laneLabels(page);
    expect(labels[0]).toBe(opened!.label.split(/\s+/).join(" "));

    await page.keyboard.press("Escape");
    await expect(page.locator(".focus-canvas")).toHaveCount(0);
  });

  test("hovering a card dims its unrelated edges; Relations lists every edge it has", async ({
    page,
    opfs,
  }) => {
    await openDenseCanvas(page, opfs);
    const mine = await page
      .locator(".preview-container svg .krs-edge[data-edge-from]")
      .evaluateAll(
        (gs) =>
          gs.filter(
            (g) =>
              g.getAttribute("data-edge-from") === "Identity" ||
              g.getAttribute("data-edge-to") === "Identity",
          ).length,
      );

    await page.locator('.preview-container svg [data-node-id="Identity"]').first().hover();
    await expect(page.locator(".node-focus-pill")).toHaveText(`⇄ Relations ${mine}`);
    const unrelated = page
      .locator(".preview-container svg .krs-edge[data-edge-from]")
      .filter({
        hasNot: page.locator(
          "xpath=self::*[@data-edge-from='Identity' or @data-edge-to='Identity']",
        ),
      })
      .first();
    await expect(unrelated).toHaveCSS("opacity", "0.12");

    await page.locator(".node-focus-pill").click();
    await expect(page.locator(".focus-canvas__title")).toHaveText("Identity & access");
    await expect(page.locator(".focus-canvas .focus-canvas__lane")).toHaveCount(mine);

    // A card on the focus canvas moves to that node; Back returns.
    await page.locator('.focus-canvas [data-focus-node="Teams"]').first().click();
    await expect(page.locator(".focus-canvas__title")).toHaveText("Teams");
    await page.locator(".focus-canvas__back").click();
    await expect(page.locator(".focus-canvas__title")).toHaveText("Identity & access");
  });

  test("every edge is reachable: by its own line, or from either end's Relations (TPL-3022)", async ({
    page,
    opfs,
  }) => {
    await openDenseCanvas(page, opfs);
    const edges = await page
      .locator(".preview-container svg .krs-edge[data-edge-from]")
      .evaluateAll((gs) =>
        gs.map((g) => ({
          from: g.getAttribute("data-edge-from")!,
          to: g.getAttribute("data-edge-to")!,
          label: g.getAttribute("data-edge-label")!,
        })),
      );
    const unreachable = [];
    for (const e of edges) if (!(await clickPoint(page, e.from, e.to))) unreachable.push(e);

    // Whatever the pointer cannot reach on the main canvas is a lane of its
    // source node's focus canvas, label in full.
    for (const e of unreachable) {
      await openRelations(page, e.from);
      expect(await laneLabels(page)).toContain(e.label.split(/\s+/).join(" "));
      await page.locator(".focus-canvas__close").click();
      await expect(page.locator(".focus-canvas")).toHaveCount(0);
    }
  });

  test("a preview narrower than the three columns lays a hub out in one column", async ({
    page,
    opfs,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openDenseCanvas(page, opfs);
    await openRelations(page, "Identity");
    await expect(page.locator(".focus-canvas__panel")).toHaveAttribute(
      "data-focus-layout",
      "spine",
    );
  });
});
