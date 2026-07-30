import { expect, test } from "../fixtures/opfs.js";

/**
 * TEMPORARY MEASUREMENT — not an AT fence. Delete or promote after the CI
 * verdict; do not build on it.
 *
 * #2049 makes `toHaveScreenshot` conditional on an unverified precondition:
 * "verify chromium-linux baselines are portable devcontainer → CI (ubicloud
 * ubuntu)". Playwright names baselines by platform (`chromium-linux`) only,
 * so an `aarch64` devcontainer and an `x86-64` CI runner share one baseline
 * file even though they are different Chromium builds with different font
 * rasterization. This spec measures whether that actually matters, with one
 * screenshot of the diff-mode SVG.
 *
 * The committed baseline is generated locally with `CI=1` (`vite build` +
 * `vite preview`, the CI web-server mode), so build mode is held constant and
 * architecture is the only remaining difference.
 *
 * Reading the result:
 *  - CI green  → baselines are portable; #2049 item 6 (org-tree snapshot) and
 *    the prototype snapshot variants can be adopted as committed baselines.
 *  - CI red    → they are not; delete this file, keep the suite structural,
 *    and switch item 6 to CI-generated baselines (or drop it).
 */

const INDEX_KRS = `system Shop {
  service Catalog {
    label "商品カタログ"
  }
  service Orders
  service Payments
  Catalog -> Orders "queries"
  Orders -> Payments "charges"
}
`;

const BEFORE_KRS = `system Shop {
  service Catalog
  service Orders
  Catalog -> Orders "queries"
}
`;

test("PROBE (#2049): diff-mode SVG matches the committed chromium-linux baseline", async ({
  page,
  opfs,
}) => {
  await opfs.seed({
    projects: [
      { id: "probe", name: "Probe", files: { "index.krs": INDEX_KRS, "before.krs": BEFORE_KRS } },
    ],
    lastProjectId: "probe",
  });
  await opfs.gotoApp();

  await page.locator(".file-tree-item", { hasText: "index.krs" }).first().click();
  await page.locator(".file-tree-item", { hasText: "before.krs" }).first().click({
    button: "right",
  });
  await page.getByRole("button", { name: "⇄ Compare with current" }).click();
  await expect(page.getByRole("status", { name: "Diff mode active" })).toBeVisible();

  const svg = page.locator(".preview-container svg").first();
  await expect(svg.locator('[data-diff-state="added"]').first()).toBeVisible();
  await expect(svg).toHaveScreenshot("diff-colors-probe.png", { animations: "disabled" });
});
