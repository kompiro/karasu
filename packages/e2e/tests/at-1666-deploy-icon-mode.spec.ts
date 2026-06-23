import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";

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
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, DEPLOY_KRS);

    await page.getByRole("tab", { name: "Deploy" }).click();
    await expect(page.getByRole("tab", { name: "Deploy", selected: true })).toBeVisible();

    // Sanity: the deploy units render as nodes in shape mode.
    await expect(page.locator('g[data-node-kind="oci"]')).toHaveCount(1);
    await expect(page.locator('g[data-node-kind="lambda"]')).toHaveCount(1);

    const iconButton = page.getByRole("button", { name: "Toggle icon mode" });
    await expect(iconButton).toBeVisible();
    await expect(iconButton).toHaveAttribute("aria-pressed", "false");

    // Capture markup before toggling so we can assert the deploy view actually
    // re-renders (the #1669 regression was a silent no-op).
    const diagram = page.locator("svg").first();
    const baselineMarkup = await diagram.innerHTML();

    await iconButton.click();
    await expect(iconButton).toHaveAttribute("aria-pressed", "true");

    // Deploy nodes must still be present and the SVG markup must change as the
    // units pick up icon-card frames / shape paths.
    await expect(page.locator('g[data-node-kind="oci"]')).toHaveCount(1);
    await expect(page.locator('g[data-node-kind="lambda"]')).toHaveCount(1);
    await expect.poll(() => diagram.innerHTML()).not.toBe(baselineMarkup);

    // Toggle back returns to shape mode.
    await iconButton.click();
    await expect(iconButton).toHaveAttribute("aria-pressed", "false");
  });
});
