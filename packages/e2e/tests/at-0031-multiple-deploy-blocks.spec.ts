import { expect, test } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0031: Multiple deploy blocks.
 *
 * Covers AT-0031-01 (no selector with a single block), AT-0031-02
 * (selector appears with multiple blocks), AT-0031-03 (switching the
 * selector updates the diagram), AT-0031-04 (option text uses block
 * labels), and AT-0031-05 (selection persists across tab switches).
 *
 * Out of scope:
 *  - AT-0031-06 (file-switch reset) — requires a multi-file project fixture
 *    that does not yet exist (#534).
 */

const MULTI_DEPLOY_KRS = `system MultiDeploy {
  service api {
    label "API"
  }
  service web {
    label "Web"
  }
}

deploy prod {
  label "本番環境"
  node prodApi [api]
  node prodWeb [web]
}

deploy staging {
  label "ステージング"
  node stgApi [api]
  node stgWeb [web]
}
`;

test.describe("AT-0031 Multiple deploy blocks", () => {
  test("no selector is shown when only one deploy block exists (AT-0031-01)", async ({ page }) => {
    await page.goto("/");

    // Default Getting Started project has a single `deploy Production` block.
    await page.getByRole("tab", { name: "Deploy" }).click();
    await expect(page.getByRole("tab", { name: "Deploy", selected: true })).toBeVisible();
    await expect(page.getByLabel("deploy block selector")).toHaveCount(0);
  });

  test("selector appears, switches diagram, and persists across tab switch (AT-0031-02/03/05)", async ({
    page,
  }) => {
    await page.goto("/");

    await replaceEditorContent(page, MULTI_DEPLOY_KRS);

    await page.getByRole("tab", { name: "Deploy" }).click();

    const selector = page.getByLabel("deploy block selector");
    await expect(selector).toBeVisible();

    // AT-0031-04: option text reflects block labels
    await expect(selector.locator("option")).toHaveText(["本番環境", "ステージング"]);
    // First block (prod) is selected by default
    await expect(selector).toHaveValue("prod");

    // AT-0031-03: switching the selector updates the active block
    await selector.selectOption("staging");
    await expect(selector).toHaveValue("staging");

    // AT-0031-05: selection persists across tab switches
    await page.getByRole("tab", { name: "System" }).click();
    await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();
    await page.getByRole("tab", { name: "Deploy" }).click();
    await expect(page.getByLabel("deploy block selector")).toHaveValue("staging");
  });
});
