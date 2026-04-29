import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-0033: Drill-down (all-layers) SVG export.
 *
 * The feature is exposed via the "⊞ Show All Layers" toolbar button
 * (aria-label "Toggle all layers"). When active, the export button
 * downloads a multi-level SVG whose filename ends in `-all-layers.svg`.
 *
 * Coverage:
 *  - AT-0033-1: button is visible on the System tab
 *  - AT-0033-3: button is disabled on the Deploy tab
 *  - AT-0033-4 (partial): clicking activates the toggle and renders the iframe
 *  - AT-0033-8: clicking again deactivates the toggle
 *  - AT-0033-9: exporting while active downloads `*-all-layers.svg`
 *  - AT-0033-11: exporting while inactive downloads a non-all-layers SVG
 *
 * Out of scope:
 *  - AT-0033-2: needs a fixture without drill-down levels
 *  - AT-0033-5/6/7: in-iframe navigation across drill-down levels
 *  - AT-0033-10: opening the downloaded SVG in a separate browser context
 */
test.describe("AT-0033 Drill-down SVG export", () => {
  test("toggle is visible on System and disabled on Deploy (AT-0033-1, AT-0033-3)", async ({
    page,
    opfs,
  }) => {
    await opfs.reset();
    await opfs.gotoApp();

    const toggle = page.getByRole("button", { name: "Toggle all layers" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeEnabled();

    await page.getByRole("tab", { name: "Deploy" }).click();
    await expect(page.getByRole("button", { name: "Toggle all layers" })).toBeDisabled();
  });

  test("toggling activates and deactivates the all-layers iframe (AT-0033-4, AT-0033-8)", async ({
    page,
    opfs,
  }) => {
    await opfs.reset();
    await opfs.gotoApp();

    const toggle = page.getByRole("button", { name: "Toggle all layers" });
    await toggle.click();
    await expect(toggle).toHaveClass(/active/);
    await expect(page.locator("iframe")).toHaveCount(1);

    await toggle.click();
    await expect(toggle).not.toHaveClass(/active/);
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("Export SVG produces the all-layers file when the toggle is active (AT-0033-9)", async ({
    page,
    opfs,
  }) => {
    await opfs.reset();
    await opfs.gotoApp();

    await page.getByRole("button", { name: "Toggle all layers" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export SVG" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/-all-layers\.svg$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString("utf-8");
    expect(content).toContain("<svg");
    expect(content).toContain("</svg>");
    expect(content).not.toContain("<script");
  });

  test("Export SVG produces a single-level file when the toggle is inactive (AT-0033-11)", async ({
    page,
    opfs,
  }) => {
    await opfs.reset();
    await opfs.gotoApp();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export SVG" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.svg$/);
    expect(download.suggestedFilename()).not.toMatch(/-all-layers\.svg$/);
  });
});
