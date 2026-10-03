import { type Page, expect } from "@playwright/test";

/**
 * Locator for a rendered node by its author id.
 *
 * The renderer stamps `data-node-id` on the node group; `.first()` picks the
 * canvas copy when the same id is drawn more than once (a root drawn per
 * system, #2917; a ghost node in a drill-down, AT-0054).
 */
export function nodeLocator(page: Page, nodeId: string) {
  return page.locator(`svg [data-node-id="${nodeId}"]`).first();
}

export interface DrillOptions {
  /**
   * Assert `.breadcrumb-current` equals each id after its click. Use when the
   * ids are also the labels (the default label) and the spec reads the view
   * right after the drill; the assertion is what makes the next step wait
   * for the re-render instead of racing it.
   */
  readonly expectBreadcrumb?: boolean;
}

/**
 * Drill through a chain of nodes (service → domain → ...) by clicking each
 * one in turn. Replaces the per-spec `drillIntoOrderingDomain` /
 * `drillIntoOrderDomain` / `drillInto` helpers that each clicked
 * `svg [data-node-id=...]` (#3040).
 *
 * Playwright's auto-wait on the next locator is what sequences the clicks:
 * the child node exists only after the parent's drill-down has rendered.
 */
export async function drillInto(
  page: Page,
  path: readonly string[],
  options: DrillOptions = {},
): Promise<void> {
  for (const nodeId of path) {
    await nodeLocator(page, nodeId).click();
    if (options.expectBreadcrumb) {
      await expect(page.locator(".breadcrumb-current")).toHaveText(nodeId);
    }
  }
}
