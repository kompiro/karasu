import type { Locator } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { drillInto } from "../fixtures/drill.js";
import { bootSharer, openShareDialog, openSharedUrl, readPrivateUrl } from "../fixtures/share.js";

/**
 * AT-1827 (`docs/acceptance/permalink-deep-element.md`): a share link made
 * while drilled in opens drilled in (#3043).
 *
 * The unit layer round-trips `target` and maps it to the canonical hash
 * (`inline-share.test.ts`, `useHistoryNavigation.test.ts`). What it does not
 * reach is the real mount order: `App.tsx` rewrites the URL to
 * `#krs-system-<id>` before AppShell mounts, and the drill has to survive
 * MemoryModeApp's seed reset (TPL-1842).
 */

const KRS = `system EC {
  service OrderService {
    domain Ordering {}
  }
  service Billing {}
}
`;

const includeTarget = (dialog: Locator) =>
  dialog.getByRole("checkbox", { name: /Link to the current view/ });

test.describe("AT-1827 deep permalink", () => {
  test("a link shared while drilled into a service opens drilled into it", async ({
    page,
    opfs,
  }) => {
    await bootSharer(page, opfs, KRS);
    await drillInto(page, ["OrderService"], { expectBreadcrumb: true });

    const dialog = await openShareDialog(page);
    // On by default whenever there is a position to link to.
    await expect(includeTarget(dialog)).toBeChecked();

    await openSharedUrl(page, opfs, await readPrivateUrl(dialog));

    await expect(page.locator(".breadcrumb-current")).toHaveText("OrderService");
    await expect(page.locator('svg [data-node-id="Ordering"]')).toBeVisible();
    // The anchor, before the `?file=` suffix the app adds for the active file.
    await expect
      .poll(() => page.evaluate(() => location.hash.split("?")[0]))
      .toBe("#krs-system-OrderService");
  });

  test("with the checkbox off, the same share opens the whole model", async ({ page, opfs }) => {
    await bootSharer(page, opfs, KRS);
    await drillInto(page, ["OrderService"], { expectBreadcrumb: true });

    const dialog = await openShareDialog(page);
    const drilledUrl = await readPrivateUrl(dialog);
    await includeTarget(dialog).uncheck();
    // Re-encoded without the target.
    await expect.poll(() => readPrivateUrl(dialog)).not.toBe(drilledUrl);

    await openSharedUrl(page, opfs, await readPrivateUrl(dialog));

    await expect(page.locator('svg [data-node-id="OrderService"]')).toBeVisible();
    await expect(page.locator('svg [data-node-id="Billing"]')).toBeVisible();
    await expect(page.locator('svg [data-node-id="Ordering"]')).toHaveCount(0);
  });
});
