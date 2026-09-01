import { type Page, expect } from "@playwright/test";

/**
 * Click a view tab (System / Deploy / Org / ...) and wait until it is
 * actually selected.
 *
 * The `selected: true` assertion is what makes this race-safe: clicking a
 * tab right after an edit can race with the auto-switch effects
 * (`useAutoSwitchToOrg`, `useAutoSwitchToDeploy`), so callers must not start
 * asserting on tab content until the tab switch has been observed. Do not
 * remove the assertion.
 *
 * Specs that intentionally avoid the selected assertion (e.g. AT-0044's
 * `openOrgTab`) or assert `aria-selected` via `toHaveAttribute` keep their
 * own inline choreography.
 */
export async function openViewTab(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name }).click();
  await expect(page.getByRole("tab", { name, selected: true })).toBeVisible();
}

/**
 * Switch the node display mode from the Settings tab's Display section.
 *
 * Icon mode used to be a toggle button in the drill-path row. It was
 * de-emphasized to a legacy display mode and moved into Settings (#2376), so
 * reaching it now means opening the edit pane's Settings tab. Selecting the
 * value is enough — the select is controlled by app state, and the preview
 * re-renders from the same state.
 *
 * Only available where the edit pane renders. `karasu serve` passes
 * `hideEditor`, so there is no Settings tab (and no icon mode) there.
 */
export async function setDisplayMode(page: Page, mode: "shape" | "icon"): Promise<void> {
  await page.getByRole("tab", { name: /Settings/ }).click();
  const select = page.getByLabel("Node display");
  await expect(select).toBeVisible();
  await select.selectOption(mode);
  await expect(select).toHaveValue(mode);
}
