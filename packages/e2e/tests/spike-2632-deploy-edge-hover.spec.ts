/**
 * SPIKE #2632 — does broadening the hover trigger from `.krs-edge--interactive`
 * to `.krs-edge` actually give the deploy view the affordance, and what does the
 * muted ghost group do to it?
 *
 * Deploy edges are painted inside `<g class="ghost-edges" opacity="0.3">`
 * (deploy-layout.ts sets `ghost` after routing, AT-2609 AT-D). Group opacity
 * composites multiplicatively, so `opacity: 1 !important` on the hovered child
 * cannot lift it past the group. This spec measures what a reader actually sees.
 *
 * Not for merge — spike branch only.
 */
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";

const KRS = `system Shop {
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

/** Effective opacity a reader sees: the element's own times every ancestor's. */
async function effectiveOpacity(locator: import("@playwright/test").Locator): Promise<number> {
  return locator.evaluate((el) => {
    let o = 1;
    let n: Element | null = el;
    while (n !== null) {
      const v = Number.parseFloat(getComputedStyle(n).opacity);
      if (!Number.isNaN(v)) o *= v;
      n = n.parentElement;
    }
    return o;
  });
}

test.describe("SPIKE 2632 deploy edge hover", () => {
  test("deploy edges get a hit-line and hover dims peers", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS);
    await openViewTab(page, "Deploy");

    const edges = page.locator(".preview-container svg .krs-edge");
    await expect(edges).toHaveCount(2);

    // Every deploy edge now carries the wide transparent target.
    await expect(page.locator(".preview-container svg .krs-edge__hitline")).toHaveCount(2);
    // …and none of them advertise a right-click, because none is addressable.
    await expect(page.locator(".preview-container svg .krs-edge--interactive")).toHaveCount(0);
    await expect(page.locator(".preview-container svg [data-edge-canonical-id]")).toHaveCount(0);

    const focused = edges.nth(0);
    const peer = edges.nth(1);

    const before = {
      focused: await effectiveOpacity(focused),
      peer: await effectiveOpacity(peer),
    };

    await focused.hover();
    await expect(peer).toHaveCSS("opacity", "0.25");

    const after = {
      focused: await effectiveOpacity(focused),
      peer: await effectiveOpacity(peer),
    };

    const strokeWidth = await focused
      .locator("line:not(.krs-edge__hitline), polyline:not(.krs-edge__hitline)")
      .first()
      .evaluate((el) => getComputedStyle(el).strokeWidth);

    console.log("DEPLOY effective opacity", JSON.stringify({ before, after, strokeWidth }));
  });

  test("system view for comparison", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS);
    await openViewTab(page, "System");

    const edges = page.locator(".preview-container svg .krs-edge");
    await expect(edges).toHaveCount(2);

    const focused = edges.nth(0);
    const peer = edges.nth(1);
    const before = {
      focused: await effectiveOpacity(focused),
      peer: await effectiveOpacity(peer),
    };
    await focused.hover();
    await expect(peer).toHaveCSS("opacity", "0.25");
    const after = {
      focused: await effectiveOpacity(focused),
      peer: await effectiveOpacity(peer),
    };
    const strokeWidth = await focused
      .locator("line:not(.krs-edge__hitline), polyline:not(.krs-edge__hitline)")
      .first()
      .evaluate((el) => getComputedStyle(el).strokeWidth);
    console.log("SYSTEM effective opacity", JSON.stringify({ before, after, strokeWidth }));
  });
});
