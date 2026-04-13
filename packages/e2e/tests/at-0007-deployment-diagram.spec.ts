import { type Page, expect, test } from "@playwright/test";

/**
 * AT-0007: Deployment diagram.
 *
 * Covers the deterministic behaviors:
 *  - AT-0007-01: Deploy tab is enabled when a deploy block exists
 *  - AT-0007-02: Switching to Deploy renders container labels for each service
 *  - AT-0007-05: Deploy tab is disabled (and non-interactive) when no deploy
 *    block is present
 *  - AT-0007-07: Both tabs carry icon + text labels
 *
 * Out of scope:
 *  - AT-0007-03 ghost edge visual attributes — AI visual review
 *  - AT-0007-04 cross-navigation on container click — needs a click target
 *    helper for deploy-layout SVG elements (#534)
 *  - AT-0007-06 zoom/pan — experiential
 *  - AT-0007-08 file-switch reset — needs multi-file fixture (#534)
 */

const NO_DEPLOY_KRS = `system ECPlatform {
  label "ECプラットフォーム"

  service ECommerce {
    label "ECサイト"
  }
  service Payment {
    label "決済サービス"
  }

  ECommerce -> Payment "決済を処理する"
}
`;

async function replaceEditorContent(page: Page, content: string) {
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(content);
}

test.describe("AT-0007 Deployment diagram", () => {
  test("both tabs display icon + text labels (AT-0007-07)", async ({ page }) => {
    await page.goto("/");

    const systemTab = page.getByRole("tab", { name: "System" });
    const deployTab = page.getByRole("tab", { name: "Deploy" });

    await expect(systemTab).toContainText("System");
    await expect(deployTab).toContainText("Deploy");
    await expect(systemTab).toContainText("⬡");
    await expect(deployTab).toContainText("⬢");
  });

  test("Deploy tab is enabled and renders deploy diagram (AT-0007-01, AT-0007-02)", async ({
    page,
  }) => {
    await page.goto("/");

    const deployTab = page.getByRole("tab", { name: "Deploy" });
    await expect(deployTab).toBeEnabled();
    await deployTab.click();
    await expect(page.getByRole("tab", { name: "Deploy", selected: true })).toBeVisible();

    // The Getting Started project's deploy block contains `ECommerce` and
    // `Payment` services — the rendered SVG should surface the service
    // labels as container text.
    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).toContainText(/ECommerce|ECサイト/);
  });

  test("Deploy tab is disabled when no deploy block exists (AT-0007-05)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, NO_DEPLOY_KRS);

    // Without a deploy block the tab is rendered as a non-interactive span
    // with aria-disabled=true and a tooltip.
    const deployTab = page.locator('[role="tab"][aria-disabled="true"]', { hasText: "Deploy" });
    await expect(deployTab).toBeVisible();
    await expect(deployTab).toHaveAttribute("title", /deploy ブロックがありません/);
  });
});
