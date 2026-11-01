import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test, type OpfsFixture } from "../fixtures/opfs.js";

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

/**
 * Boot on Umami app's level through its hash, so the dense canvas is laid out
 * once instead of after the system root it would be drilled from (#3237).
 */
async function openDenseCanvas(page: Page, opfs: OpfsFixture) {
  await opfs.seed({
    projects: [{ id: "dense", name: "Dense", files: { "index.krs": DENSE } }],
    lastProjectId: "dense",
  });
  await opfs.gotoApp("/#krs-system-UmamiApp");
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
    const unreachable: string[] = [];
    for (const e of edges) {
      if (!(await clickPoint(page, e.from, e.to))) unreachable.push(`${e.from}->${e.to}`);
    }
    // Not asserted: which edges the pointer misses depends on the viewport.
    // What is asserted is that none of the 41 needs the pointer: every edge
    // is a lane of both of its ends' focus canvases, label in full.
    test.info().annotations.push({
      type: "unreachable by click",
      description: unreachable.join(", ") || "none",
    });
    // The first node opens by its Relations pill; each next one by its card on
    // the open canvas where one is on screen, else by its pill again. The pill
    // and a card open the same `{ kind: "node", id }` focus. Closing and
    // hovering for every node re-dims the dense canvas twice each time, which
    // made this the slowest test in the suite (#3237).
    const card = (id: string) => page.locator(`.focus-canvas [data-focus-node="${id}"]`).first();
    const pending = [...new Set(edges.flatMap((e) => [e.from, e.to]))];
    while (pending.length > 0) {
      let next = -1;
      if ((await page.locator(".focus-canvas").count()) > 0) {
        for (let i = 0; i < pending.length && next < 0; i++) {
          if ((await card(pending[i]).count()) > 0) next = i;
        }
      }
      const id = pending.splice(Math.max(next, 0), 1)[0];
      if (next >= 0) {
        await card(id).click();
      } else {
        if ((await page.locator(".focus-canvas").count()) > 0) {
          await page.locator(".focus-canvas__close").click();
          await expect(page.locator(".focus-canvas")).toHaveCount(0);
        }
        await openRelations(page, id);
      }
      // Every lane touches `id` once the canvas is on it, not on the last node.
      await expect
        .poll(() =>
          page
            .locator(".focus-canvas .focus-canvas__lane")
            .evaluateAll(
              (lanes, n) =>
                lanes.length > 0 &&
                lanes.every(
                  (l) =>
                    l.getAttribute("data-focus-from") === n ||
                    l.getAttribute("data-focus-to") === n,
                ),
              id,
            ),
        )
        .toBe(true);
      const lanes = await laneLabels(page);
      for (const e of edges.filter((x) => x.from === id || x.to === id)) {
        expect(lanes).toContain(e.label.split(/\s+/).join(" "));
      }
    }
  });

  test("a narrow preview keeps the same picture and scrolls, opening on the node", async ({
    page,
    opfs,
  }) => {
    // Like a map: the pane's width changes how much is in view, not where
    // things are. The drawing is the same at any width, at its natural size.
    const drawn = async (width: number) => {
      await page.setViewportSize({ width, height: 900 });
      await openRelations(page, "Identity");
      const svg = page.locator(".focus-canvas__svg");
      const result = {
        markup: await svg.evaluate((el) => el.outerHTML),
        size: await svg.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return [Math.round(r.width), Math.round(r.height)];
        }),
        natural: await svg.evaluate((el) => [
          Number(el.getAttribute("width")),
          Number(el.getAttribute("height")),
        ]),
      };
      await page.locator(".focus-canvas__close").click();
      return result;
    };
    await openDenseCanvas(page, opfs);
    const wide = await drawn(2400);
    const narrow = await drawn(1100);
    expect(narrow.markup).toBe(wide.markup);
    expect(narrow.size).toEqual(narrow.natural);

    // The narrow pane opens scrolled to the node, which is in view.
    await openRelations(page, "Identity");
    const body = page.locator(".focus-canvas__body");
    expect(await body.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await body.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await expect(page.locator('.focus-canvas [data-focus-node="Identity"]')).toBeInViewport();

    // Dragging moves the view, as on the main canvas.
    const before = await body.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    // From a point that is not text: a press on text selects instead.
    const { cx, cy } = await body.evaluate((el) => {
      const r = el.getBoundingClientRect();
      for (let dy = 0.5; dy < 0.95; dy += 0.05) {
        for (let dx = 0.5; dx < 0.95; dx += 0.05) {
          const x = r.left + r.width * dx;
          const y = r.top + r.height * dy;
          const hit = document.elementFromPoint(x, y);
          if (
            hit &&
            el.contains(hit) &&
            !hit.closest(".focus-canvas__label, .focus-canvas__card text")
          ) {
            return { cx: x, cy: y };
          }
        }
      }
      throw new Error("no point in the panel that is not text");
    });
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 60, { steps: 6 });
    await page.mouse.up();
    const after = await body.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    expect(after[0]).toBeLessThan(before[0]);
    // The button is up, so moving on does not keep dragging the view.
    await page.mouse.move(cx - 200, cy - 100, { steps: 4 });
    expect(await body.evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual(after);
    // The drag ended where a press began, not on a new focus.
    await expect(page.locator(".focus-canvas__title")).toHaveText("Identity & access");

    // A drag across a label selects its text instead: the view stays put and
    // the canvas stays on the node. First, a line of label text that is in view and is what the pointer hits.
    const t = await page.evaluate(() => {
      // Bring a label to the middle of the panel first; the narrow pane opens
      // on the node card, with the labels out of view on either side.
      const panel = document.querySelector<HTMLElement>(".focus-canvas__body")!;
      const first = document.querySelector(".focus-canvas .focus-canvas__label tspan")!;
      const f = first.getBoundingClientRect();
      const b = panel.getBoundingClientRect();
      panel.scrollLeft += f.left - b.left - (b.width - f.width) / 2;
      panel.scrollTop += f.top - b.top - b.height / 2;
      const view = panel.getBoundingClientRect();
      for (const span of document.querySelectorAll(".focus-canvas .focus-canvas__label tspan")) {
        const r = span.getBoundingClientRect();
        const inView =
          r.left > view.left && r.right < view.right && r.top > view.top && r.bottom < view.bottom;
        const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(r.left + 2, y);
        // Chromium reports the <text> for a point on its <tspan>.
        if (
          inView &&
          hit?.closest(".focus-canvas__label") === span.closest(".focus-canvas__label")
        ) {
          return { x: r.left, y: r.top, width: r.width, height: r.height };
        }
      }
      return null;
    });
    expect(t).not.toBeNull();
    const held = await body.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    await page.mouse.move(t!.x + 2, t!.y + t!.height / 2);
    await page.mouse.down();
    await page.mouse.move(t!.x + t!.width - 2, t!.y + t!.height / 2, { steps: 6 });
    await page.mouse.up();
    expect(
      await page.evaluate(() => window.getSelection()?.toString().length ?? 0),
    ).toBeGreaterThan(0);
    expect(await body.evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual(held);
    await expect(page.locator(".focus-canvas__title")).toHaveText("Identity & access");

    // The same for what a card says: its name selects, the view stays put.
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    const n = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(".focus-canvas__body")!;
      const text = document.querySelector('.focus-canvas [data-focus-node="Identity"] text')!;
      const f = text.getBoundingClientRect();
      const b = panel.getBoundingClientRect();
      panel.scrollLeft += f.left - b.left - (b.width - f.width) / 2;
      panel.scrollTop += f.top - b.top - (b.height - f.height) / 2;
      const r = text.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 1, r.top + r.height / 2);
      return hit === text ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
    });
    expect(n).not.toBeNull();
    const still = await body.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    await page.mouse.move(n!.x + 1, n!.y + n!.height / 2);
    await page.mouse.down();
    await page.mouse.move(n!.x + n!.width - 1, n!.y + n!.height / 2, { steps: 6 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain(
      "Identity",
    );
    expect(await body.evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual(still);
    await expect(page.locator(".focus-canvas__title")).toHaveText("Identity & access");
  });

  // #3180: a lane took a press only on its stroke and on the glyphs of its
  // label, so a click between the two lines of a wrapped label landed on the
  // background and did nothing.
  test("a lane takes a press between the lines of its label (#3180)", async ({ page, opfs }) => {
    await openDenseCanvas(page, opfs);
    await openRelations(page, "Identity");

    const point = await page.evaluate(() => {
      for (const lane of document.querySelectorAll(".focus-canvas .focus-canvas__lane")) {
        const spans = lane.querySelectorAll("tspan");
        if (spans.length < 2) continue;
        // The canvas scrolls on its own: bring the lane on screen to hit-test it.
        lane.scrollIntoView({ block: "center", inline: "center" });
        const first = spans[0].getBoundingClientRect();
        const second = spans[1].getBoundingClientRect();
        // Between the two lines, left of where either line's glyphs end.
        const x = first.left + Math.min(first.width, second.width) / 2;
        const y = (first.bottom + second.top) / 2;
        const hit = document.elementFromPoint(x, y)?.closest(".focus-canvas__lane");
        return {
          x,
          y,
          hitsLane: hit === lane,
          from: lane.getAttribute("data-focus-from"),
          to: lane.getAttribute("data-focus-to"),
        };
      }
      return null;
    });
    expect(point, "a lane on Identity's canvas wraps its label onto two lines").not.toBeNull();
    expect(point!.hitsLane).toBe(true);

    await page.mouse.click(point!.x, point!.y);
    // The edge focus: the pair's two cards, nothing else.
    const cards = page.locator(".focus-canvas .focus-canvas__card");
    await expect(cards).toHaveCount(2);
    const shown = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-focus-node")).sort(),
    );
    expect(shown).toEqual([point!.from, point!.to].sort());
  });
});
