import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * AT-3027: a mutual pair (`Web -> Api`, `Api -> Web`) is drawn as one line split
 * in halves. Each edge keeps its own group and hit-line on its own half, so
 * hovering one half focuses that edge and dims the other half, the same CSS
 * peer dim every edge gets (AT-1186). Each label starts with the arrow of its
 * own half.
 */

const KRS_MUTUAL_PAIR = `system Shop {
  service Web {
    -> Api "loads the catalog"
  }
  service Api {
    -> Web "pushes price updates"
  }
}
`;

test.describe("AT-3027 mutual pair drawn as one line", () => {
  test("hovering one half focuses its own edge and dims the other half", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS_MUTUAL_PAIR);
    await openViewTab(page, "System");

    const forward = page.locator(
      '.preview-container svg .krs-edge[data-edge-from="Web"][data-edge-to="Api"]',
    );
    const backward = page.locator(
      '.preview-container svg .krs-edge[data-edge-from="Api"][data-edge-to="Web"]',
    );
    await expect(forward).toHaveCount(1);
    await expect(backward).toHaveCount(1);

    // One line: the two halves start at the same split point.
    const start = (g: typeof forward) =>
      g.locator(".krs-edge__hitline").evaluate((el) => {
        const geom = el as SVGGeometryElement;
        const p = geom.getPointAtLength(0);
        return { x: Math.round(p.x), y: Math.round(p.y) };
      });
    expect(await start(forward)).toEqual(await start(backward));

    // A straight hit-line has a zero-height box, which Playwright never counts
    // as visible, so the pointer goes to the middle of the half on screen.
    const hoverHalf = async (g: typeof forward) => {
      const at = await g.locator(".krs-edge__hitline").evaluate((el) => {
        const geom = el as SVGGeometryElement;
        const p = geom.getPointAtLength(geom.getTotalLength() / 2);
        const screen = new DOMPoint(p.x, p.y).matrixTransform(geom.getScreenCTM()!);
        return { x: screen.x, y: screen.y };
      });
      await page.mouse.move(at.x, at.y);
    };

    // Each label carries the arrow of its own half; the authored text is kept.
    await expect(forward.locator("text")).toHaveText(/^[→↘↓↙←↖↑↗] loads the catalog$/);
    await expect(backward.locator("text")).toHaveText(/^[→↘↓↙←↖↑↗] pushes price updates$/);
    await expect(forward).toHaveAttribute("data-edge-label", "loads the catalog");

    await hoverHalf(forward);
    await expect(backward).toHaveCSS("opacity", "0.25");
    await expect(forward).toHaveCSS("opacity", "1");

    await page.mouse.move(0, 0);
    await hoverHalf(backward);
    await expect(forward).toHaveCSS("opacity", "0.25");
    await expect(backward).toHaveCSS("opacity", "1");
  });
});
