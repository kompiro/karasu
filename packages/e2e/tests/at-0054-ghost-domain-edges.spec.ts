import { type Page, expect, test } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0054: Ghost domain edges in service drill-down view.
 *
 * Covers the deterministic parts of the AT:
 *  - Drilling into a service that contains a cross-service domain edge
 *    renders ghost node and ghost edge groups in the SVG
 *  - Drilling into the counterpart service also renders ghost groups
 *  - System view has no ghost groups
 *
 * Out of scope:
 *  - Visual attributes (opacity, amber-dashed styling) — handled by
 *    AI visual review of screenshots
 *  - Intra-service edge visual confirmation (Case 3)
 */

const DOMAIN_DRIFT_KRS = `system DriftSample {
  label "Domain Drift Sample"

  service OrderService {
    label "Order Service"

    domain OrderDomain {
      label "Order Domain"
      OrderDomain -> PaymentDomain "decides payment"
      OrderDomain -> ShippingDomain "triggers shipment"
    }

    domain ShippingDomain {
      label "Shipping Domain"
    }
  }

  service PaymentService {
    label "Payment Service"

    domain PaymentDomain {
      label "Payment Domain"
    }
  }
}
`;


async function drillInto(page: Page, nodeId: string) {
  await page.locator(`svg [data-node-id="${nodeId}"]`).first().click();
}

test.describe("AT-0054 Ghost domain edges", () => {
  test("system view has no ghost groups (Case 4)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, DOMAIN_DRIFT_KRS);

    await expect(page.locator("svg g.ghost-nodes")).toHaveCount(0);
    await expect(page.locator("svg g.ghost-edges")).toHaveCount(0);
  });

  test("drilling into the source service renders ghost groups (Case 1)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, DOMAIN_DRIFT_KRS);

    await drillInto(page, "OrderService");

    await expect(page.locator("svg g.ghost-nodes").first()).toBeAttached();
    await expect(page.locator("svg g.ghost-edges").first()).toBeAttached();
  });

  test("drilling into the target service also renders ghost groups (Case 2)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, DOMAIN_DRIFT_KRS);

    await drillInto(page, "PaymentService");

    await expect(page.locator("svg g.ghost-nodes").first()).toBeAttached();
    await expect(page.locator("svg g.ghost-edges").first()).toBeAttached();
  });
});
