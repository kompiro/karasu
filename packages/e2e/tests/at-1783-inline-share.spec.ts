import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";
import {
  bootSharer,
  openShareDialog,
  openSharedUrl,
  previewUrlInput,
  privateUrlInput,
  readPrivateUrl,
  shareButton,
} from "../fixtures/share.js";

/**
 * AT-1783 (`docs/acceptance/karasu-nest-inline-share.md`): the Share dialog
 * and the `#s=` restore path in a real browser (#3043).
 *
 * The unit layer round-trips the payload (`inline-share.test.ts`) and renders
 * the dialog in jsdom; what it cannot reach is opening the produced URL and
 * checking what boots — memory mode instead of the visitor's OPFS project,
 * with that project left untouched — and the restore-failed fallback.
 */

const SHARED_KRS = `system Shop {
  service Storefront {}
  service Payments {}
}
`;

// The visitor's own local project. A shared link must open beside it, not
// over it (ADR-1783: the shared view is ephemeral).
const VISITOR_KRS = `system Visitor {
  service Local {}
}
`;
const VISITOR_PROJECT = {
  id: "visitor",
  name: "Visitor",
  files: { "index.krs": VISITOR_KRS },
};

test.describe("AT-1783 inline share", () => {
  test("Share opens the dialog with a private #s= link that is copied, and Copy re-copies", async ({
    page,
    opfs,
    baseURL,
  }) => {
    await bootSharer(page, opfs, SHARED_KRS);
    const dialog = await openShareDialog(page);

    const privateUrl = await readPrivateUrl(dialog);
    expect(privateUrl.startsWith(`${baseURL}/#s=`)).toBe(true);

    // Share copies the private link eagerly, through the real clipboard.
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(privateUrl);

    // Copy on the other field copies *that* URL and moves the confirmation to it.
    const previewUrl = await previewUrlInput(dialog).inputValue();
    const previewField = previewUrlInput(dialog).locator("..");
    await previewField.getByRole("button").click();
    await expect(previewField.getByRole("button")).toHaveText("✓ Copied to clipboard");
    await expect(privateUrlInput(dialog).locator("..").getByRole("button")).toHaveText("⧉ Copy");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(previewUrl);
  });

  test("Share is disabled while the source is empty and enabled once it is not", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [{ id: "empty", name: "Empty", files: { "index.krs": "" } }],
      lastProjectId: "empty",
    });
    await opfs.gotoApp();
    await expect(page.locator(".project-selector")).toBeVisible();
    await expect(shareButton(page)).toBeDisabled();

    await replaceEditorContent(page, SHARED_KRS);
    await expect(shareButton(page)).toBeEnabled();
  });

  test("the private link opens in memory mode and leaves the visitor's OPFS project untouched", async ({
    page,
    opfs,
  }) => {
    await bootSharer(page, opfs, SHARED_KRS, {
      projects: [VISITOR_PROJECT],
      lastProjectId: VISITOR_PROJECT.id,
    });
    const metaBefore = await opfs.read("/meta/projects.json");
    expect(metaBefore).not.toBeNull();

    const privateUrl = await readPrivateUrl(await openShareDialog(page));
    await openSharedUrl(page, opfs, privateUrl);

    // The shared model renders, in memory mode (no project selector)…
    await expect(page.locator('svg [data-node-id="Storefront"]')).toBeVisible();
    await expect(page.locator('svg [data-node-id="Payments"]')).toBeVisible();
    await expect(page.locator(".project-selector")).toHaveCount(0);

    // …and nothing of it reached OPFS: same project list, same file content.
    expect(await opfs.read("/meta/projects.json")).toBe(metaBefore);
    expect(await opfs.read(`/projects/${VISITOR_PROJECT.id}/index.krs`)).toBe(VISITOR_KRS);
  });

  test("a corrupt #s= link shows the restore-failed banner and opens Project mode", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [VISITOR_PROJECT],
      lastProjectId: VISITOR_PROJECT.id,
    });
    await opfs.gotoApp("/#s=not-a-share-payload");

    const banner = page.getByRole("alert").filter({ hasText: "could not be restored" });
    await expect(banner).toBeVisible();
    // The app continues with the visitor's project rather than a blank screen.
    await expect(page.locator(".project-selector")).toBeVisible();
    await expect(page.locator('svg [data-node-id="Local"]')).toBeVisible();

    await banner.getByRole("button", { name: /Close/ }).click();
    await expect(banner).toHaveCount(0);
  });
});
