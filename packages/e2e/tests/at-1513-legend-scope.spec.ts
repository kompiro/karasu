import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-1513 AC-4: the legend footer follows the drill-down level in the app
 * preview, and AC-5: in the all-layers view each band carries its own legend.
 *
 * Core already fences *which* legends belong to a level
 * (`legend-footer.test.ts`, `drill-down-svg.test.ts`, `all-layers-svg.test.ts`).
 * What was left manual is the app actually swapping them as the user drills and
 * returns — a claim about interaction, not appearance, so it is drivable.
 *
 * The fixture is read from `examples/en/feature-samples/legend.krs` rather than
 * inlined, exactly as AC-4 prescribes ("open it as `index.krs`"). That keeps the
 * AT's promise literal and makes example drift fail here instead of silently
 * diverging from what the AT tells a human to open.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/e2e/tests -> repo root -> examples/
const LEGEND_KRS = readFileSync(
  resolve(__dirname, "../../../examples/en/feature-samples/legend.krs"),
  "utf8",
);

test.describe("AT-1513 legend drill-down scope (app preview)", () => {
  test("the legend follows the drill-down level and returns on breadcrumb home (AC-4)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [{ id: "legend", name: "Legend", files: { "index.krs": LEGEND_KRS } }],
      lastProjectId: "legend",
    });
    await opfs.gotoApp();

    const svg = () => page.locator(".preview-container svg").first();
    const legend = () => svg().locator(".legend-footer");

    // Top level: the scope-less legend.
    await expect(svg().locator('[data-node-id="ECommerce"]')).toBeVisible();
    await expect(legend()).toContainText("Owner team");

    // Into the service → the service-scoped legend replaces it. Matching is
    // exact, so the top-level legend must be *gone*, not merely joined.
    await svg().locator('[data-node-id="ECommerce"]').first().click();
    await expect(svg().locator('[data-node-id="Order"]')).toBeVisible();
    await expect(legend()).toContainText("Service internals");
    await expect(legend()).not.toContainText("Owner team");

    // Into the domain → the domain-scoped legend.
    await svg().locator('[data-node-id="Order"]').first().click();
    await expect(svg().locator('[data-node-id="PlaceOrder"]')).toBeVisible();
    await expect(legend()).toContainText("Domain vocabulary");
    await expect(legend()).not.toContainText("Service internals");

    // Breadcrumb home → the top-level legend comes back. The return trip is
    // asserted, not just the descent (TPL-20260518-01).
    await page.locator(".breadcrumb").getByText("EC Platform", { exact: true }).click();
    await expect(svg().locator('[data-node-id="ECommerce"]')).toBeVisible();
    await expect(legend()).toContainText("Owner team");
    await expect(legend()).not.toContainText("Service internals");
  });

  test("all-layers stacks each band's own legend below it, in depth order (AC-5)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [{ id: "legend", name: "Legend", files: { "index.krs": LEGEND_KRS } }],
      lastProjectId: "legend",
    });
    await opfs.gotoApp();
    await expect(page.locator('.preview-container svg [data-node-id="ECommerce"]')).toBeVisible();

    await page.getByRole("button", { name: "Toggle all layers" }).click();

    // All-layers renders into an `<iframe srcDoc>`, so the geometry has to be
    // read inside the frame.
    const frame = page.frameLocator('iframe[title="Full diagram view"]');
    const titles = frame.locator(".legend-footer");
    await expect(titles.first()).toBeVisible();

    // Each stacked band has its own legend; assert the vertical order matches
    // the drill-down depth order rather than trying to judge "not misaligned"
    // by eye. Positions come from getBoundingClientRect within the frame.
    const ordered = await titles.evaluateAll((nodes) =>
      nodes
        .map((node) => ({
          text: (node.textContent ?? "").replace(/\s+/g, " ").trim(),
          top: node.getBoundingClientRect().top,
        }))
        .sort((a, b) => a.top - b.top)
        .map((entry) => entry.text),
    );

    expect(ordered.length).toBeGreaterThanOrEqual(3);
    const indexOfLegend = (needle: string) => ordered.findIndex((text) => text.includes(needle));
    const top = indexOfLegend("Owner team");
    const service = indexOfLegend("Service internals");
    const domain = indexOfLegend("Domain vocabulary");

    expect(top, "top-level legend present").toBeGreaterThanOrEqual(0);
    expect(service, "service-scoped legend present").toBeGreaterThanOrEqual(0);
    expect(domain, "domain-scoped legend present").toBeGreaterThanOrEqual(0);
    // Top band first, then the service band, then the domain band.
    expect(top).toBeLessThan(service);
    expect(service).toBeLessThan(domain);

    // Deploy-scoped legends must not leak into the system stack.
    for (const text of ordered) expect(text).not.toContain("Hosting tier");
  });
});
