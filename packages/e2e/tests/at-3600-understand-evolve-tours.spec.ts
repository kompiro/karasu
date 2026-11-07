import { type Page } from "@playwright/test";
import { drillInto } from "../fixtures/drill.js";
import { replaceEditorContent } from "../fixtures/editor.js";
import { pressChord } from "../fixtures/keyboard.js";
import { expect, test, type OpfsFixture } from "../fixtures/opfs.js";
import { openShareDialog } from "../fixtures/share.js";
import { selectedTab } from "../fixtures/tabs.js";

/**
 * AT-3600: Understand an existing system and Track architecture evolution are
 * guided tours on the mechanism Design a service split has (AT-3563). They
 * resume, mark what a step asks for and restart the same way. Understand uses
 * a Getting Started that still matches the sample, and Evolve a new copy of
 * service-split. Where each step's node sits is decided in AT-3563's layout
 * block.
 */

const tour = (page: Page) => page.getByRole("region", { name: "Guided tour" });
const next = (page: Page) => tour(page).getByRole("button", { name: "Next →" });
const stepDone = (page: Page) => tour(page).getByText(/✓ Done/);
const diffBanner = (page: Page) => page.getByRole("status", { name: "Diff mode active" });
const projects = (page: Page) => page.getByRole("combobox", { name: "Project" });
const copies = (page: Page, name: RegExp) => projects(page).getByRole("option", { name });

function node(page: Page, id: string) {
  return page.locator(`.preview-container svg [data-node-id="${id}"]`).first();
}

async function start(page: Page, opfs: OpfsFixture, entry: RegExp) {
  await opfs.reset({ showWelcome: true });
  await opfs.gotoApp();
  await page.getByRole("button", { name: entry }).click();
  await sceneLanded(page, 1);
}

const UNDERSTAND = /Understand an existing system/;
const EVOLVE = /Track architecture evolution/;

async function sceneLanded(page: Page, step: number) {
  await expect(tour(page)).toContainText(`${step} / 4`);
  await expect(tour(page)).toHaveAttribute("data-scene-landed", "true");
}

async function runCommand(page: Page, name: string) {
  await pressChord(page, "Shift+P");
  await page.getByRole("combobox", { name: "Search commands" }).fill(name);
  await page.keyboard.press("Enter");
}

test.describe("AT-3600 Understand an existing system", () => {
  test("walks the system, deploy and org views of Getting Started, and ends on sharing", async ({
    page,
    opfs,
  }) => {
    await start(page, opfs, UNDERSTAND);
    await expect(tour(page)).toContainText("Understand an existing system");
    await expect(selectedTab(page, "System")).toBeVisible();
    await expect(node(page, "ECommerce")).toBeVisible();

    await next(page).click();
    await sceneLanded(page, 2);
    await expect(selectedTab(page, "Deploy")).toBeVisible();

    await next(page).click();
    await sceneLanded(page, 3);
    await expect(selectedTab(page, "Org")).toBeVisible();

    await tour(page).getByRole("button", { name: "← Back" }).click();
    await sceneLanded(page, 2);
    await expect(selectedTab(page, "Deploy")).toBeVisible();

    await next(page).click();
    await next(page).click();
    await sceneLanded(page, 4);
    await expect(selectedTab(page, "System")).toBeVisible();
    await tour(page).getByRole("button", { name: "✓ Continue to editor" }).click();
    await expect(tour(page)).toHaveCount(0);
    await expect(node(page, "ECommerce")).toBeVisible();
  });

  test("marks the drill into EC Site on step 1 and a share on step 4 done", async ({
    page,
    opfs,
  }) => {
    await start(page, opfs, UNDERSTAND);
    await expect(stepDone(page)).toHaveCount(0);
    await drillInto(page, ["ECommerce"], { firstMatch: true });
    await expect(stepDone(page)).toBeVisible();

    await next(page).click();
    await sceneLanded(page, 2);
    await expect(stepDone(page)).toHaveCount(0);
    await next(page).click();
    await next(page).click();
    await sceneLanded(page, 4);
    await expect(stepDone(page)).toHaveCount(0);
    const dialog = await openShareDialog(page);
    await expect(stepDone(page)).toBeVisible();
    await dialog.getByRole("button", { name: /Close/ }).first().click();
  });

  test("opens a new copy when Getting Started was edited, leaving the edited one as it is", async ({
    page,
    opfs,
  }) => {
    const edited = "system Shop {\n  service Api\n}\n";
    await opfs.seed({
      projects: [{ id: "gs", name: "getting-started", files: { "index.krs": edited } }],
      lastProjectId: "gs",
    });
    await opfs.gotoApp();
    await expect(node(page, "Api")).toBeVisible();

    await runCommand(page, "Show Welcome");
    await page.getByRole("button", { name: UNDERSTAND }).click();
    await sceneLanded(page, 1);
    await expect(node(page, "ECommerce")).toBeVisible();
    await expect(copies(page, /getting-started/)).toHaveCount(2);

    await projects(page).selectOption("gs");
    await expect(node(page, "Api")).toBeVisible();

    // The copy is unedited, so a second Understand goes back to it.
    await runCommand(page, "Show Welcome");
    await page.getByRole("button", { name: UNDERSTAND }).click();
    await sceneLanded(page, 1);
    await expect(node(page, "ECommerce")).toBeVisible();
    await expect(copies(page, /getting-started/)).toHaveCount(2);
  });

  test("a reload on step 2 comes back to the same guide and step", async ({ page, opfs }) => {
    await start(page, opfs, UNDERSTAND);
    await next(page).click();
    await sceneLanded(page, 2);

    await page.reload();
    await sceneLanded(page, 2);
    await expect(tour(page)).toContainText("Understand an existing system");
    await expect(selectedTab(page, "Deploy")).toBeVisible();
  });

  test("Restart Guided Tour… redoes it in the same project", async ({ page, opfs }) => {
    await start(page, opfs, UNDERSTAND);
    await next(page).click();
    await sceneLanded(page, 2);

    await runCommand(page, "Restart Guided Tour");
    await sceneLanded(page, 1);
    await expect(tour(page)).toContainText("Understand an existing system");
    await expect(selectedTab(page, "System")).toBeVisible();
    await expect(copies(page, /getting-started/)).toHaveCount(1);
  });

  // TPL-1535: a scene on the open file keeps the buffer. Whether the save beat
  // Next is timing, decided in use-guided-scene.test.ts with a slow file system.
  test("an edit made during a step stays when Next stays on the file", async ({ page, opfs }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await start(page, opfs, UNDERSTAND);
    const edited = "system Mine {\n  service EditedInTheTour\n}\n";
    await replaceEditorContent(page, edited);
    await next(page).click();
    await sceneLanded(page, 2);

    await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(
      "EditedInTheTour",
    );
    await page.reload();
    await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(
      "EditedInTheTour",
    );
  });
});

test.describe("AT-3600 Track architecture evolution", () => {
  test("compares the migration with today, reads the marks, compares the target, and ends on sharing", async ({
    page,
    opfs,
  }) => {
    await start(page, opfs, EVOLVE);
    await expect(tour(page)).toContainText("Track architecture evolution");
    await expect(diffBanner(page)).toContainText("index.krs");
    await expect(diffBanner(page)).toContainText("migrating.krs");
    await expect(node(page, "BillingService")).toHaveAttribute("data-diff-state", "added");

    await next(page).click();
    await sceneLanded(page, 2);
    await expect(diffBanner(page)).toHaveCount(0);
    await expect(node(page, "BillingDB")).toBeVisible();

    await next(page).click();
    await sceneLanded(page, 3);
    await expect(diffBanner(page)).toContainText("migrating.krs");
    await expect(diffBanner(page)).toContainText("planned.krs");

    await next(page).click();
    await sceneLanded(page, 4);
    await expect(diffBanner(page)).toHaveCount(0);
    await tour(page).getByRole("button", { name: "✓ Continue to editor" }).click();
    await expect(tour(page)).toHaveCount(0);
  });

  test("marks the drill into Commerce Database on step 2 done, where the deprecated tables show", async ({
    page,
    opfs,
  }) => {
    await start(page, opfs, EVOLVE);
    await next(page).click();
    await sceneLanded(page, 2);
    await expect(stepDone(page)).toHaveCount(0);
    await drillInto(page, ["CommerceDB"], { firstMatch: true });
    await expect(stepDone(page)).toBeVisible();
    await expect(node(page, "Invoices")).toBeVisible();
    await expect(node(page, "Invoices")).toContainText("Deprecated");
  });

  test("Skip on the target diff ends the tour and leaves diff mode", async ({ page, opfs }) => {
    await start(page, opfs, EVOLVE);
    await next(page).click();
    await next(page).click();
    await sceneLanded(page, 3);
    await expect(diffBanner(page)).toBeVisible();

    await tour(page).getByRole("button", { name: "✕ Skip tour" }).click();
    await expect(tour(page)).toHaveCount(0);
    await expect(diffBanner(page)).toHaveCount(0);
  });

  test("a reload on step 3 comes back to the same guide and step, with its diff", async ({
    page,
    opfs,
  }) => {
    await start(page, opfs, EVOLVE);
    await next(page).click();
    await next(page).click();
    await sceneLanded(page, 3);

    await page.reload();
    await sceneLanded(page, 3);
    await expect(tour(page)).toContainText("Track architecture evolution");
    await expect(diffBanner(page)).toContainText("migrating.krs");
    await expect(diffBanner(page)).toContainText("planned.krs");
  });

  test("Restart Guided Tour… redoes it in the same copy, and each start opens its own", async ({
    page,
    opfs,
  }) => {
    await start(page, opfs, EVOLVE);
    await next(page).click();
    await sceneLanded(page, 2);

    await runCommand(page, "Restart Guided Tour");
    await sceneLanded(page, 1);
    await expect(tour(page)).toContainText("Track architecture evolution");
    await expect(diffBanner(page)).toBeVisible();
    await expect(copies(page, /service-split/)).toHaveCount(1);

    await runCommand(page, "Show Welcome");
    await page.getByRole("button", { name: EVOLVE }).click();
    await expect(copies(page, /service-split/)).toHaveCount(2);
  });

  test("leaving its project hides the panel, and coming back shows the step's diff again", async ({
    page,
    opfs,
  }) => {
    await start(page, opfs, EVOLVE);
    const copy = await projects(page).inputValue();
    await projects(page).selectOption({ label: "getting-started" });
    await expect(node(page, "ECommerce")).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
    await expect(diffBanner(page)).toHaveCount(0);

    await projects(page).selectOption(copy);
    await sceneLanded(page, 1);
    await expect(diffBanner(page)).toContainText("migrating.krs");
  });
});
