import type { Page } from "@playwright/test";
import { type OpfsFixture, expect, test } from "../fixtures/opfs.js";
import {
  bootSharer,
  openShareDialog,
  openSharedUrl,
  readPrivateUrl,
  sharePayloadOf,
} from "../fixtures/share.js";

/**
 * AT-1958 (`docs/acceptance/repo-backed-permalink-deep-anchor.md`): the SPA
 * half of a deep repo-backed permalink (#3043).
 *
 * The `/s` and `/r/…` Pages Functions bounce a deep anchor to
 * `/?krs=<anchor>#s=<payload>`, since the `#s=` fragment already holds the
 * payload. Those Functions do not run under `vite preview`, so this opens the
 * bounce target directly: `App.tsx` must turn `?krs=` into the canonical
 * `#krs-…` hash before mount (`utils/deep-link-anchor.ts`) and drop the query.
 */

const KRS = `system EC {
  service OrderService {
    domain Ordering {}
  }
  service Billing {}
}
`;

/** `/?krs=<anchor>#s=<payload>` — what the bounce hands the SPA. */
async function bounceTarget(
  page: Page,
  opfs: OpfsFixture,
  baseURL: string,
  anchor: string,
): Promise<string> {
  await bootSharer(page, opfs, KRS);
  // Shared from the root, so the payload carries no target of its own.
  const encoded = sharePayloadOf(await readPrivateUrl(await openShareDialog(page)));
  return `${baseURL}/?krs=${anchor}#s=${encoded}`;
}

test.describe("AT-1958 ?krs= deep-link anchor", () => {
  test("?krs=krs-system-<id> drills into the element and strips the query", async ({
    page,
    opfs,
    baseURL,
  }) => {
    const url = await bounceTarget(page, opfs, baseURL!, "krs-system-OrderService");
    await openSharedUrl(page, opfs, url);

    await expect(page.locator(".breadcrumb-current")).toHaveText("OrderService");
    await expect(page.locator('svg [data-node-id="Ordering"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.search)).toBe("");
    // The anchor, before the `?file=` suffix the app adds for the active file.
    await expect
      .poll(() => page.evaluate(() => location.hash.split("?")[0]))
      .toBe("#krs-system-OrderService");
  });

  test("an anchor that no longer resolves opens the whole model", async ({
    page,
    opfs,
    baseURL,
  }) => {
    // A renamed or deleted id: grammatically valid, so it becomes the hash,
    // but there is no node to drill into.
    const url = await bounceTarget(page, opfs, baseURL!, "krs-system-RenamedService");
    await openSharedUrl(page, opfs, url);

    await expect(page.locator('svg [data-node-id="OrderService"]')).toBeVisible();
    await expect(page.locator('svg [data-node-id="Billing"]')).toBeVisible();
    await expect(page.locator(".breadcrumb-current")).toHaveText("EC");
    await expect.poll(() => page.evaluate(() => location.search)).toBe("");
  });
});
