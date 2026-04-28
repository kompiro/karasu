import { type Page, expect, test } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0011: Deploy node detail panel.
 *
 * Clicking a deploy unit in the Deploy view opens the NodeDetailPanel.
 * Deploy unit IDs in the rendered SVG are compound (`<service>::<unit>`),
 * so the selectors target those keys directly.
 *
 * Covers:
 *  - Deploy unit with runtime + realizes: panel surfaces label, runtime,
 *    realizes
 *  - Deploy unit without runtime + realizes: panel surfaces label only,
 *    no runtime prop row
 *  - System view click behavior is unaffected
 */

const KRS = `system ECPlatform {
  label "ECプラットフォーム"

  service ECommerce {
    label "ECサイト"
  }
  service Payment {
    label "決済サービス"
  }
}

deploy "本番環境" {
  oci "order-api" {
    runtime "Node.js 20"
    realizes ECommerce
  }
  lambda "mailer" {}
}
`;


async function openDeployTab(page: Page) {
  await page.getByRole("tab", { name: "Deploy" }).click();
  await expect(page.getByRole("tab", { name: "Deploy", selected: true })).toBeVisible();
}

test.describe("AT-0011 Deploy node detail panel", () => {
  test("clicking a deploy unit with runtime + realizes opens the detail panel", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, KRS);
    await openDeployTab(page);

    await page.locator('svg [data-node-id="ECommerce::order-api"]').first().click();

    const panel = page.locator(".node-detail-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("order-api");
    await expect(panel).toContainText(/runtime:\s*Node\.js 20/);
    await expect(panel).toContainText(/realizes/);
    await expect(panel).toContainText(/ECommerce|ECサイト/);
  });

  test("clicking a deploy unit without runtime/realizes omits those sections", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, KRS);
    await openDeployTab(page);

    // `mailer` is unassigned (no `realizes`), so the deploy layout keys
    // it by the bare unit id instead of the `<service>::<unit>` form.
    await page.locator('svg [data-node-id="mailer"]').first().click();

    const panel = page.locator(".node-detail-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("mailer");
    await expect(panel).not.toContainText(/runtime:/);
    await expect(panel).not.toContainText(/realizes:/);
  });

  test("system view click still opens the detail panel for a service", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, KRS);

    // Wait for the editor change to propagate into the rendered SVG before
    // clicking. The `決済サービス` label is unique to KRS — once it shows up
    // we know the seed's SVG has been replaced and clicks land on fresh
    // elements (rather than racing the re-render).
    await expect(page.locator("svg").first()).toContainText("決済サービス");

    await page.locator('svg [data-node-id="ECommerce"]').first().click();

    const panel = page.locator(".node-detail-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/ECommerce|ECサイト/);
    await expect(panel).not.toContainText(/runtime:/);
  });
});
