import { test, expect } from "../fixtures/opfs";

/**
 * AT-1921: single-container in-place expansion (system view).
 *
 * Covers the interactive round-trip that the unit tests cannot: expanding a
 * service in the live app shows its domains inside the service frame with the
 * connecting edges still attached, and the ⊖ control collapses it back.
 *
 * Coverage map (test name → AC bullets of docs/acceptance/1921-single-container-in-frame.md):
 *  - "⊕ expands a service in place; ⊖ collapses it back" → AC-4 (round-trip), AC-5 B1/B2
 */

const KRS = `system Shop {
  user Customer [human] { label "Customer" }

  service OrderService {
    label "Order Service"
    domain Cart { usecase AddItem }
    domain Fulfillment { usecase Ship }
  }
  service PaymentService {
    label "Payment Service"
    domain Billing { usecase Charge }
  }

  Customer -> OrderService "places order"
  OrderService -> PaymentService "pays"
}
`;

test.describe("AT-1921 in-place expansion", () => {
  test("⊕ expands a service in place; ⊖ collapses it back (AT-1921-01)", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "p", name: "P", files: { "index.krs": KRS } }],
      lastProjectId: "p",
    });
    await opfs.gotoApp();

    const control = () => page.locator('svg [data-expand-node="OrderService"]').first();
    const cart = () => page.locator('svg [data-node-id="Cart"]');
    // The connecting edge to the service is present in both states (re-anchored
    // to the frame when expanded) — "サービスに接続する edge を表示".
    const incomingEdge = () =>
      page.locator('svg [data-edge-from="Customer"][data-edge-to="OrderService"]');

    // Collapsed baseline: the service box carries a ⊕, no domains shown.
    await expect(control()).toBeAttached({ timeout: 15000 });
    await expect(cart()).toHaveCount(0);
    await expect(incomingEdge().first()).toBeAttached();

    // Expand: domains appear inside the frame, the connecting edge stays.
    await control().click();
    await expect(cart().first()).toBeAttached({ timeout: 10000 });
    await expect(page.locator('svg [data-node-id="Fulfillment"]').first()).toBeAttached();
    await expect(incomingEdge().first()).toBeAttached();

    // Collapse via the ⊖ on the frame: back to the service box, domains gone.
    await control().click();
    await expect(cart()).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('svg [data-node-id="OrderService"]').first()).toBeAttached();
    await expect(incomingEdge().first()).toBeAttached();
  });
});
