import { type Page } from "@playwright/test";
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
 * Out of scope (manual, PR checklist): whether the panel's placement leaves
 * the parts of the diagram each step talks about in view is a layout
 * judgment.
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
