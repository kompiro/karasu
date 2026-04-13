import { type Page, expect, test } from "@playwright/test";

/**
 * AT-0053: Domain-to-domain dependency edges.
 *
 * Covers Case 1 (implicit service edge derivation + amber dashed style),
 * Case 2 (intra-service domain edge in drill-down), Case 3 (aggregated
 * "N domain edges" label), Case 4 (duplicate domain ID error), and
 * Case 5 (same ID across different systems is legal).
 *
 * Out of scope:
 *  - Case 6: style override via .krs.style file — requires editing a second
 *    file in the project which is not yet exposed through a stable test
 *    affordance. Handled by manual QA.
 */

const IMPLICIT_COLOR = "#F59E0B";
const DASHED_PATTERN = "8 4";

const BASE_KRS = `system DriftSample {
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

const AGGREGATED_KRS = `system DriftSample {
  service OrderService {
    domain OrderDomain {
      OrderDomain -> PaymentDomain "decides payment"
    }
    domain InvoiceDomain {
      InvoiceDomain -> LedgerDomain "posts invoice"
    }
  }
  service PaymentService {
    domain PaymentDomain {}
    domain LedgerDomain {}
  }
}
`;

const DUPLICATE_IN_SYSTEM_KRS = `system DriftSample {
  service OrderService {
    domain SharedDomain {}
  }
  service PaymentService {
    domain SharedDomain {}
  }
}
`;

const DUPLICATE_ACROSS_SYSTEMS_KRS = `system SystemA {
  service ServiceA {
    domain CommonDomain {}
  }
}
system SystemB {
  service ServiceB {
    domain CommonDomain {}
  }
}
`;

const UNIQUE_ERROR_PATTERN = /must be unique within a system/i;

async function replaceEditorContent(page: Page, content: string) {
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(content);
}

async function goToSystemTab(page: Page) {
  await page.getByRole("tab", { name: "System" }).click();
  await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();
}

test.describe("AT-0053 Domain-to-domain dependency edges", () => {
  test("cross-service domain edge becomes an amber dashed implicit service edge (Case 1)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, BASE_KRS);
    await goToSystemTab(page);

    await expect(page.locator('[data-node-id="OrderService"]')).toBeVisible();
    await expect(page.locator('[data-node-id="PaymentService"]')).toBeVisible();

    // The implicit edge exists: at least one line inside g.edges has the
    // amber stroke and dashed stroke-dasharray defined by the built-in
    // `edge[implicit]` style. SVG <line> elements don't get a visibility
    // bounding box, so assert presence via count.
    const implicitEdge = page.locator(
      `g.edges line[stroke="${IMPLICIT_COLOR}"][stroke-dasharray="${DASHED_PATTERN}"]`,
    );
    expect(await implicitEdge.count()).toBeGreaterThanOrEqual(1);

    // Label of the single domain edge is preserved.
    expect(
      await page.locator("g.edges text", { hasText: "decides payment" }).count(),
    ).toBeGreaterThanOrEqual(1);
  });

  test("intra-service domain edge renders in the service drill-down view (Case 2)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, BASE_KRS);
    await goToSystemTab(page);

    // Drill into OrderService. The node `<g>` is wrapped in an `<a>` when it
    // has children, so clicking navigates to the service-level view.
    await page.locator('[data-node-id="OrderService"]').click();

    // Breadcrumb confirms the drill-down transitioned to OrderService.
    await expect(page.locator(".breadcrumb-current")).toHaveText("Order Service");

    // Intra-service domain children render.
    await expect(page.locator('[data-node-id="OrderDomain"]')).toHaveCount(1);
    await expect(page.locator('[data-node-id="ShippingDomain"]')).toHaveCount(1);

    // Intra-service edge label is the original text.
    expect(
      await page.locator("g.edges text", { hasText: "triggers shipment" }).count(),
    ).toBeGreaterThanOrEqual(1);
  });

  test('multiple cross-service domain edges aggregate into a "N domain edges" label (Case 3)', async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, AGGREGATED_KRS);
    await goToSystemTab(page);

    await expect(page.locator('[data-node-id="OrderService"]')).toBeVisible();
    expect(
      await page.locator("g.edges text", { hasText: /\d+ domain edges/ }).count(),
    ).toBeGreaterThanOrEqual(1);
  });

  test("duplicate domain ID within a system surfaces a uniqueness error (Case 4)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, DUPLICATE_IN_SYSTEM_KRS);
    await goToSystemTab(page);

    await expect(
      page.locator(".diagnostic-banner__item", { hasText: UNIQUE_ERROR_PATTERN }),
    ).toHaveCount(1);
  });

  test("same domain ID in different systems does not error (Case 5)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, DUPLICATE_ACROSS_SYSTEMS_KRS);
    await goToSystemTab(page);

    // Both systems render — at least one of the services must be visible.
    await expect(page.locator('[data-node-id="ServiceA"]')).toBeVisible();
    await expect(
      page.locator(".diagnostic-banner__item", { hasText: UNIQUE_ERROR_PATTERN }),
    ).toHaveCount(0);
  });
});
