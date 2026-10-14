import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Locator for a rendered edge by its canonical id (`data-edge-canonical-id`
 * on the edge group): the author id (`settlementFeed`) or the base id
 * (`A->B`). Only an edge an `edge#<id>` selector can address carries one, and
 * that is the edge the right-click menu opens for.
 */
export function edgeLocator(page: Page, canonicalId: string): Locator {
  return page.locator(`.preview-container svg [data-edge-canonical-id="${canonicalId}"]`);
}

/**
 * The fraction of the edge's length the pointer lands on. The midpoint is
 * where the renderer puts the label, which is a sibling of the stroke and
 * could take the hit; a third of the way along is still clear of the source
 * card on every layout the specs draw.
 */
const HIT_FRACTION = 0.35;

/**
 * Viewport coordinates of a point on the edge's own path. Clicking the group's
 * bounding-box centre misses an L-shaped or diagonal edge, so the point is read
 * off the transparent 14px hitline (`krs-edge__hitline`) that the renderer lays
 * under every edge, through the SVG's screen transform (the preview pans and
 * zooms).
 */
async function pointOnEdge(edge: Locator): Promise<{ x: number; y: number }> {
  await expect(edge).toHaveCount(1);
  return edge.evaluate((group, fraction) => {
    const hitline = group.querySelector(".krs-edge__hitline");
    if (!(hitline instanceof SVGGeometryElement)) {
      throw new Error("edge group has no .krs-edge__hitline");
    }
    const at = hitline.getPointAtLength(hitline.getTotalLength() * fraction);
    const ctm = hitline.getScreenCTM();
    if (!ctm) throw new Error("edge hitline has no screen transform");
    const p = new DOMPoint(at.x, at.y).matrixTransform(ctm);
    return { x: p.x, y: p.y };
  }, HIT_FRACTION);
}

/** Left-click an edge: opens the edge detail panel for an edge with a property block. */
export async function clickEdge(page: Page, canonicalId: string): Promise<void> {
  const { x, y } = await pointOnEdge(edgeLocator(page, canonicalId));
  await page.mouse.click(x, y);
}

/** Right-click an edge: opens the direction context menu (`EdgeContextMenu`). */
export async function rightClickEdge(page: Page, canonicalId: string): Promise<void> {
  const { x, y } = await pointOnEdge(edgeLocator(page, canonicalId));
  await page.mouse.click(x, y, { button: "right" });
}
