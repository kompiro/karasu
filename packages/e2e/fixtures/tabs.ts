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
