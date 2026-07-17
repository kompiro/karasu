import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";
import { clickAndDownload, readDownloadText } from "../fixtures/download.js";

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
 *
 * Also includes one #1983 case (not part of the AT-0033 AC map above,
 * co-located here for the toggle + Export SVG harness): Group-by frames now
 * reach drill-level bands in this export, not just the root band (#1879's
 * root-only gate was removed). The core/hook math is unit-tested elsewhere;
 * this proves the live "Group by" selector + toggle + download are wired
 * together end-to-end. Uses the team axis because `owns` places a node one
 * level below the root band; the boundary axis is exercised in the entity
 * view by at-1907-entity-view-toggle.spec.ts.
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
    // shadcn Button migration: toggle state is `aria-pressed`, not a class.
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("iframe")).toHaveCount(1);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("Export SVG produces the all-layers file when the toggle is active (AT-0033-9)", async ({
    page,
    opfs,
  }) => {
    await opfs.reset();
    await opfs.gotoApp();

    await page.getByRole("button", { name: "Toggle all layers" }).click();

    const download = await clickAndDownload(page.getByRole("button", { name: "Export SVG" }));

    expect(download.suggestedFilename()).toMatch(/-all-layers\.svg$/);

    const content = await readDownloadText(download);
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

    const download = await clickAndDownload(page.getByRole("button", { name: "Export SVG" }));

    expect(download.suggestedFilename()).toMatch(/\.svg$/);
    expect(download.suggestedFilename()).not.toMatch(/-all-layers\.svg$/);
  });

  test("Show All Layers frames a drill-level band under Group by: Team, not just the root (#1983)", async ({
    page,
    opfs,
  }) => {
    // Before #1983 the three export builders gated `groupBy` to the root
    // system-view band only (#1879's "Root system-view level only" comment);
    // #1983 removed that gate so every band with members gets framed.
    // `owns BillingDomain` puts an owned node one level below the root band.
    const GROUPED_KRS = `system Shop {
  service Billing {
    domain BillingDomain {}
  }
  service Search {}
  Billing -> Search "reads"
}

organization Org {
  team "payments" {
    label "Payments"
    owns Billing
    owns BillingDomain
  }
  team "catalog" { label "Catalog" owns Search }
}
`;
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, GROUPED_KRS);

    await page.selectOption("#group-by-select", "team");
    await page.getByRole("button", { name: "Toggle all layers" }).click();

    const download = await clickAndDownload(page.getByRole("button", { name: "Export SVG" }));
    const content = await readDownloadText(download);

    // Root band: payments + catalog. Billing's drill band: a second payments
    // frame around the owned BillingDomain — the per-level behavior #1983
    // ships, proven here through the real toggle + selector + download.
    expect(content.match(/data-container-id="__group_payments__"/g)?.length).toBe(2);
    expect(content).toContain('data-container-id="__group_catalog__"');
    expect(content).toContain('data-node-id="BillingDomain"');
  });
});
