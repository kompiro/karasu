import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-0030: SVG Export — pilot coverage.
 *
 * Verifies the Export SVG button is reachable on load, triggers a download,
 * and produces a syntactically valid SVG payload.
 *
 * Filename edge cases (drill-down, tab switching, special characters) are
 * intentionally out of scope for the pilot. They will be added after the
 * foundation is proven to work in CI.
 */
test.describe("AT-0030 SVG Export", () => {
  test("exports the current view as a valid SVG file", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();

    const exportButton = page.getByRole("button", { name: "Export SVG" });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.svg$/);

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
});
