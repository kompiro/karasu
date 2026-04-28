import { expect, test } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0029: System ↔ Deploy / Org cross-navigation.
 *
 * Covers the deterministic cross-navigation affordances:
 *  - AT-0029-01 / AT-0029-08: deploy cross-nav button is rendered for
 *    services that have a deploy container and omitted otherwise
 *  - AT-0029-02: clicking the deploy button switches to the Deploy tab
 *  - AT-0029-04: clicking the team button switches to the Org tab
 *  - AT-0029-11: clicking an owned-service link in an org team card
 *    switches back to the System tab
 *
 * Out of scope:
 *  - NodeDetailPanel deploy/org link scenarios (AT-0029-05..07) — the
 *    panel flow is already exercised by AT-0011
 *  - Highlight retention visual (AT-0029-02 highlight ring) — AI
 *    visual review
 *  - Zoom/pan suppression (AT-0029-09) — experiential
 *  - Sub-team cross-navigation (AT-0029-12) — keeping this spec focused
 */

const KRS = `system ECPlatform {
  label "ECプラットフォーム"

  service ECommerce {
    label "ECサイト"
  }
  service Payment {
    label "決済サービス"
  }
  service Legacy {
    label "旧システム"
  }

  ECommerce -> Payment "決済を処理する"
}

deploy "本番環境" {
  oci "order-api" {
    runtime "Node.js 20"
    realizes ECommerce
  }
  oci "payment-svc" {
    runtime "Go 1.22"
    realizes Payment
  }
}

organization Corp {
  team ecTeam {
    label "EC開発チーム"
    owns ECommerce
    owns Payment
  }
}
`;


test.describe("AT-0029 Cross-navigation", () => {
  test("deploy button exists on services with deploy containers and not others (AT-0029-01, AT-0029-08)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, KRS);

    await expect(page.locator('svg [data-deploy-button="ECommerce"]').first()).toBeAttached();
    await expect(page.locator('svg [data-deploy-button="Payment"]').first()).toBeAttached();
    await expect(page.locator('svg [data-deploy-button="Legacy"]')).toHaveCount(0);
  });

  test("clicking the deploy button switches to the Deploy tab (AT-0029-02)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, KRS);

    await page.locator('svg [data-deploy-button="ECommerce"]').first().click();
    await expect(page.getByRole("tab", { name: "Deploy", selected: true })).toBeVisible();
  });

  test("clicking the team button switches to the Org tab (AT-0029-04)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, KRS);

    await page.locator('svg [data-team-button="ecTeam"]').first().click();
    await expect(page.getByRole("tab", { name: "Org", selected: true })).toBeVisible();
  });

  test("clicking an owned-service link on the Org tab jumps back to System (AT-0029-11)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, KRS);

    await page.getByRole("tab", { name: "Org" }).click();
    await expect(page.getByRole("tab", { name: "Org", selected: true })).toBeVisible();

    await page.locator('svg [data-owned-service-button="ECommerce"]').first().click();
    await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();
  });
});
