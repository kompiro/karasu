import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0049: Deploy diagram layer width wrapping.
 *
 * Verifies that when a single layer contains more oci containers than fit
 * inside `MAX_LAYER_WIDTH`, the overflow wraps to a second sub-row instead of
 * extending the diagram horizontally. Uses 8 isolated services to land every
 * container in layer 0, then inspects the rendered `<g data-node-kind="oci">`
 * bounding boxes via Playwright to confirm row-wrap behavior.
 *
 * Out of scope:
 *  - Exact layout pixel dimensions — the layout math is already covered by
 *    `deploy-layout.test.ts`. This spec only asserts the observable
 *    wrap-into-sub-row contract.
 */

const WRAP_KRS = `system WrapSample {
  service S1 { label "Service 1" }
  service S2 { label "Service 2" }
  service S3 { label "Service 3" }
  service S4 { label "Service 4" }
  service S5 { label "Service 5" }
  service S6 { label "Service 6" }
  service S7 { label "Service 7" }
  service S8 { label "Service 8" }
}

deploy "Production" {
  oci "s1" { realizes "S1" }
  oci "s2" { realizes "S2" }
  oci "s3" { realizes "S3" }
  oci "s4" { realizes "S4" }
  oci "s5" { realizes "S5" }
  oci "s6" { realizes "S6" }
  oci "s7" { realizes "S7" }
  oci "s8" { realizes "S8" }
}
`;

test.describe("AT-0049 Deploy diagram layer width wrapping", () => {
  test("8 isolated containers in a single layer wrap into two sub-rows", async ({ page, opfs }) => {
    await opfs.seed({ mode: "memory" });

    await opfs.gotoApp();
    await replaceEditorContent(page, WRAP_KRS);

    await page.getByRole("tab", { name: "Deploy" }).click();
    await expect(page.getByRole("tab", { name: "Deploy", selected: true })).toBeVisible();

    const ociNodes = page.locator('g[data-node-kind="oci"]');
    await expect(ociNodes).toHaveCount(8);

    // Collect bounding boxes in document order and verify wrap behavior.
    const count = await ociNodes.count();
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (let i = 0; i < count; i++) {
      const box = await ociNodes.nth(i).boundingBox();
      if (!box) throw new Error(`bounding box missing for oci node #${i}`);
      boxes.push(box);
    }

    // Row 1 is defined by the y of the first container (S1). Row 2 nodes must
    // sit below with a clear gap (> half the container height).
    const row1Y = boxes[0].y;
    const rowGap = boxes[0].height / 2;

    const row1 = boxes.filter((b) => Math.abs(b.y - row1Y) <= rowGap);
    const row2 = boxes.filter((b) => b.y - row1Y > rowGap);

    // With the default MAX_LAYER_WIDTH (1200px) and ~200px container width,
    // the first 5 containers fit on row 1 and the next 3 wrap to row 2.
    expect(row1.length).toBe(5);
    expect(row2.length).toBe(3);

    // Every container on every row must be present (no drops).
    expect(row1.length + row2.length).toBe(8);

    // Wrapped row restarts from the left margin: the first row-2 container
    // shares its x-position with the first row-1 container (within ~2px of
    // Playwright's rounding).
    const row1Leftmost = Math.min(...row1.map((b) => b.x));
    const row2Leftmost = Math.min(...row2.map((b) => b.x));
    expect(Math.abs(row2Leftmost - row1Leftmost)).toBeLessThanOrEqual(2);

    // Diagram width does not exceed the MAX_LAYER_WIDTH budget (+ padding).
    const diagramRight = Math.max(...boxes.map((b) => b.x + b.width));
    const diagramLeft = Math.min(...boxes.map((b) => b.x));
    expect(diagramRight - diagramLeft).toBeLessThanOrEqual(1300);
  });
});
