import { type Page, expect } from "@playwright/test";

/**
 * The structural fence for a diagram pane that goes through `PreviewPane`
 * (TPL-2800): the SVG sits inside `.preview-container` — the element the wheel
 * and drag handlers are bound to, and the one the fit rules
 * (`max-width/max-height: 100%`) are scoped to.
 *
 * Asserting the rendered diagram alone does not detect a pane that bypasses
 * `PreviewPane`: the diagram is still drawn, just without fit, zoom or pan.
 * That is how the entity (#2800) and org tab (#2799) panes shipped.
 *
 * `paneSelector` names one pane, e.g. `.preview-pane--org-tree`.
 */
export async function expectInSharedContainer(page: Page, paneSelector: string): Promise<void> {
  const pane = page.locator(paneSelector);
  await expect(pane).toBeVisible();
  const container = pane.locator(".preview-container");
  await expect(container).toHaveCount(1);
  await expect(container.locator("svg")).toBeVisible();
}

/**
 * The diagram is intrinsically wider than the pane, and is drawn no wider than
 * the pane. Both halves are asserted: the first is what keeps the second from
 * being trivially true for a diagram that was small enough to fit anyway, so
 * the fixture the caller boots has to be wide on purpose.
 */
export async function expectFitsPane(page: Page, paneSelector: string): Promise<void> {
  await expectInSharedContainer(page, paneSelector);
  const { intrinsic, drawn, paneWidth } = await page.locator(paneSelector).evaluate((el) => {
    const svg = el.querySelector(".preview-container svg") as SVGSVGElement;
    const vb = svg.getAttribute("viewBox")?.split(/\s+/) ?? [];
    return {
      intrinsic: Number(vb[2] ?? 0),
      drawn: svg.getBoundingClientRect().width,
      paneWidth: el.getBoundingClientRect().width,
    };
  });
  expect(intrinsic).toBeGreaterThan(paneWidth);
  expect(drawn).toBeLessThanOrEqual(paneWidth + 1);
}

/** The zoom/pan layer: the `<div>` inside `.preview-container` that carries `transform`. */
function zoomLayer(page: Page, paneSelector: string) {
  return page.locator(`${paneSelector} .preview-container > div`).first();
}

/** Wheel over the pane changes the zoom layer's transform. */
export async function expectWheelZooms(page: Page, paneSelector: string): Promise<void> {
  const layer = zoomLayer(page, paneSelector);
  await expect(layer).toBeVisible();
  const before = await layer.evaluate((el) => (el as HTMLElement).style.transform);

  await page.locator(`${paneSelector} .preview-container`).hover();
  await page.mouse.wheel(0, -200);

  await expect
    .poll(() => layer.evaluate((el) => (el as HTMLElement).style.transform))
    .not.toEqual(before);
}

/**
 * A press that moves past `PreviewPane`'s click threshold pans the diagram.
 *
 * The move is stepped because the handler only follows the pointer once the
 * mousedown's `isDragging` state has rendered; a single jump can land before
 * that and move nothing.
 */
export async function expectDragPans(page: Page, paneSelector: string): Promise<void> {
  const layer = zoomLayer(page, paneSelector);
  await expect(layer).toBeVisible();
  const before = await layer.evaluate((el) => (el as HTMLElement).style.transform);

  const box = await page.locator(`${paneSelector} .preview-container`).boundingBox();
  if (!box) throw new Error(`${paneSelector} .preview-container has no bounding box`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 80, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(() => layer.evaluate((el) => (el as HTMLElement).style.transform))
    .not.toEqual(before);
}
