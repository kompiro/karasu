import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab, setDisplayMode } from "../fixtures/tabs.js";

/**
 * AT-1666: Icon Mode renders icons on the deploy view.
 *
 * `at-0048-resource-shape-icon-mode.spec.ts` covers Icon Mode on the
 * system/resource view only. Toggling Icon Mode on a `deploy` diagram was a
 * no-op (#1669 regression: the renderer's style lookup missed because deploy
 * layout keys nodes as `containerId::unitId`). The core fix is unit-tested in
 * `deploy-renderer.test.ts`; this spec closes the manual AC-3 by verifying the
 * deploy view actually re-renders with icon markup when Icon Mode is toggled.
 *
 * Out of scope:
 *  - Exact icon graphics / colors — covered by manual visual review.
 */

const DEPLOY_KRS = `system EC {
  service ECommerce { label "EC" }
  service Payment { label "Payment" }
}
deploy Prod {
  oci ecommerceApp {
    runtime "Node.js 20"
    realizes ECommerce
  }
  lambda paymentFn {
    runtime "Node.js 20"
    realizes Payment
  }
}
`;

test.describe("AT-1666 Deploy view Icon Mode", () => {
  test("toggling Icon Mode re-renders deploy unit nodes with icon markup", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, DEPLOY_KRS);

    await openViewTab(page, "Deploy");

    // Sanity: the deploy units render as nodes in shape mode.
    await expect(page.locator('g[data-node-kind="oci"]')).toHaveCount(1);
    await expect(page.locator('g[data-node-kind="lambda"]')).toHaveCount(1);

    // Capture markup before switching so we can assert the deploy view actually
    // re-renders (the #1669 regression was a silent no-op).
    const diagram = page.locator("svg").first();
    const baselineMarkup = await diagram.innerHTML();

    // Icon mode is reached from Settings since #2376.
    await setDisplayMode(page, "icon");

    // Deploy nodes must still be present and the SVG markup must change as the
    // units pick up icon-card frames / shape paths.
    await expect(page.locator('g[data-node-kind="oci"]')).toHaveCount(1);
    await expect(page.locator('g[data-node-kind="lambda"]')).toHaveCount(1);
    await expect.poll(() => diagram.innerHTML()).not.toBe(baselineMarkup);
    const iconMarkup = await diagram.innerHTML();

    // Switching back returns to shape mode.
    await setDisplayMode(page, "shape");
    await expect.poll(() => diagram.innerHTML()).not.toBe(iconMarkup);
  });
});
