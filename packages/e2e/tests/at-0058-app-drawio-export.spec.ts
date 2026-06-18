import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-0058: App — draw.io export from the preview toolbar.
 *
 * The export control is a split button: the left half exports SVG, the right
 * half (`▾`, aria-label "Export options") opens a dropdown that includes
 * "Export draw.io (mxGraph XML)". Selecting it downloads a `.drawio` file built
 * by the same `buildDrawioProject` pipeline as the CLI.
 *
 * Coverage (AT-0058 §1–2):
 *  - opening the dropdown and selecting the draw.io item triggers a download
 *  - the downloaded filename ends in `.drawio`
 *  - the payload is a valid mxGraph document: `<mxfile host="karasu" ...>`,
 *    multiple `<diagram>` pages (System drill-down / Deploy / Organization),
 *    and node cells carry `data-karasu-id` / `data-karasu-kind`
 *
 * Out of scope (documented here to avoid false "missing coverage" reads):
 *  - AT-0058 §3 / §5: opening in diagrams.net and diffing against the CLI
 *    output are external-tool / manual checks that cannot be automated here.
 *  - AT-0058 §4: the disabled-when-no-project state needs a no-entry fixture;
 *    the default seeded project always has an entry, so it is left for a
 *    follow-up.
 */
test.describe("AT-0058 App draw.io export", () => {
  test("exports the project as a valid .drawio file from the dropdown", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();

    // Open the split-button dropdown (right half of the export control).
    await page.getByRole("button", { name: "Export options" }).click();

    const drawioItem = page.getByRole("menuitem", { name: "Export draw.io (mxGraph XML)" });
    await expect(drawioItem).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await drawioItem.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.drawio$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString("utf-8");

    // mxGraph document produced by the karasu drawio exporter.
    expect(content).toContain('<mxfile host="karasu"');
    // Multiple pages: System drill-down layers / Deploy / Organization.
    const diagramCount = content.match(/<diagram\b/g)?.length ?? 0;
    expect(diagramCount).toBeGreaterThanOrEqual(2);
    // Node cells round-trip the karasu identity for bidirectional mapping.
    expect(content).toContain("data-karasu-id");
    expect(content).toContain("data-karasu-kind");
  });
});
