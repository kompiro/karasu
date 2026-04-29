import { type Page, expect, test } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0049: Resource nodes in the domain-level UseCase diagram.
 *
 * Drills into OrderService→Order and verifies that dot-notation `resource`
 * references (table/queue/bucket) surface as sibling nodes, labels resolve
 * from the infra declaration, and duplicates across usecases collapse into a
 * single resource node while keeping distinct edges.
 *
 * Out of scope:
 *  - Node shape/visual rendering — covered by manual visual review.
 */

const BASE_KRS = `system ECPlatform {
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

const SHARED_KRS = `system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
  }
  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource OrderDB.OrderTable
      }
      usecase UpdateOrder {
        resource OrderDB.OrderTable
      }
    }
  }
}
`;

const INLINE_KRS = `system ECPlatform {
  service OrderService {
    domain Order {
      usecase PlaceOrder {
        resource UnassignedTable { label "未割り当て" }
      }
    }
  }
}
`;

async function drillIntoOrderDomain(page: Page) {
  await page.getByRole("tab", { name: "System" }).click();
  await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();
  await page.locator('[data-node-id="OrderService"]').click();
  await expect(page.locator(".breadcrumb-current")).toHaveText("OrderService");
  await page.locator('[data-node-id="Order"]').click();
  await expect(page.locator(".breadcrumb-current")).toHaveText("Order");
}

test.describe("AT-0049 Resource nodes in domain-level UseCase diagram", () => {
  test("table, queue, and bucket resources render as sibling nodes with infra labels", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, BASE_KRS);
    await drillIntoOrderDomain(page);

    // Usecase nodes.
    await expect(page.locator('[data-node-id="PlaceOrder"]')).toHaveCount(1);
    await expect(page.locator('[data-node-id="CancelOrder"]')).toHaveCount(1);

    // Dot-notation resource siblings — each appears exactly once even though
    // PlaceOrder and CancelOrder both reference OrderDB.*
    await expect(page.locator('[data-node-id="OrderDB.OrderTable"]')).toHaveCount(1);
    await expect(page.locator('[data-node-id="EventBus.OrderCreated"]')).toHaveCount(1);
    await expect(page.locator('[data-node-id="OrderDB.InventoryTable"]')).toHaveCount(1);

    // Labels come from the table/queue declaration, not the raw ID.
    // Scope to SVG `<text>` so the editor's mirrored source text is ignored.
    const svgText = page.locator("svg text");
    await expect(svgText.getByText("注文テーブル", { exact: true })).toBeVisible();
    await expect(svgText.getByText("在庫テーブル", { exact: true })).toBeVisible();
    await expect(svgText.getByText("注文作成イベント", { exact: true })).toBeVisible();

    // At least three usecase → resource edges (PlaceOrder has 2, CancelOrder has 1).
    expect(await page.locator("g.edges line").count()).toBeGreaterThanOrEqual(3);
  });

  test("shared resource across usecases deduplicates to one node with two incoming edges", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, SHARED_KRS);
    await drillIntoOrderDomain(page);

    await expect(page.locator('[data-node-id="PlaceOrder"]')).toHaveCount(1);
    await expect(page.locator('[data-node-id="UpdateOrder"]')).toHaveCount(1);
    await expect(page.locator('[data-node-id="OrderDB.OrderTable"]')).toHaveCount(1);

    // One resource node + two incoming edges from the two usecases.
    expect(await page.locator("g.edges line").count()).toBeGreaterThanOrEqual(2);
  });

  test("inline (unassigned) resources without dot-notation refs are not promoted to siblings", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, INLINE_KRS);
    await drillIntoOrderDomain(page);

    await expect(page.locator('[data-node-id="PlaceOrder"]')).toHaveCount(1);
    // `UnassignedTable` is inline inside the usecase and has no dot-notation
    // reference, so it must NOT appear as a sibling node in the domain view.
    await expect(page.locator('[data-node-id="UnassignedTable"]')).toHaveCount(0);
  });
});
