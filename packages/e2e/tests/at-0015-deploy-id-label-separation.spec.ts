import { type Page, expect, test } from "@playwright/test";

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

async function replaceEditorContent(page: Page, content: string) {
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(content);
}

async function openDeployTab(page: Page) {
  await page.getByRole("tab", { name: "Deploy" }).click();
  await expect(page.getByRole("tab", { name: "Deploy", selected: true })).toBeVisible();
}

test.describe("AT-0015 Deploy id/label separation", () => {
  test("renders label text when both id and label are set (AT-0015-1)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, WITH_LABELS);
    await openDeployTab(page);

    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).toContainText("本番環境");
    await expect(preview).toContainText("EC Application");
    // The raw identifiers should not leak into the rendering when labels
    // override them.
    await expect(preview).not.toContainText("ecommerceApp");
  });

  test("falls back to id when label is absent (AT-0015-2)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, WITHOUT_LABELS);
    await openDeployTab(page);

    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).toContainText("Production");
    await expect(preview).toContainText("ecommerceApp");
  });

  test("legacy string literal deploy syntax still works (AT-0015-3)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, LEGACY_STRING_LITERAL);
    await openDeployTab(page);

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
