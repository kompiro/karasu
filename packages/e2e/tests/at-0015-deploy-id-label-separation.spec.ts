import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * AT-0015: Deploy id/label separation.
 *
 * Verifies that deploy blocks and deploy nodes surface `label` when set
 * and fall back to the `id` otherwise. The legacy string-literal form is
 * also exercised to confirm backward compatibility.
 */

const SYSTEM_PRELUDE = `system ECPlatform {
  service ECommerce {
    label "ECサイト"
  }
}
`;

const WITH_LABELS = `${SYSTEM_PRELUDE}
deploy Production {
  label "本番環境"
  oci ecommerceApp {
    label "EC Application"
    runtime "Node.js 20"
    realizes ECommerce
  }
}
`;

const WITHOUT_LABELS = `${SYSTEM_PRELUDE}
deploy Production {
  oci ecommerceApp {
    runtime "Node.js 20"
    realizes ECommerce
  }
}
`;

const LEGACY_STRING_LITERAL = `${SYSTEM_PRELUDE}
deploy "本番環境" {
  oci "order-service" {
    runtime "Node.js 20"
    realizes ECommerce
  }
}
`;

test.describe("AT-0015 Deploy id/label separation", () => {
  test("renders label text when both id and label are set (AT-0015-1)", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, WITH_LABELS);
    await openViewTab(page, "Deploy");

    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).toContainText("本番環境");
    await expect(preview).toContainText("EC Application");
    // The raw identifiers should not leak into the rendering when labels
    // override them.
    await expect(preview).not.toContainText("ecommerceApp");
  });

  test("falls back to id when label is absent (AT-0015-2)", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, WITHOUT_LABELS);
    await openViewTab(page, "Deploy");

    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).toContainText("Production");
    await expect(preview).toContainText("ecommerceApp");
  });

  test("legacy string literal deploy syntax still works (AT-0015-3)", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, LEGACY_STRING_LITERAL);
    await openViewTab(page, "Deploy");

    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).toContainText("本番環境");
    await expect(preview).toContainText("order-service");

    // Any parse regression would surface as a warning item.
    const panel = page.locator(".warning-panel");
    if ((await panel.count()) > 0) {
      await expect(panel.locator(".warning-item")).toHaveCount(0);
    }
  });
});
