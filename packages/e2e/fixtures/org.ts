import type { Page } from "@playwright/test";
import { openViewTab } from "./tabs.js";

/**
 * The Org tab's sub-mode toggles. Both buttons are only rendered while the
 * Org tab is active, so the `open*` helpers switch the tab first (race-safe
 * through `openViewTab`) and the `toggle*` helpers only click.
 *
 * Replaces the per-spec `activateTreeView` (AT-0044) and `openTreeView` /
 * `openDependencies` (AT-2799) copies (#3040).
 */

export const orgTreeViewToggle = (page: Page) =>
  page.getByRole("button", { name: "Toggle org tree view" });

export const teamDependenciesToggle = (page: Page) =>
  page.getByRole("button", { name: "Toggle derived team dependencies" });

/** Click the Tree View toggle. The caller has already put the app on the Org tab. */
export async function toggleOrgTreeView(page: Page): Promise<void> {
  await orgTreeViewToggle(page).click();
}

/** Switch to the Org tab and enter Tree View. */
export async function openOrgTreeView(page: Page): Promise<void> {
  await openViewTab(page, "Org");
  await toggleOrgTreeView(page);
}

/** Switch to the Org tab and enter the derived team-dependencies view. */
export async function openTeamDependencies(page: Page): Promise<void> {
  await openViewTab(page, "Org");
  await teamDependenciesToggle(page).click();
}
