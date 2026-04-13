import { type Page, expect, test } from "@playwright/test";

/**
 * AT-0054: Deprecated domain migration annotations.
 *
 * Covers Case 1 (error suppression for annotated duplicate), Case 2 (edges on
 * both services resolve), Case 4 (unannotated duplicates still error), and
 * Case 5 (order independence).
 *
 * Out of scope for this spec (issue #558):
 *  - Case 3: visual distinction — handled by manual visual review.
 *  - Cases 6/7: navigation priority — no deterministic UI affordance yet.
 */

const ANNOTATED_KRS = `system OrderSystem {
  service LegacyService {
    label "Legacy Service"
    domain Contract @deprecated {
      label "Contract (deprecated)"
      -> Billing
    }
  }
  service NewService {
    label "New Service"
    domain Contract @migration_target {
      label "Contract"
      -> Billing
    }
  }
  service BillingService {
    label "Billing Service"
    domain Billing {
      label "Billing"
    }
  }
}
`;

const UNANNOTATED_DUPLICATE_KRS = `system OrderSystem {
  service A {
    domain Contract {}
  }
  service B {
    domain Contract {}
  }
}
`;

const SWAPPED_ORDER_KRS = `system OrderSystem {
  service NewService {
    domain Contract @migration_target {
      -> Billing
    }
  }
  service LegacyService {
    domain Contract @deprecated {
      -> Billing
    }
  }
  service BillingService {
    domain Billing {}
  }
}
`;

const UNIQUE_ERROR_PATTERN = /must be unique within a system/i;

async function replaceEditorContent(page: Page, content: string) {
  // Click the visible code area to focus the editor — Monaco's `inputarea`
  // textarea sits behind the view layer and is not directly clickable.
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(content);
}

async function goToSystemTab(page: Page) {
  await page.getByRole("tab", { name: "System" }).click();
  await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();
}

test.describe("AT-0054 Deprecated domain migration annotations", () => {
  test("annotated duplicate produces no uniqueness error and both edges resolve (Case 1/2)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, ANNOTATED_KRS);
    await goToSystemTab(page);

    // Case 1: Diagnostics banner must not report the uniqueness error.
    // Wait for the diagram to settle before asserting absence.
    await expect(page.locator('[data-node-id="LegacyService"]')).toBeVisible();
    await expect(
      page.locator(".diagnostic-banner__item", { hasText: UNIQUE_ERROR_PATTERN }),
    ).toHaveCount(0);

    // Case 2: both services and the target render, and the system diagram
    // draws at least two edges (Legacy→Billing + New→Billing derive from the
    // implicit service-level edges produced by the two `Contract -> Billing`
    // references).
    await expect(page.locator('[data-node-id="NewService"]')).toBeVisible();
    await expect(page.locator('[data-node-id="BillingService"]')).toBeVisible();
    const edgeLines = page.locator("g.edges line");
    await expect(edgeLines).not.toHaveCount(0);
    expect(await edgeLines.count()).toBeGreaterThanOrEqual(2);
  });

  test("unannotated duplicate still emits uniqueness error (Case 4)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, UNANNOTATED_DUPLICATE_KRS);
    await goToSystemTab(page);

    await expect(
      page.locator(".diagnostic-banner__item", { hasText: UNIQUE_ERROR_PATTERN }),
    ).toHaveCount(1);
  });

  test("swapping migration_target before deprecated keeps the duplicate legal (Case 5)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, SWAPPED_ORDER_KRS);
    await goToSystemTab(page);

    await expect(page.locator('[data-node-id="LegacyService"]')).toBeVisible();
    await expect(page.locator('[data-node-id="NewService"]')).toBeVisible();
    await expect(
      page.locator(".diagnostic-banner__item", { hasText: UNIQUE_ERROR_PATTERN }),
    ).toHaveCount(0);

    const edgeLines = page.locator("g.edges line");
    expect(await edgeLines.count()).toBeGreaterThanOrEqual(2);
  });
});
