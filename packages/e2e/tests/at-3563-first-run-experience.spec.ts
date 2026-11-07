import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Locator, type Page } from "@playwright/test";
import { drillInto } from "../fixtures/drill.js";
import { expect, test, type OpfsFixture } from "../fixtures/opfs.js";
import { pressChord } from "../fixtures/keyboard.js";
import { clickAndDownload } from "../fixtures/download.js";
import { openShareDialog } from "../fixtures/share.js";
import { openTeamDependencies, teamDependenciesToggle } from "../fixtures/org.js";
import { openViewTab, selectedTab } from "../fixtures/tabs.js";

/**
 * AT-3563: the web app's first-run experience. Welcome (#3565) greets a first
 * visit, and Design a service split (#3566) walks the bundled service-split
 * sample (#3564) in five steps. The opfs fixture marks Welcome dismissed for
 * every other spec; these opt back in with `showWelcome: true`.
 *
 * The palette-only `view.showWelcome` command (Show Welcome…) reopens Welcome,
 * and `view.restartTour` (Restart Guided Tour…) walks the guide again (#3597).
 * A reload resumes the step the tour was on, and a link from outside does not
 * (#3598); the opfs fixture clears the record with the rest of localStorage.
 *
 * A step that asks for something (drill in, turn on the team dependencies,
 * share or export) marks itself done once the visitor did it (#3599).
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

  test("Restart Guided Tour… opens the sample when the tour has not opened one (#3597)", async ({
    page,
    opfs,
  }) => {
    // A project the visitor named service-split is theirs, not the tour's.
    await opfs.seed({
      projects: [
        {
          id: "mine",
          name: "service-split",
          files: { "index.krs": "system Mine {\n  service Api\n}\n" },
        },
        {
          id: "gs",
          name: "getting-started",
          files: { "index.krs": "system ECommerce {\n  service ECommerce\n}\n" },
        },
      ],
      lastProjectId: "gs",
    });
    await opfs.gotoApp();
    await expect(node(page, "ECommerce")).toBeVisible();

    await pressChord(page, "Shift+P");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Restart Guided Tour");
    await page.keyboard.press("Enter");
    await expect(tour(page)).toContainText("1 / 5");
    await expect(node(page, "CommerceApp")).toBeVisible();
    // A new copy (its name disambiguated) beside the visitor's own service-split.
    const project = page.getByRole("combobox", { name: "Project" });
    await expect(project.getByRole("option", { name: "service-split" })).toHaveCount(2);
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

  test("Restart Guided Tour… walks the guide again in the sample project it opened (#3597)", async ({
    page,
  }) => {
    const panel = tour(page);
    await panel.getByRole("button", { name: "Next →" }).click();
    await panel.getByRole("button", { name: "Next →" }).click();
    await expect(panel).toContainText("3 / 5");
    // Step 3's diff has landed, so the restart has a diff to clear.
    await expect(diffBanner(page)).toContainText("planned.krs");

    await pressChord(page, "Shift+P");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Restart Guided Tour");
    await page.keyboard.press("Enter");
    await expect(panel).toContainText("1 / 5");
    await expect(diffBanner(page)).toHaveCount(0);
    await expect(selectedTab(page, "System")).toBeVisible();
    await expect(node(page, "CommerceApp")).toBeVisible();
    // No second copy of the sample: the one the tour opened is reused.
    const project = page.getByRole("combobox", { name: "Project" });
    await expect(project.getByRole("option", { name: "service-split" })).toHaveCount(1);
  });

  test("Restart Guided Tour… from another project goes back into the tour's copy (#3597)", async ({
    page,
  }) => {
    await tour(page).getByRole("button", { name: "✕ Skip tour" }).click();
    const project = page.getByRole("combobox", { name: "Project" });
    await project.selectOption({ label: "getting-started" });
    await expect(node(page, "ECommerce")).toBeVisible();

    await pressChord(page, "Shift+P");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Restart Guided Tour");
    await page.keyboard.press("Enter");
    await expect(tour(page)).toContainText("1 / 5");
    await expect(project.locator("option:checked")).toHaveText("service-split");
    await expect(project.getByRole("option", { name: "service-split" })).toHaveCount(1);
    await expect(node(page, "CommerceApp")).toBeVisible();
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

/** The tour's project, as the progress record names it (#3598). */
async function tourProjectId(page: Page): Promise<string> {
  const raw = await page.evaluate(() => localStorage.getItem("karasu-first-run-tour"));
  const id = raw ? (JSON.parse(raw) as { projectId?: string }).projectId : undefined;
  if (!id) throw new Error(`no tour progress recorded: ${raw}`);
  return id;
}

const projectSelect = (page: Page) => page.getByRole("combobox", { name: "Project" });

async function startTour(page: Page, opfs: OpfsFixture) {
  await opfs.reset({ showWelcome: true });
  await opfs.gotoApp();
  await welcome(page)
    .getByRole("button", { name: /Design a service split/ })
    .click();
  await expect(tour(page)).toContainText("1 / 5");
  await expect(node(page, "CommerceApp")).toBeVisible();
}

const EXAMPLES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../examples");

/** Serve the gallery's fixed origin from the repo's examples/ (as AT-1646 does). */
async function serveGallery(page: Page) {
  await page.route("https://raw.githubusercontent.com/kompiro/karasu/main/examples/**", (route) => {
    const rel = route.request().url().split("/examples/")[1];
    return route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: readFileSync(resolve(EXAMPLES_DIR, rel), "utf8"),
    });
  });
}

test.describe("AT-3563 resuming the tour (#3598)", () => {
  test("a reload on step 3 comes back to step 3 with its diff, adding no history entry", async ({
    page,
    opfs,
  }) => {
    await startTour(page, opfs);
    const next = tour(page).getByRole("button", { name: "Next →" });
    await next.click();
    await next.click();
    await expect(tour(page)).toContainText("3 / 5");
    await expect(diffBanner(page)).toContainText("planned.krs");
    const before = await page.evaluate(() => history.length);

    await page.reload();
    await expect(tour(page)).toContainText("3 / 5");
    await expect(diffBanner(page)).toContainText("index.krs");
    await expect(diffBanner(page)).toContainText("planned.krs");
    await expect(node(page, "BillingService")).toHaveAttribute("data-diff-state", "added");
    expect(await page.evaluate(() => history.length)).toBe(before);
    // The restoration has ended: the visitor's next move is a new entry.
    await openViewTab(page, "Org");
    await expect.poll(() => page.evaluate(() => history.length)).toBe(before + 1);
  });

  // The org view is the one a scene sets after its file's SELECT_FILE reset
  // the view to System; both land in one commit, so no entry is pushed.
  test("a reload on step 2 comes back to the org view, adding no history entry", async ({
    page,
    opfs,
  }) => {
    await startTour(page, opfs);
    await tour(page).getByRole("button", { name: "Next →" }).click();
    await expect(tour(page)).toContainText("2 / 5");
    await expect(selectedTab(page, "Org")).toBeVisible();
    const before = await page.evaluate(() => history.length);

    await page.reload();
    await expect(tour(page)).toContainText("2 / 5");
    await expect(selectedTab(page, "Org")).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#krs-org-root/);
    expect(await page.evaluate(() => history.length)).toBe(before);
    await openViewTab(page, "System");
    await expect.poll(() => page.evaluate(() => history.length)).toBe(before + 1);
  });

  test("a reload after drilling on step 1 comes back to step 1, undrilled", async ({
    page,
    opfs,
  }) => {
    await startTour(page, opfs);
    await drillInto(page, ["CommerceApp"], { firstMatch: true });
    await expect(node(page, "Ordering")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => location.hash.split("?")[0]))
      .toBe("#krs-system-CommerceApp");

    await page.reload();
    await expect(tour(page)).toContainText("1 / 5");
    await expect(node(page, "CommerceApp")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => location.hash.split("?")[0]))
      .toBe("#krs-system-root");
  });

  test("a reload after Skip shows no tour", async ({ page, opfs }) => {
    await startTour(page, opfs);
    await tour(page).getByRole("button", { name: "✕ Skip tour" }).click();
    await expect(tour(page)).toHaveCount(0);

    await page.reload();
    await expect(node(page, "CommerceApp")).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
  });

  test("a reload in another project shows no tour, nor does switching back", async ({
    page,
    opfs,
  }) => {
    await startTour(page, opfs);
    const id = await tourProjectId(page);
    await projectSelect(page).selectOption({ label: "getting-started" });
    await expect(node(page, "ECommerce")).toBeVisible();

    await page.reload();
    await expect(node(page, "ECommerce")).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
    await projectSelect(page).selectOption(id);
    await expect(node(page, "CommerceApp")).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
  });

  test("a gallery example link shows no tour, nor does switching to the tour's project", async ({
    page,
    opfs,
  }) => {
    await startTour(page, opfs);
    const id = await tourProjectId(page);
    await serveGallery(page);

    await opfs.gotoApp("/?example=payment-platform&lang=en");
    await expect(projectSelect(page).locator("option:checked")).toHaveText(/payment-platform/);
    await expect(tour(page)).toHaveCount(0);
    await projectSelect(page).selectOption(id);
    await expect(node(page, "CommerceApp")).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
  });

  test("someone's permalink shows no tour, though the tour's project is the last one", async ({
    page,
    opfs,
  }) => {
    await startTour(page, opfs);
    await opfs.gotoApp("/#krs-system-CommerceApp");
    await expect(node(page, "Ordering")).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
  });

  test("a bare URL opening another last project shows no tour and opens none of its files", async ({
    page,
    opfs,
  }) => {
    await startTour(page, opfs);
    const id = await tourProjectId(page);
    await projectSelect(page).selectOption({ label: "getting-started" });
    await expect(node(page, "ECommerce")).toBeVisible();

    await opfs.gotoApp("/");
    await expect(node(page, "ECommerce")).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
    await expect(projectSelect(page).locator("option:checked")).toHaveText("getting-started");
    expect(await page.evaluate(() => location.href)).not.toContain(id);
  });
});

type Box = { x: number; y: number; width: number; height: number };

const stepDone = (page: Page) => tour(page).getByText(/✓ Done/);

/**
 * The step's scene has landed: what the visitor does from now on counts
 * toward its ask. The step counter moves before that, on the click.
 */
async function sceneLanded(page: Page, step: number) {
  await expect(tour(page)).toContainText(`${step} / 5`);
  await expect(tour(page)).toHaveAttribute("data-scene-landed", "true");
}

/** From step 1, Next until `step`, and wait for its scene. */
async function walkTo(page: Page, step: number) {
  for (let i = 1; i < step; i++) {
    await tour(page).getByRole("button", { name: "Next →" }).click();
  }
  await sceneLanded(page, step);
}

test.describe("AT-3563 a step's ask marked done (#3599)", () => {
  test("drilling in on step 1 marks it done, Next points at the mark, and drilling out keeps it", async ({
    page,
    opfs,
  }) => {
    await startTour(page, opfs);
    await sceneLanded(page, 1);
    await expect(stepDone(page)).toHaveCount(0);
    await drillInto(page, ["CommerceApp"], { firstMatch: true });
    await expect(stepDone(page)).toBeVisible();
    const id = await stepDone(page).getAttribute("id");
    await expect(tour(page).getByRole("button", { name: "Next →" })).toHaveAttribute(
      "aria-describedby",
      id ?? "",
    );
    await page.goBack();
    await expect(node(page, "CommerceApp")).toBeVisible();
    await expect(stepDone(page)).toBeVisible();
  });

  test("turning on the team dependencies on step 2 marks it done, and steps 3 and 4 ask for nothing", async ({
    page,
    opfs,
  }) => {
    await startTour(page, opfs);
    await sceneLanded(page, 1);
    await walkTo(page, 2);
    await expect(stepDone(page)).toHaveCount(0);
    await teamDependenciesToggle(page).click();
    await expect(stepDone(page)).toBeVisible();

    const next = tour(page).getByRole("button", { name: "Next →" });
    await next.click();
    await sceneLanded(page, 3);
    await expect(stepDone(page)).toHaveCount(0);
    await next.click();
    await sceneLanded(page, 4);
    await expect(stepDone(page)).toHaveCount(0);
  });

  test("step 2 is done on arrival when the team dependencies are already on", async ({
    page,
    opfs,
  }) => {
    await startTour(page, opfs);
    await sceneLanded(page, 1);
    await openTeamDependencies(page);
    await openViewTab(page, "System");
    await expect(stepDone(page)).toHaveCount(0);
    await walkTo(page, 2);
    await expect(stepDone(page)).toBeVisible();
  });

  test("Back onto an undone step ignores what the visitor did on the step they left, and onto a done one shows it done", async ({
    page,
    opfs,
  }) => {
    await startTour(page, opfs);
    await sceneLanded(page, 1);
    await walkTo(page, 2);
    // Drill in on step 2, then go Back to step 1, whose ask is that drill.
    await openViewTab(page, "System");
    await drillInto(page, ["CommerceApp"], { firstMatch: true });
    await tour(page).getByRole("button", { name: "← Back" }).click();
    await sceneLanded(page, 1);
    await expect(node(page, "CommerceApp")).toBeVisible();
    await expect(stepDone(page)).toHaveCount(0);

    await drillInto(page, ["CommerceApp"], { firstMatch: true });
    await expect(stepDone(page)).toBeVisible();
    await walkTo(page, 2);
    await tour(page).getByRole("button", { name: "← Back" }).click();
    await sceneLanded(page, 1);
    await expect(stepDone(page)).toBeVisible();
  });

  test("Share on step 5 marks it done, and Export SVG does too", async ({ page, opfs }) => {
    await startTour(page, opfs);
    await sceneLanded(page, 1);
    await walkTo(page, 5);
    await expect(stepDone(page)).toHaveCount(0);
    const dialog = await openShareDialog(page);
    await expect(stepDone(page)).toBeVisible();
    await dialog.getByRole("button", { name: /Close/ }).first().click();

    await page.reload();
    await sceneLanded(page, 5);
    await expect(stepDone(page)).toHaveCount(0);
    await clickAndDownload(page.getByRole("button", { name: "Export SVG" }));
    await expect(stepDone(page)).toBeVisible();
  });

  test("a share made in another project does not mark step 5", async ({ page, opfs }) => {
    await startTour(page, opfs);
    await sceneLanded(page, 1);
    await walkTo(page, 5);
    const id = await tourProjectId(page);
    await projectSelect(page).selectOption({ label: "getting-started" });
    await expect(node(page, "ECommerce")).toBeVisible();
    const dialog = await openShareDialog(page);
    await dialog.getByRole("button", { name: /Close/ }).first().click();

    await projectSelect(page).selectOption(id);
    await sceneLanded(page, 5);
    await expect(node(page, "BillingDB")).toBeVisible();
    await expect(stepDone(page)).toHaveCount(0);
  });
});

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const contains = (outer: Box, a: Box) =>
  a.x >= outer.x &&
  a.y >= outer.y &&
  a.x + a.width <= outer.x + outer.width &&
  a.y + a.height <= outer.y + outer.height;

/**
 * Where a step's node sits relative to the preview and the tour panel. The
 * diagram may be larger than the preview, so the whole node need not fit; its
 * name (the first text in the node) must, since that is what the step names.
 */
async function placement(page: Page, id: string, panel: Locator) {
  const [n, name, preview, p] = await Promise.all([
    node(page, id).boundingBox(),
    node(page, id).locator("text").first().boundingBox(),
    page.locator(".preview-container").first().boundingBox(),
    panel.boundingBox(),
  ]);
  if (!n || !name || !preview || !p) return { rendered: false };
  return { rendered: true, nameInPreview: contains(preview, name), underPanel: overlaps(n, p) };
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

/**
 * Per step: the node its text talks about (null when it points at none), and
 * how to tell the step's own scene has rendered. Consecutive scenes share
 * nodes (BillingDB is in planned.krs and migrating.krs), so geometry read
 * before the scene lands would judge the previous step's diagram (TPL-1534).
 */
const STEPS: { node: string | null; ready: (page: Page) => Promise<void> }[] = [
  { node: "CommerceApp", ready: (page) => expect(diffBanner(page)).toHaveCount(0) },
  { node: null, ready: (page) => expect(selectedTab(page, "Org")).toBeVisible() },
  {
    node: "BillingService",
    ready: (page) =>
      expect(node(page, "BillingService")).toHaveAttribute("data-diff-state", "added"),
  },
  {
    node: "BillingDB",
    ready: async (page) => {
      await expect(diffBanner(page)).toHaveCount(0);
      await expect(node(page, "BillingDB")).not.toHaveAttribute("data-diff-state", /.*/);
    },
  },
  { node: null, ready: async () => {} },
];

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

      for (const [i, step] of STEPS.entries()) {
        await expect(panel).toContainText(`${i + 1} / ${STEPS.length}`);
        await step.ready(page);
        const id = step.node;
        if (id) {
          await expect
            .poll(() => placement(page, id, panel))
            .toEqual({ rendered: true, nameInPreview: true, underPanel: false });
        }
        await expect.poll(() => overflowing(panel)).toEqual([]);
        await expect.poll(() => insideViewport(page, panel)).toBe(true);
        if (i < STEPS.length - 1) {
          await panel.getByRole("button", { name: LAYOUT_COPY[lang].next }).click();
        }
      }
    });
  }
});
