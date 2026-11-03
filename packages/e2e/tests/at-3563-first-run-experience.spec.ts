import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { pressChord } from "../fixtures/keyboard.js";
import { selectedTab } from "../fixtures/tabs.js";

/**
 * AT-3563: the web app's first-run experience. Welcome (#3565) greets a first
 * visit, and Design a service split (#3566) walks the bundled service-split
 * sample (#3564) in five steps. The opfs fixture marks Welcome dismissed for
 * every other spec; these opt back in with `showWelcome: true`.
 *
 * The palette-only `view.showWelcome` command (Show Welcome…) reopens Welcome.
 *
 * The layout block decides what used to be a manual check (#3583): the node
 * each step talks about stays inside the preview and clear of the panel, and
 * no text in the panel overflows its box, in English and in Japanese.
 */

const WELCOME = "Build a shared understanding of your architecture.";

function welcome(page: Page) {
  return page.getByRole("dialog", { name: WELCOME });
}

function tour(page: Page) {
  return page.getByRole("region", { name: "Guided tour" });
}

function node(page: Page, id: string) {
  return page.locator(`.preview-container svg [data-node-id="${id}"]`).first();
}

const diffBanner = (page: Page) => page.getByRole("status", { name: "Diff mode active" });

const editorLines = (page: Page) => page.locator(".monaco-editor .view-lines").first();

test.describe("AT-3563 first-run Welcome", () => {
  test("greets a first visit once: after a choice, a reload opens the editor", async ({
    page,
    opfs,
  }) => {
    await opfs.reset({ showWelcome: true });
    await opfs.gotoApp();
    await expect(welcome(page)).toBeVisible();

    await welcome(page).getByRole("button", { name: "✎ Open the editor" }).click();
    await expect(welcome(page)).toHaveCount(0);
    await expect(node(page, "ECommerce")).toBeVisible();

    await page.reload();
    await expect(node(page, "ECommerce")).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
  });

  test("stays out of the way of a deep link", async ({ page, opfs }) => {
    await opfs.reset({ showWelcome: true });
    await opfs.gotoApp("/#krs-org-root");
    await expect(selectedTab(page, "Org")).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
  });

  test("does not greet a visitor whose projects are already there", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [
        { id: "mine", name: "Mine", files: { "index.krs": "system Mine {\n  service Api\n}\n" } },
      ],
      lastProjectId: "mine",
      showWelcome: true,
    });
    await opfs.gotoApp();
    await expect(node(page, "Api")).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
  });

  test("Show Welcome… in the command palette opens it again", async ({ page, opfs }) => {
    await opfs.reset();
    await opfs.gotoApp();
    await expect(node(page, "ECommerce")).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);

    await pressChord(page, "Shift+P");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Show Welcome");
    await page.keyboard.press("Enter");
    await expect(welcome(page)).toBeVisible();
  });

  test("Understand an existing system opens the seeded Getting Started project", async ({
    page,
    opfs,
  }) => {
    await opfs.reset({ showWelcome: true });
    await opfs.gotoApp();
    await welcome(page)
      .getByRole("button", { name: /Understand an existing system/ })
      .click();
    await expect(welcome(page)).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Project" })).toContainText("getting-started");
    await expect(node(page, "ECommerce")).toBeVisible();
    // The project was already open: the choice must leave its index.krs open
    // in the editor, not an empty buffer the preview hides by falling back.
    await expect(editorLines(page)).toContainText("system ECPlatform");
  });

  test("Understand from an open Getting Started reopens index.krs and leaves the diff", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [
        {
          id: "gs",
          name: "getting-started",
          files: {
            "index.krs": "system Shop {\n  service Api\n}\n",
            "before.krs": "system Shop {\n  service Legacy\n}\n",
          },
        },
      ],
      lastProjectId: "gs",
    });
    await opfs.gotoApp();
    await expect(node(page, "Api")).toBeVisible();
    await page.locator(".file-tree-item", { hasText: "before.krs" }).first().click({
      button: "right",
    });
    await page.getByRole("button", { name: "⇄ Compare with current" }).click();
    await expect(diffBanner(page)).toBeVisible();

    await pressChord(page, "Shift+P");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Show Welcome");
    await page.keyboard.press("Enter");
    await welcome(page)
      .getByRole("button", { name: /Understand an existing system/ })
      .click();
    await expect(diffBanner(page)).toHaveCount(0);
    await expect(editorLines(page)).toContainText("service Api");
  });

  test("Track architecture evolution compares the migration with the current system", async ({
    page,
    opfs,
  }) => {
    await opfs.reset({ showWelcome: true });
    await opfs.gotoApp();
    await welcome(page)
      .getByRole("button", { name: /Track architecture evolution/ })
      .click();
    await expect(diffBanner(page)).toContainText("index.krs");
    await expect(diffBanner(page)).toContainText("migrating.krs");
    await expect(node(page, "BillingService")).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
  });
});

test.describe("AT-3563 Design a service split tour", () => {
  test.beforeEach(async ({ page, opfs }) => {
    await opfs.reset({ showWelcome: true });
    await opfs.gotoApp();
    await welcome(page)
      .getByRole("button", { name: /Design a service split/ })
      .click();
    await expect(tour(page)).toBeVisible();
  });

  test("hands keyboard focus to the tour when Welcome closes", async ({ page }) => {
    await expect(tour(page).getByRole("button", { name: "Next →" })).toBeFocused();
  });

  test("opens the sample as a new project, leaving the seeded ones in place", async ({ page }) => {
    const project = page.getByRole("combobox", { name: "Project" });
    await expect(project).toContainText("service-split");
    await expect(project.getByRole("option")).toContainText(["getting-started"]);
  });

  test("Next and Back walk the five steps through their files, views and diff", async ({
    page,
  }) => {
    const panel = tour(page);
    const next = panel.getByRole("button", { name: "Next →" });

    // 1. Current architecture: the system view of index.krs.
    await expect(panel).toContainText("1 / 5");
    await expect(selectedTab(page, "System")).toBeVisible();
    await expect(node(page, "CommerceApp")).toBeVisible();
    await expect(node(page, "BillingService")).toHaveCount(0);
    await expect(diffBanner(page)).toHaveCount(0);

    // 2. Organizational boundaries: the org view.
    await next.click();
    await expect(panel).toContainText("2 / 5");
    await expect(selectedTab(page, "Org")).toBeVisible();

    // 3. Target architecture: planned.krs against index.krs in diff mode.
    await next.click();
    await expect(panel).toContainText("3 / 5");
    await expect(selectedTab(page, "System")).toBeVisible();
    await expect(diffBanner(page)).toContainText("index.krs");
    await expect(diffBanner(page)).toContainText("planned.krs");
    await expect(node(page, "BillingService")).toHaveAttribute("data-diff-state", "added");

    // Back restores step 2, and leaves the diff.
    await panel.getByRole("button", { name: "← Back" }).click();
    await expect(panel).toContainText("2 / 5");
    await expect(selectedTab(page, "Org")).toBeVisible();
    await expect(diffBanner(page)).toHaveCount(0);

    // 4. Design decision: migrating.krs, with the planned database.
    await next.click();
    await next.click();
    await expect(panel).toContainText("4 / 5");
    await expect(diffBanner(page)).toHaveCount(0);
    await expect(node(page, "BillingDB")).toBeVisible();
    await expect(panel.getByRole("listitem")).toHaveCount(4);

    // 5. Share: points at the toolbar's Share, then hands over to the editor.
    await next.click();
    await expect(panel).toContainText("5 / 5");
    await expect(page.getByRole("button", { name: /Share/ }).first()).toBeVisible();
    await panel.getByRole("button", { name: "✓ Continue to editor" }).click();
    await expect(tour(page)).toHaveCount(0);
    await expect(node(page, "BillingDB")).toBeVisible();
  });

  test("Skip ends the tour from the diff step and leaves diff mode", async ({ page }) => {
    const panel = tour(page);
    await panel.getByRole("button", { name: "Next →" }).click();
    await panel.getByRole("button", { name: "Next →" }).click();
    await expect(diffBanner(page)).toBeVisible();

    await panel.getByRole("button", { name: "✕ Skip tour" }).click();
    await expect(tour(page)).toHaveCount(0);
    await expect(diffBanner(page)).toHaveCount(0);
  });
});

type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const contains = (outer: Box, a: Box) =>
  a.x >= outer.x &&
  a.y >= outer.y &&
  a.x + a.width <= outer.x + outer.width &&
  a.y + a.height <= outer.y + outer.height;

/** Where a step's node sits relative to the preview and the tour panel. */
async function placement(page: Page, id: string, panel: Locator) {
  const [n, preview, p] = await Promise.all([
    node(page, id).boundingBox(),
    page.locator(".preview-container").first().boundingBox(),
    panel.boundingBox(),
  ]);
  if (!n || !preview || !p) return { rendered: false };
  // The diagram may be taller than the preview and scroll, so the node only has
  // to be on screen (its center inside the preview), not wholly inside it.
  const center = { x: n.x + n.width / 2, y: n.y + n.height / 2, width: 0, height: 0 };
  return { rendered: true, onScreen: contains(preview, center), underPanel: overlaps(n, p) };
}

/** The text of every box in the panel whose content needs more room than it has. */
function overflowing(panel: Locator) {
  return panel.evaluate((root) =>
    [root, ...root.querySelectorAll("*")]
      .filter(
        (el) =>
          el.clientWidth > 0 &&
          (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1),
      )
      .map((el) => (el.textContent ?? "").trim().slice(0, 40)),
  );
}

async function insideViewport(page: Page, panel: Locator) {
  const box = await panel.boundingBox();
  const size = page.viewportSize();
  return !!box && !!size && contains({ x: 0, y: 0, ...size }, box);
}

/** The node each step's text talks about; steps that point at none are null. */
const POINTED_AT: (string | null)[] = ["CommerceApp", null, "BillingService", "BillingDB", null];

const LAYOUT_COPY = {
  en: { design: /Design a service split/, next: "Next →" },
  ja: { design: /サービス分割を設計する/, next: "次へ →" },
} as const;

test.describe("AT-3563 tour layout", () => {
  for (const lang of ["en", "ja"] as const) {
    test(`(${lang}) keeps each step's node clear of the panel, with no text overflowing`, async ({
      page,
      opfs,
    }) => {
      await opfs.reset({ showWelcome: true, pinLocale: lang });
      await opfs.gotoApp();
      await page
        .locator(".first-run-welcome")
        .getByRole("button", { name: LAYOUT_COPY[lang].design })
        .click();
      const panel = page.locator(".first-run-tour");

      for (const [i, id] of POINTED_AT.entries()) {
        await expect(panel).toContainText(`${i + 1} / ${POINTED_AT.length}`);
        if (id) {
          await expect
            .poll(() => placement(page, id, panel))
            .toEqual({ rendered: true, onScreen: true, underPanel: false });
        }
        await expect.poll(() => overflowing(panel)).toEqual([]);
        await expect.poll(() => insideViewport(page, panel)).toBe(true);
        if (i < POINTED_AT.length - 1) {
          await panel.getByRole("button", { name: LAYOUT_COPY[lang].next }).click();
        }
      }
    });
  }
});
