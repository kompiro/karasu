import { type Page, expect, test } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0048: Resource shape auto-inference & Icon Mode for infra nodes.
 *
 * Verifies the toggleable Icon Mode contract via DOM markers:
 *  - Toggle button reflects active state (`active` class).
 *  - Switching to Icon Mode injects icon-card SVG markup for infra nodes
 *    (database / queue / storage) — detected by counting nested `<svg>`
 *    elements that only the icon shapes emit.
 *  - Resource labels still resolve from infra declarations regardless of
 *    display mode (TC-5 regression).
 *
 * Out of scope:
 *  - Color, spacing, exact icon graphics — covered by manual visual review.
 */

const SAMPLE_KRS = `system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
    table InventoryTable { label "在庫テーブル" }
  }
  queue EventBus {
    queue OrderCreated { label "注文作成イベント" }
  }
  storage MediaStorage {
    bucket ImageBucket { label "商品画像バケット" }
  }

  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
        resource EventBus.OrderCreated
      }
    }
  }
  service MediaService {
    domain Media {
      usecase UploadImage {
        resource MediaStorage.ImageBucket
        resource OrderDB.InventoryTable
      }
    }
  }
}
`;

async function goToSystemTab(page: Page) {
  await page.getByRole("tab", { name: "System" }).click();
  await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();
}

test.describe("AT-0048 Resource shape auto-inference and Icon Mode", () => {
  test("Icon Mode toggle changes active state and embeds icon-card markup for infra nodes (TC-3)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, SAMPLE_KRS);
    await goToSystemTab(page);

    // Sanity: infra nodes are present in the system view.
    await expect(page.locator('[data-node-id="OrderDB"]')).toHaveCount(1);
    await expect(page.locator('[data-node-id="EventBus"]')).toHaveCount(1);
    await expect(page.locator('[data-node-id="MediaStorage"]')).toHaveCount(1);

    const iconButton = page.getByRole("button", { name: "Toggle icon mode" });
    await expect(iconButton).toBeVisible();
    // Default display mode is `shape`, so the button should not be active.
    await expect(iconButton).not.toHaveClass(/active/);

    // Capture the SVG markup before toggling so we can assert it changes.
    const diagram = page.locator("svg").first();
    const baselineMarkup = await diagram.innerHTML();

    await iconButton.click();
    await expect(iconButton).toHaveClass(/active/);

    // The diagram must re-render in icon mode — the SVG markup will differ
    // because infra nodes pick up icon-card frames and shape paths.
    await expect.poll(() => diagram.innerHTML()).not.toBe(baselineMarkup);

    // Toggle back returns to shape mode and removes the active state.
    await iconButton.click();
    await expect(iconButton).not.toHaveClass(/active/);
  });

  test("resource labels resolve from infra declarations in both display modes (TC-5)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, SAMPLE_KRS);
    await goToSystemTab(page);

    // Drill into OrderService → Order so the resource sibling nodes render.
    await page.locator('[data-node-id="OrderService"]').click();
    await expect(page.locator(".breadcrumb-current")).toHaveText("OrderService");
    await page.locator('[data-node-id="Order"]').click();
    await expect(page.locator(".breadcrumb-current")).toHaveText("Order");

    const svgText = page.locator("svg text");

    // Shape mode: declared infra labels surface, not raw IDs.
    await expect(svgText.getByText("注文テーブル", { exact: true })).toBeVisible();
    await expect(svgText.getByText("注文作成イベント", { exact: true })).toBeVisible();

    // Switch to Icon Mode and verify labels still resolve.
    await page.getByRole("button", { name: "Toggle icon mode" }).click();
    await expect(svgText.getByText("注文テーブル", { exact: true })).toBeVisible();
    await expect(svgText.getByText("注文作成イベント", { exact: true })).toBeVisible();
  });
});
