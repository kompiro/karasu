import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-1658: deploy view service→infra dependency (ghost) edge placement.
 *
 * The core derivation (`deriveInfraEdges` / `extractDeployView`) is unit-tested
 * in `deploy-view-extract.test.ts`. The manual AC that remained was the *SVG
 * placement* — that the ghost edge actually renders in the app and routes
 * downward from the service container to the infra container. This spec closes
 * that gap at the browser level, inspecting `data-edge-from`/`data-edge-to`
 * markers and container `boundingBox`es (same approach as `at-0049-*`).
 *
 * Out of scope:
 *  - Exact line geometry / connection points — covered by manual visual review.
 */

// A service whose usecase references shared infra (`resource OrderDB.OrderTable`),
// with both the service and the database realized in the deploy block. This is
// the canonical shared-store pattern from the AT-1658 manual step.
const INFRA_EDGE_KRS = `system EC {
  service ECommerce {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
      }
    }
  }
  database OrderDB {
    table OrderTable {}
  }
}
deploy Prod {
  oci ecommerceApp {
    runtime "Node.js 20"
    realizes ECommerce
  }
  store orderStore {
    type "Aurora PostgreSQL 15"
    realizes OrderDB
  }
}
`;

test.describe("AT-1658 Deploy view service→infra dependency edges", () => {
  test("renders a ghost edge from the service container down to the realized infra container", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, INFRA_EDGE_KRS);

    await page.getByRole("tab", { name: "Deploy" }).click();
    await expect(page.getByRole("tab", { name: "Deploy", selected: true })).toBeVisible();

    // Both realized containers must be present in the deploy view.
    const serviceContainer = page.locator('[data-container-id="ECommerce"]');
    const infraContainer = page.locator('[data-container-id="OrderDB"]');
    await expect(serviceContainer).toHaveCount(1);
    await expect(infraContainer).toHaveCount(1);

    // The service→infra ghost edge is keyed by the realized service / infra ids.
    const ghostEdge = page.locator('[data-edge-from="ECommerce"][data-edge-to="OrderDB"]');
    await expect(ghostEdge).toHaveCount(1);

    // Placement: the infra container sits *below* the service container, so the
    // dependency edge routes downward (deploy layout stacks dependents above
    // their stores). Compare bounding boxes rather than asserting pixels.
    const serviceBox = await serviceContainer.boundingBox();
    const infraBox = await infraContainer.boundingBox();
    if (!serviceBox || !infraBox) throw new Error("container bounding box missing");

    expect(infraBox.y).toBeGreaterThan(serviceBox.y);
    // A clear vertical gap (no overlap) — the infra container starts below the
    // service container's bottom edge.
    expect(infraBox.y).toBeGreaterThanOrEqual(serviceBox.y + serviceBox.height / 2);
  });
});
