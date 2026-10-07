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
 * Icon mode used to be a toggle button in the drill-path row. It moved into
 * Settings (#2376), so reaching it now means opening the edit pane's Settings
 * tab. Selecting the value is enough — the select is controlled by app state,
 * and the preview re-renders from the same state.
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

/**
 * Pick an explicit theme from the Settings tab and wait until the document
 * carries it (`<html data-theme>`), which is the signal every themed surface
 * repaints from. Only `light` / `dark` are offered here: the `system` value
 * follows the OS and is driven through `test.use({ colorScheme })` instead
 * (AT-1470).
 */
export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.getByRole("tab", { name: /Settings/ }).click();
  await page.locator("#settings-theme").selectOption(theme);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
    .toBe(theme);
}
