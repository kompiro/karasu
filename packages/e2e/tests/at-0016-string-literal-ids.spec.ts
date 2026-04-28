import { type Page, expect, test } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0016: String literal IDs for logical and organization nodes.
 *
 * Verifies that hyphenated string-literal IDs parse without warnings and
 * that node labels are surfaced in the preview. Also exercises the
 * `realizes` string literal cross-reference in a deploy block.
 *
 * Every scenario asserts that no warning panel appears, since these
 * sources are all supposed to be legal — any parser regression would
 * surface a warning immediately.
 */

const LOGICAL_HYPHENATED_KRS = `system "e-commerce" {
  label "ECサイト"
  service "order-service" {
    label "受注サービス"
  }
  service "payment-gateway" {
    label "決済サービス"
  }
  "order-service" --> "payment-gateway" "決済を呼び出す"
}
`;

const ORG_LITERAL_KRS = `system "e-commerce" {
  service "order-service" {
    label "受注サービス"
  }
  service "payment-gateway" {
    label "決済サービス"
  }
}

organization "dev-team" {
  label "開発チーム"
  team "backend-team" {
    label "バックエンド"
    owns "order-service"
    owns "payment-gateway"
    member "alice-smith" {
      label "Alice"
      github "alice-dev"
    }
  }
}
`;

const DEPLOY_REALIZES_LITERAL_KRS = `system "e-commerce" {
  service "order-service" {
    label "受注サービス"
  }
}

deploy Production {
  label "本番環境"
  oci "order-api" {
    runtime "Node.js 20"
    realizes "order-service"
  }
}
`;


async function expectNoWarnings(page: Page) {
  // Give the reactive pipeline a moment to settle then assert the panel
  // is either absent or free of any listed warnings.
  await page.waitForTimeout(500);
  const panel = page.locator(".warning-panel");
  if ((await panel.count()) > 0) {
    await expect(panel.locator(".warning-item")).toHaveCount(0);
  }
}

test.describe("AT-0016 String literal IDs", () => {
  test("logical nodes with hyphenated string literal IDs parse and render labels (AT-0016-1)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, LOGICAL_HYPHENATED_KRS);

    await expectNoWarnings(page);

    const preview = page.locator(".preview-pane, .preview-container, main").first();
    await expect(preview).toContainText("ECサイト");
    await expect(preview).toContainText("受注サービス");
    await expect(preview).toContainText("決済サービス");
  });

  test("organization/team/member with string literal IDs parse cleanly (AT-0016-2)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, ORG_LITERAL_KRS);

    await expectNoWarnings(page);
  });

  test("deploy realizes with string literal cross-reference parses cleanly (AT-0016-3)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, DEPLOY_REALIZES_LITERAL_KRS);

    await expectNoWarnings(page);

    // The Deploy tab should be enabled since a deploy block exists.
    await expect(page.getByRole("tab", { name: "Deploy" })).toBeEnabled();
  });
});
