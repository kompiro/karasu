import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-1470 (manual section): the app chrome's light theme — OS follow on first
 * load, the Settings switch, persistence across a reload, live OS follow, the
 * no-flash-of-wrong-theme guarantee, and light-theme legibility.
 *
 * The unit layer already fences theme *resolution* (`theme-storage.test.ts`,
 * `theme/index.test.tsx`) and the Settings control (`SettingsPane.test.tsx`).
 * What only a real browser can show is the end-to-end result: the boot script
 * in `index.html` running before anything paints, Monaco actually repainting,
 * and the rendered contrast of the resulting palette.
 *
 * The repo config pins `colorScheme: "dark"` (see `playwright.config.ts`);
 * this file overrides it to "light" and re-pins dark in the last describe, so
 * both OS directions are exercised.
 *
 * On the FOUC check: "no flash was seen" is not directly observable, so this
 * asserts the *mechanism* that prevents it — `data-theme` is stamped while
 * `document.readyState === "loading"`, i.e. synchronously in `<head>` before
 * the body can paint. If someone moves the boot script into React, this fails.
 */

test.use({ colorScheme: "light" });

/** WCAG relative luminance of an `rgb()` string. */
function luminance(rgb: string): number {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return -1;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const dataTheme = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));

const monacoBackground = (page: Page) =>
  page
    .locator(".monaco-editor")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);

/**
 * Foreground / effective background pair for the first match of `selector`.
 * Backgrounds are inherited visually, not computationally: a transparent
 * element shows its nearest painted ancestor, so walk up until one is opaque.
 */
async function contrastOf(target: Locator): Promise<number> {
  const pair = await target.first().evaluate((el) => {
    const cs = getComputedStyle(el);
    let node: Element | null = el;
    let bg = cs.backgroundColor;
    while (node && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
      node = node.parentElement;
      if (node) bg = getComputedStyle(node).backgroundColor;
    }
    return { fg: cs.color, bg };
  });
  return contrastRatio(pair.fg, pair.bg);
}

test.describe("AT-1470 app light theme", () => {
  test("first load with no stored preference follows the OS scheme, stamped before first paint", async ({
    page,
    opfs,
  }) => {
    // Record the first `data-theme` write and the parse phase it happened in.
    // Init scripts can run before `documentElement` exists, so observe the
    // whole document: both the <html> insertion and the attribute write.
    await page.addInitScript(() => {
      const w = window as unknown as { __themeStamp?: { theme: string; readyState: string } };
      const record = () => {
        const theme = document.documentElement?.getAttribute("data-theme");
        if (theme && !w.__themeStamp) {
          w.__themeStamp = { theme, readyState: document.readyState };
        }
      };
      record();
      new MutationObserver(record).observe(document, {
        attributes: true,
        attributeFilter: ["data-theme"],
        childList: true,
        subtree: true,
      });
    });

    await opfs.seed({ mode: "memory" }); // no `karasu-theme` key → preference "system"
    await opfs.gotoApp();

    expect(await dataTheme(page)).toBe("light");
    expect(await page.evaluate(() => localStorage.getItem("karasu-theme"))).toBeNull();

    // FOUC fence: the stamp landed while the document was still parsing.
    const stamp = await page.evaluate(
      () => (window as unknown as { __themeStamp?: unknown }).__themeStamp,
    );
    expect(stamp).toEqual({ theme: "light", readyState: "loading" });

    // The chrome really renders light, not just the attribute.
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(luminance(bodyBg)).toBeGreaterThan(0.5);
  });

  test("the Settings switch is immediate, survives a reload, and Monaco follows", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    expect(await dataTheme(page)).toBe("light");

    // Monaco is a separate theming system (`karasu-light` / `karasu-dark`), so
    // it can drift from the app palette independently — assert it directly.
    await expect(page.locator(".monaco-editor")).toBeVisible();
    expect(luminance(await monacoBackground(page))).toBeGreaterThan(0.5);

    await page.getByRole("tab", { name: /Settings/ }).click();
    await page.locator("#settings-theme").selectOption("dark");

    // Immediate: no reload between the select and the repaint.
    await expect.poll(() => dataTheme(page)).toBe("dark");

    await page.reload();
    // Persisted: the boot script reads localStorage on the next load.
    await expect.poll(() => dataTheme(page)).toBe("dark");
    await expect(page.locator(".monaco-editor")).toBeVisible();
    expect(luminance(await monacoBackground(page))).toBeLessThan(0.5);
  });

  test("preference 'system' follows a live OS scheme change without a reload", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    expect(await dataTheme(page)).toBe("light");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => dataTheme(page)).toBe("dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => dataTheme(page)).toBe("light");
  });

  test("light-theme text stays legible: primary text meets WCAG AA, secondary keeps its floor", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [
        { id: "theme", name: "Theme", files: { "index.krs": "system Demo {\n  service Api\n}\n" } },
      ],
      lastProjectId: "theme",
    });
    await opfs.gotoApp();
    await expect(page.locator('.preview-container svg [data-node-id="Api"]')).toBeVisible();

    // Primary text — the AT's "panel text is legible" claim, at AA (4.5:1).
    const primary: [string, Locator][] = [
      ["active view tab", page.locator('[role="tab"][aria-selected="true"]')],
      ["file tree entry", page.locator(".file-tree-item")],
      ["breadcrumb", page.locator(".breadcrumb")],
    ];
    for (const [label, target] of primary) {
      expect(await contrastOf(target), `AA contrast for ${label}`).toBeGreaterThanOrEqual(4.5);
    }

    // Secondary text — inactive tabs and ghost buttons currently measure
    // ~4.0:1 and ~3.5:1 at 11.5–12px, i.e. **below** AA for normal text. That
    // is a real gap, not a fixture artifact, so this asserts the measured
    // floor (3:1) rather than pretending AA holds: the fence stops the light
    // palette getting *worse* while the gap is tracked in #2193. When that is
    // fixed, raise this threshold to 4.5 and delete this comment.
    const secondary: [string, Locator][] = [
      ["inactive view tab", page.locator('[role="tab"][aria-selected="false"]')],
      ["ghost toolbar button", page.getByRole("button", { name: /\+ New/ })],
    ];
    for (const [label, target] of secondary) {
      expect(await contrastOf(target), `floor contrast for ${label}`).toBeGreaterThanOrEqual(3);
    }
  });

  test.describe("with an OS dark preference", () => {
    test.use({ colorScheme: "dark" });

    test("first load with no stored preference follows the OS dark scheme", async ({
      page,
      opfs,
    }) => {
      await opfs.seed({ mode: "memory" });
      await opfs.gotoApp();

      expect(await dataTheme(page)).toBe("dark");
      const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(luminance(bodyBg)).toBeLessThan(0.2);
    });
  });
});
