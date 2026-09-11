import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";

/**
 * AT-2800: the entity sub-mode reads through the shared preview pane.
 *
 * Until #2800 the entity view injected its SVG into a bare `overflow: auto`
 * div, making it the one diagram surface outside `.preview-container` — so it
 * never got `max-width/max-height: 100%` (no fit-to-pane) and never reached
 * `PreviewPane`'s wheel/drag handlers (no zoom, no pan — #2799). On a real
 * model that is not cosmetic: Dify's `IdentityAccess` entity view is 36,053px
 * wide, which in a scroll-only pane cannot be seen whole at all.
 *
 * The entity view is deliberately wide here (eight entities on one row) so
 * "fits the pane" is a real assertion rather than a trivially-true one.
 */
const WIDE_ENTITY_KRS = `system EC {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {}
      entity Order {
        Order -> LineItem "has"
      }
      entity LineItem {}
      entity Customer {}
      entity Address {}
      entity Payment {}
      entity Shipment {}
      entity Coupon {}
      entity Invoice {}
    }
  }
}
`;

async function drillIntoOrderingDomain(page: Page) {
  await page.locator('svg [data-node-id="OrderService"]').first().click();
  await page.locator('svg [data-node-id="Ordering"]').first().click();
}

const entityToggle = (page: Page) => page.getByRole("button", { name: "Toggle entity view" });

test.describe("AT-2800 Entity view pane layout", () => {
  test("the entity SVG sits in .preview-container and is scaled to fit the pane", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, WIDE_ENTITY_KRS);
    await drillIntoOrderingDomain(page);
    await entityToggle(page).click();

    const pane = page.locator(".preview-pane--entity");
    await expect(pane).toBeVisible();

    // The structural fence: the SVG is inside the shared container, which is
    // both what carries the fit rules and what the zoom listener is bound to.
    const container = pane.locator(".preview-container");
    await expect(container).toHaveCount(1);
    await expect(container.locator("svg")).toBeVisible();

    // The intrinsic diagram is wider than the pane, and it is drawn narrower
    // than the pane rather than overflowing it.
    const { intrinsic, drawn, paneWidth } = await pane.evaluate((el) => {
      const svg = el.querySelector("svg") as SVGSVGElement;
      const vb = svg.getAttribute("viewBox")?.split(/\s+/) ?? [];
      return {
        intrinsic: Number(vb[2] ?? 0),
        drawn: svg.getBoundingClientRect().width,
        paneWidth: el.getBoundingClientRect().width,
      };
    });
    expect(intrinsic).toBeGreaterThan(paneWidth);
    expect(drawn).toBeLessThanOrEqual(paneWidth + 1);
  });

  test("wheel over the entity view zooms it (#2799)", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, WIDE_ENTITY_KRS);
    await drillIntoOrderingDomain(page);
    await entityToggle(page).click();

    const zoomLayer = page.locator(".preview-pane--entity .preview-container > div").first();
    await expect(zoomLayer).toBeVisible();
    const before = await zoomLayer.evaluate((el) => (el as HTMLElement).style.transform);

    await page.locator(".preview-pane--entity .preview-container").hover();
    await page.mouse.wheel(0, -200);

    await expect
      .poll(() => zoomLayer.evaluate((el) => (el as HTMLElement).style.transform))
      .not.toEqual(before);
  });

  test("the usecase view keeps its own zoom when the sub-mode is toggled off", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, WIDE_ENTITY_KRS);
    await drillIntoOrderingDomain(page);

    await entityToggle(page).click();
    await expect(page.locator(".preview-pane--entity")).toBeVisible();
    await entityToggle(page).click();
    await expect(page.locator(".preview-pane--entity")).toHaveCount(0);

    const zoomLayer = page.locator(".preview-container > div").first();
    const before = await zoomLayer.evaluate((el) => (el as HTMLElement).style.transform);
    await page.locator(".preview-container").hover();
    await page.mouse.wheel(0, -200);
    await expect
      .poll(() => zoomLayer.evaluate((el) => (el as HTMLElement).style.transform))
      .not.toEqual(before);
  });
});
