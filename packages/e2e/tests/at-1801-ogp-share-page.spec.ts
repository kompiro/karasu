import { expect, test } from "../fixtures/opfs.js";
import {
  bootSharer,
  openShareDialog,
  openSharedUrl,
  previewUrlInput,
  readPrivateUrl,
  sharePayloadOf,
} from "../fixtures/share.js";

/**
 * AT-1801 (`docs/acceptance/karasu-nest-ogp-share-page.md`): the two links the
 * Share dialog offers, as the running app builds them (#3043).
 *
 * The `/s?s=` bounce itself is served only by the Pages Function
 * (`functions/s.ts`), which `vite preview` does not run, so it stays a manual
 * item. What is checked here is the SPA's side of the contract: the preview
 * link carries the same single-encoded payload as the private one, and an
 * oversize project drops it while the private link still restores.
 */

const SHARED_KRS = `system Shop {
  service Storefront {}
  service Payments {}
}
`;

// Deterministic, high-entropy filler: deflate cannot shrink it much, so the
// encoded payload clears `MAX_UNFURL_PAYLOAD` (8000) without a huge model. It
// goes in a `description` string because the share payload is re-serialized
// from the parsed model, which drops comments.
function noise(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let seed = 1;
  let out = "";
  for (let i = 0; i < length; i++) {
    // xorshift32: exact in 32-bit integer ops, unlike an LCG on doubles.
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    out += alphabet[(seed >>> 0) % alphabet.length];
  }
  return out;
}

const OVERSIZE_KRS = `system Big {
  service Huge {
    description "${noise(12_800)}"
  }
}
`;

test.describe("AT-1801 OGP share page links", () => {
  test("the preview link is /s?s=<enc> with the private link's payload", async ({
    page,
    opfs,
    baseURL,
  }) => {
    await bootSharer(page, opfs, SHARED_KRS);
    const dialog = await openShareDialog(page);

    const privateUrl = await readPrivateUrl(dialog);
    const previewUrl = await previewUrlInput(dialog).inputValue();

    const encoded = sharePayloadOf(privateUrl);
    // Single encode: the two links carry the same bytes, not two encodings.
    expect(previewUrl).toBe(`${baseURL}/s?s=${encoded}`);
  });

  test("an oversize project gets only the private link, and it still restores", async ({
    page,
    opfs,
  }) => {
    await bootSharer(page, opfs, OVERSIZE_KRS);
    const dialog = await openShareDialog(page);

    await expect(dialog.getByText(/too large/i)).toBeVisible();
    await expect(previewUrlInput(dialog)).toHaveCount(0);

    const privateUrl = await readPrivateUrl(dialog);
    expect(sharePayloadOf(privateUrl).length).toBeGreaterThan(8000);

    await openSharedUrl(page, opfs, privateUrl);
    await expect(page.locator('svg [data-node-id="Huge"]')).toBeVisible();
    await expect(page.locator(".project-selector")).toHaveCount(0);
  });
});
