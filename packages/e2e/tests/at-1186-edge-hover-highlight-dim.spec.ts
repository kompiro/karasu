import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-1186: Hovering an interactive edge in the Preview SVG dims peer edges
 * to opacity 0.25; mouseleave restores them. Pure-CSS implementation in
 * `packages/app/src/styles/app.css` via the `:has()` parent selector — no
 * React state, no DOM mutation, so the effect survives SVG re-renders.
 *
 * Two cross-service domain edges are required to exercise the dim behavior:
 * the hovered edge stays at full opacity, the peer edge dims.
 */

const KRS_TWO_INTERACTIVE_EDGES = `system DriftSample {
  service OrderService {
    domain OrderDomain {
      OrderDomain -> PaymentDomain "decides payment"
      OrderDomain -> ShippingDomain "triggers shipment"
    }
  }
  service PaymentService {
    domain PaymentDomain {}
  }
  service ShippingService {
    domain ShippingDomain {}
  }
}
`;

async function goToSystemTab(page: Page) {
  await page.getByRole("tab", { name: "System" }).click();
  await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();
}

test.describe("AT-1186 Edge hover-highlight + dim peers", () => {
  test("hovering an interactive edge dims its peers (AT-A) and the focused edge keeps full opacity (AT-C)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, KRS_TWO_INTERACTIVE_EDGES);
    await goToSystemTab(page);

    // Two interactive edges — Order→Payment and Order→Shipping (both gain a
    // canonical id once they are aggregated up to the implicit service-edge
    // layer with `edge#<id>` selectors).
    const edges = page.locator(".preview-container svg [data-edge-canonical-id]");
    await expect(edges).toHaveCount(2);

    const focused = edges.nth(0);
    const peer = edges.nth(1);

    // Baseline: both edges render at full opacity.
    await expect(focused).toHaveCSS("opacity", "1");
    await expect(peer).toHaveCSS("opacity", "1");

    // Hover the first edge — peer should fade to 0.25, focused stays at 1.
    await focused.hover();
    await expect(peer).toHaveCSS("opacity", "0.25");
    await expect(focused).toHaveCSS("opacity", "1");
  });

  test("mouseleave restores peer edges to full opacity (AT-B)", async ({ page, opfs }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, KRS_TWO_INTERACTIVE_EDGES);
    await goToSystemTab(page);

    const edges = page.locator(".preview-container svg [data-edge-canonical-id]");
    await expect(edges).toHaveCount(2);

    const focused = edges.nth(0);
    const peer = edges.nth(1);

    await focused.hover();
    await expect(peer).toHaveCSS("opacity", "0.25");

    // Move the mouse far away from any edge so the :hover state clears.
    // The viewport corner (0, 0) is outside the diagram regardless of layout.
    await page.mouse.move(0, 0);
    await expect(peer).toHaveCSS("opacity", "1");
    await expect(focused).toHaveCSS("opacity", "1");
  });
});
