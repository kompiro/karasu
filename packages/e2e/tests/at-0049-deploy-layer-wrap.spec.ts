import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0049: Deploy diagram sibling-grid wrapping.
 *
 * Verifies that when a single layer contains many oci containers, they wrap
 * into a balanced grid (gridColumnCount: ceil(sqrt(n)) columns, capped at 5)
 * instead of extending the diagram horizontally, bounded by `MAX_LAYER_WIDTH`.
 * Uses 8 isolated services to land every container in layer 0, then inspects
 * the rendered `<g data-node-kind="oci">` bounding boxes via Playwright to
 * confirm the grid: 8 containers -> 3 columns -> rows of 3, 3, 2.
 *
 * Out of scope:
 *  - Exact layout pixel dimensions — the layout math is already covered by
 *    `deploy-layout.test.ts`. This spec only asserts the observable
 *    wrap-into-grid contract.
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

test.describe("AT-0049 Deploy diagram sibling-grid wrapping", () => {
  test("8 isolated containers in a single layer wrap into a balanced grid (3, 3, 2)", async ({
    page,
    opfs,
  }) => {
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

    // Group the containers into rows by their y (within half a container
    // height), ordered top to bottom.
    const rowHeight = boxes[0].height / 2;
    const rowYs: number[] = [];
    for (const b of boxes) {
      if (!rowYs.some((y) => Math.abs(y - b.y) <= rowHeight)) rowYs.push(b.y);
    }
    rowYs.sort((a, b) => a - b);
    const rows = rowYs.map((y) => boxes.filter((b) => Math.abs(b.y - y) <= rowHeight));

    // 8 containers auto-balance into ceil(sqrt(8)) = 3 columns, so the grid is
    // three sub-rows of 3, 3, 2 — not one wide row.
    expect(rows.map((r) => r.length)).toEqual([3, 3, 2]);

    // Every container is present across the rows (no drops).
    expect(rows.reduce((sum, r) => sum + r.length, 0)).toBe(8);

    // Each wrapped row restarts from the same left margin (within ~2px of
    // Playwright's rounding).
    const leftmosts = rows.map((r) => Math.min(...r.map((b) => b.x)));
    for (const left of leftmosts) {
      expect(Math.abs(left - leftmosts[0])).toBeLessThanOrEqual(2);
    }

    // Diagram width does not exceed the MAX_LAYER_WIDTH budget (+ padding).
    const diagramRight = Math.max(...boxes.map((b) => b.x + b.width));
    const diagramLeft = Math.min(...boxes.map((b) => b.x));
    expect(diagramRight - diagramLeft).toBeLessThanOrEqual(1300);
  });
});
