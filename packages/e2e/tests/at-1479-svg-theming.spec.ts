import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * AT-1479 (app section): the rendered SVG diagram follows the app theme, on
 * every drawing surface, and an explicitly styled colour survives both themes.
 *
 * `theme-meta.test.ts` already proves each SVG entry point produces *different*
 * output for dark vs light, and `useSystemView.test.tsx` proves the system-view
 * hook threads the theme. Neither shows that the app actually re-renders on a
 * theme switch, nor that the *other* view tabs (drill-down, all-layers, org,
 * deploy) thread it too — which is exactly the cross-surface gap
 * TPL-20260510-06 warns about for a global rendering switch.
 *
 * The canvas background is the reading: it is a single `<rect fill>` emitted by
 * the renderer from the resolved palette, so a view whose theme never arrived
 * stays visibly dark under a light app. Assertions are luminance-banded rather
 * than exact colours — a palette tune is not a regression, a view that ignores
 * the theme is.
 *
 * Waits are `expect.poll`: the preview recompiles asynchronously after a theme
 * change (~300ms observed), so a bare read races the old SVG
 * (TPL-20260510-14).
 */

const KRS = `system Demo {
  service Api {
    domain Core {
      usecase Handle {}
    }
  }
  service Worker
  Api -> Worker "enqueues"
}

deploy Prod {
  oci "api-svc" { realizes Api }
}

organization Acme {
  team Squad {
    owns Api
    member a {
      label "A"
    }
  }
}
`;

const STYLED_KRS = `@import "custom.krs.style"

system Demo {
  service Api
  service Worker
  Api -> Worker "enqueues"
}
`;

// A colour no builtin palette uses, in either theme.
const USER_STYLE = `service {
  background-color: #FF00AA;
}
`;
const USER_COLOR = "rgb(255, 0, 170)";

function luminance(rgb: string): number {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return -1;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Luminance of the diagram canvas (the renderer's background rect). */
function canvasLuminance(page: Page) {
  return async () => {
    const fill = await page
      .locator(".preview-container svg")
      .first()
      .evaluate((root) => {
        const rect = root.querySelector("rect");
        return rect ? getComputedStyle(rect).fill : "";
      })
      .catch(() => "");
    return luminance(fill);
  };
}

const nodeFill = (page: Page, id: string) => () =>
  page
    .locator(`.preview-container svg [data-node-id="${id}"] rect`)
    .first()
    .evaluate((el) => getComputedStyle(el).fill)
    .catch(() => "");

async function selectTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.getByRole("tab", { name: /Settings/ }).click();
  await page.locator("#settings-theme").selectOption(theme);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
    .toBe(theme);
}

test.describe("AT-1479 SVG diagram theming (app)", () => {
  test("the diagram follows a theme switch and returns on switching back", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [{ id: "svgtheme", name: "SvgTheme", files: { "index.krs": KRS } }],
      lastProjectId: "svgtheme",
    });
    await opfs.gotoApp();
    await expect(page.locator('.preview-container svg [data-node-id="Api"]')).toBeVisible();

    // Config default is dark (playwright.config.ts pins colorScheme).
    expect(await canvasLuminance(page)()).toBeLessThan(0.2);
    const darkNode = await nodeFill(page, "Api")();

    await selectTheme(page, "light");
    await page.getByRole("tab", { name: /System$/ }).click();
    await expect.poll(canvasLuminance(page)).toBeGreaterThan(0.5);
    // The node palette follows too, not just the backdrop.
    expect(await nodeFill(page, "Api")()).not.toBe(darkNode);

    await selectTheme(page, "dark");
    await page.getByRole("tab", { name: /System$/ }).click();
    await expect.poll(canvasLuminance(page)).toBeLessThan(0.2);
    await expect.poll(nodeFill(page, "Api")).toBe(darkNode);
  });

  test("every drawing surface threads the theme (TPL-20260510-06)", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "svgtheme", name: "SvgTheme", files: { "index.krs": KRS } }],
      lastProjectId: "svgtheme",
    });
    await opfs.gotoApp();
    await expect(page.locator('.preview-container svg [data-node-id="Api"]')).toBeVisible();

    await selectTheme(page, "light");
    await page.getByRole("tab", { name: /System$/ }).click();
    await expect.poll(canvasLuminance(page)).toBeGreaterThan(0.5);

    // All-layers view (its own renderer entry point). Two wrinkles: the toggle
    // is only enabled at the root level, and the stacked diagram is rendered
    // into an `<iframe srcDoc>` rather than inline — so it needs its own frame
    // read, and a theme that stopped at the app document would show up here.
    const allLayers = page.getByRole("button", { name: "Toggle all layers" });
    await allLayers.click();
    await expect(allLayers).toHaveAttribute("aria-pressed", "true");
    const allLayersCanvas = page
      .frameLocator('iframe[title="Full diagram view"]')
      .locator("svg rect")
      .first();
    await expect
      .poll(async () =>
        luminance(
          await allLayersCanvas.evaluate((el) => getComputedStyle(el).fill).catch(() => ""),
        ),
      )
      .toBeGreaterThan(0.5);
    await allLayers.click();
    await expect(allLayers).toHaveAttribute("aria-pressed", "false");

    // Drill-down into the service: a separate compile path.
    await page.locator('.preview-container svg [data-node-id="Api"]').first().click();
    await expect(page.locator('.preview-container svg [data-node-id="Core"]')).toBeVisible();
    await expect.poll(canvasLuminance(page)).toBeGreaterThan(0.5);

    // Org and deploy views.
    await openViewTab(page, "Org");
    await expect(page.locator('.preview-container svg [data-node-id="Squad"]')).toBeVisible();
    await expect.poll(canvasLuminance(page)).toBeGreaterThan(0.5);

    await openViewTab(page, "Deploy");
    await expect.poll(canvasLuminance(page)).toBeGreaterThan(0.5);
  });

  test("an explicitly styled node colour is identical under both themes", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [
        {
          id: "userstyle",
          name: "UserStyle",
          files: { "index.krs": STYLED_KRS, "custom.krs.style": USER_STYLE },
        },
      ],
      lastProjectId: "userstyle",
    });
    await opfs.gotoApp();
    await page.locator(".file-tree-item", { hasText: "index.krs" }).first().click();
    await expect(page.locator('.preview-container svg [data-node-id="Api"]')).toBeVisible();

    // The user sheet wins over the builtin sheet — under dark…
    await expect.poll(nodeFill(page, "Api")).toBe(USER_COLOR);

    // …and is not re-themed under light. The canvas *does* change, which is
    // what makes this a real invariance check rather than a no-op.
    await selectTheme(page, "light");
    await page.getByRole("tab", { name: /System$/ }).click();
    await expect.poll(canvasLuminance(page)).toBeGreaterThan(0.5);
    await expect.poll(nodeFill(page, "Api")).toBe(USER_COLOR);
  });
});
