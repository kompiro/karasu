import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0007: Deployment diagram.
 *
 * Covers the deterministic behaviors:
 *  - AT-0007-01: Deploy tab is enabled when a deploy block exists
 *  - AT-0007-02: Switching to Deploy renders container labels for each service
 *  - AT-0007-05: Deploy tab is always enabled; switching with no deploy block
 *    renders an empty-state placeholder SVG (#812)
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

test.describe("AT-0007 Deployment diagram", () => {
  test("both tabs display icon + text labels (AT-0007-07)", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();

    const systemTab = page.getByRole("tab", { name: "System" });
    const deployTab = page.getByRole("tab", { name: "Deploy" });

    await expect(systemTab).toContainText("System");
    await expect(deployTab).toContainText("Deploy");
    await expect(systemTab).toContainText("⬡");
    await expect(deployTab).toContainText("⬢");
  });

  test("Deploy tab is enabled and renders deploy diagram (AT-0007-01, AT-0007-02)", async ({
    page,
    opfs,
  }) => {
    await opfs.reset();
    await opfs.gotoApp();

    const deployTab = page.getByRole("tab", { name: "Deploy" });
    await expect(deployTab).toBeEnabled();
    await deployTab.click();
    await expect(page.getByRole("tab", { name: "Deploy", selected: true })).toBeVisible();

    // The Getting Started project's deploy block contains the EC service —
    // its rendered label varies by locale-matched seed (Japanese seed: ECサイト,
    // English seed: EC Site). The raw id `ECommerce` also appears as text in
    // the cross-system seed. Accept any of them.
    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).toContainText(/ECommerce|ECサイト|EC Site/);
  });

  test("Deploy tab stays enabled and renders empty-state placeholder when no deploy block (AT-0007-05)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, NO_DEPLOY_KRS);

    // Behavior change in #812: rather than disabling the Deploy tab, we now
    // keep it interactive and render an empty-state placeholder SVG when no
    // deploy block exists. The placeholder text is locale-aware.
    const deployTab = page.getByRole("tab", { name: "Deploy" });
    await expect(deployTab).toBeEnabled();
    await deployTab.click();
    await expect(page.getByRole("tab", { name: "Deploy", selected: true })).toBeVisible();

    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).toContainText(
      /No deploy block defined|deploy ブロックが定義されていません/,
    );
  });
});
