import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootProjectApp } from "../fixtures/boot.js";
import { replaceEditorContent } from "../fixtures/editor.js";
import { drillInto } from "../fixtures/drill.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * AT-3178: the preview's zoom and pan belong to the diagram on screen.
 *
 * They were kept when the diagram changed, so a scale chosen to see a service's
 * twelve domains left a domain with two dozen use cases tiny or off screen
 * after a drill-down. Moving to another diagram (a drill, a tab) now starts at
 * the initial transform; an edit that re-renders the same diagram keeps it.
 */

const KRS = `system Shop {
  service Orders {
    domain Ordering {
      usecase PlaceOrder {}
      usecase CancelOrder {}
    }
  }
  service Billing
  Orders -> Billing "charges"
}

deploy Prod {
  oci "orders-api" { realizes Orders }
}
`;

const INITIAL = "translate(0px, 0px) scale(1)";

/** The inline transform of the preview's zoom layer. */
async function zoomTransform(page: Page): Promise<string> {
  return page
    .locator(".preview-container > div")
    .first()
    .evaluate((el) => (el as HTMLElement).style.transform);
}

/** Zoom out twice with the wheel over the preview. */
async function zoomOut(page: Page): Promise<void> {
  await page.locator(".preview-container").first().hover();
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => zoomTransform(page)).not.toBe(INITIAL);
}

test.describe("AT-3178 zoom and pan reset for another diagram", () => {
  test("a drill-down starts the new diagram at the initial zoom (AT-A)", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, KRS);
    await expect(page.locator('svg [data-node-id="Orders"]')).toBeVisible();

    await zoomOut(page);
    await drillInto(page, ["Orders"]);

    await expect.poll(() => zoomTransform(page)).toBe(INITIAL);
  });

  test("switching the view tab starts it at the initial zoom (AT-B)", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, KRS);
    await expect(page.locator('svg [data-node-id="Orders"]')).toBeVisible();

    await zoomOut(page);
    await openViewTab(page, "Deploy");
    await expect(page.locator('svg [data-realized-node-id="Orders"]')).toBeVisible();

    await expect.poll(() => zoomTransform(page)).toBe(INITIAL);
  });

  test("an edit that re-renders the same diagram keeps the zoom (AT-C)", async ({ page, opfs }) => {
    await bootProjectApp(page, opfs, KRS);
    await expect(page.locator('svg [data-node-id="Orders"]')).toBeVisible();

    await zoomOut(page);
    const zoomed = await zoomTransform(page);

    // A new label re-renders the same level: the view and the drill path stay.
    await replaceEditorContent(
      page,
      KRS.replace("service Billing", 'service Billing { label "Payments" }'),
    );
    await expect(page.locator("svg").getByText("Payments")).toBeVisible();

    await expect.poll(() => zoomTransform(page)).toBe(zoomed);
  });
});
