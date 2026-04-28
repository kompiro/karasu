import { expect, test } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0040: Top-level domain declarations.
 *
 * Verifies top-level `domain` parsing, the unassigned-domain warning,
 * and that domains nested inside services emit no warning.
 *
 * Out of scope:
 *  - TC-3 drill-down click — covered in spirit by AT-0054 (ghost edges)
 *    spec which also drills into a domain child; keeping this spec
 *    focused on declaration/warning surface area.
 */

const TOP_LEVEL_DOMAINS_KRS = `domain Payment { label "決済" }
domain Inventory { label "在庫" }

system ECPlatform {
  service ECommerce {
    label "ECサイト"
  }
}
`;

const DOMAIN_INSIDE_SERVICE_KRS = `system ECPlatform {
  service ECommerce {
    domain Order { label "注文" }
  }
}
`;


test.describe("AT-0040 Top-level domain declarations", () => {
  test("top-level domains render and emit unassigned warnings (TC-1, TC-2)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, TOP_LEVEL_DOMAINS_KRS);

    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).toContainText("ECサイト");
    await expect(preview).toContainText("決済");
    await expect(preview).toContainText("在庫");

    const warningPanel = page.locator(".warning-panel");
    await expect(warningPanel).toBeVisible();
    await expect(warningPanel).toContainText(/決済.*not assigned|not assigned.*決済/);
    await expect(warningPanel).toContainText(/在庫.*not assigned|not assigned.*在庫/);
  });

  test("domains nested inside services do not emit unassigned warnings (TC-4)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, DOMAIN_INSIDE_SERVICE_KRS);

    await page.waitForTimeout(500);
    const warningPanel = page.locator(".warning-panel");
    if ((await warningPanel.count()) > 0) {
      await expect(warningPanel).not.toContainText(/not assigned to any service/);
    }
  });
});
