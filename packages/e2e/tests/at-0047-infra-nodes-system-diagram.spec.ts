import { expect, test } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0047: Infra nodes (database/queue/storage) in the System diagram.
 *
 * Verifies that `database`, `queue`, and `storage` blocks render as
 * distinct nodes in the System view and that `data-node-id` selectors
 * pick them up. Drill-down into a service should hide infra nodes.
 *
 * Out of scope:
 *  - Visual shape/color assertions — handled by AI visual review
 *  - Explicit-edge precedence case — relies on visual edge inspection
 */

const INFRA_KRS = `system ECPlatform {
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
      usecase CancelOrder {
        resource OrderDB.InventoryTable
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

test.describe("AT-0047 Infra nodes in System diagram", () => {
  test("database, queue and storage blocks render as System-level nodes", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, INFRA_KRS);

    for (const id of ["OrderDB", "EventBus", "MediaStorage", "OrderService", "MediaService"]) {
      await expect(page.locator(`svg [data-node-id="${id}"]`).first()).toBeAttached();
    }

    // Any parse regression would surface as a warning item.
    const panel = page.locator(".warning-panel");
    if ((await panel.count()) > 0) {
      await expect(panel.locator(".warning-item")).toHaveCount(0);
    }
  });

  test("drilling into OrderService hides System-level infra nodes", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, INFRA_KRS);

    await page.locator('svg [data-node-id="OrderService"]').first().click();

    // Infra nodes only appear at the system level.
    await expect(page.locator('svg [data-node-id="OrderDB"]')).toHaveCount(0);
    await expect(page.locator('svg [data-node-id="EventBus"]')).toHaveCount(0);
    await expect(page.locator('svg [data-node-id="MediaStorage"]')).toHaveCount(0);
  });
});
