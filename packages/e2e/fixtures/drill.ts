import { type Page, expect } from "@playwright/test";

export interface NodeLocatorOptions {
  /**
   * Pick the first match instead of requiring exactly one. Playwright's strict
   * mode is the guard that fails a spec when the renderer draws an id twice,
   * so opt out only where a second copy is expected: a root drawn once per
   * system (#2917) or a ghost node in a drill-down (AT-0054).
   */
  readonly firstMatch?: boolean;
}

/** Locator for a rendered node by its author id (`data-node-id` on the node group). */
export function nodeLocator(page: Page, nodeId: string, options: NodeLocatorOptions = {}) {
  const locator = page.locator(`svg [data-node-id="${nodeId}"]`);
  return options.firstMatch ? locator.first() : locator;
}

export interface DrillOptions extends NodeLocatorOptions {
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
    await nodeLocator(page, nodeId, options).click();
    if (options.expectBreadcrumb) {
      await expect(page.locator(".breadcrumb-current")).toHaveText(nodeId);
    }
  }
}
