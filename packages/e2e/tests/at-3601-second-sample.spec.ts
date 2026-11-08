import { type Page } from "@playwright/test";
import { drillInto } from "../fixtures/drill.js";
import { replaceEditorContent } from "../fixtures/editor.js";
import { pressChord } from "../fixtures/keyboard.js";
import { expect, test, type OpfsFixture } from "../fixtures/opfs.js";
import { selectedTab } from "../fixtures/tabs.js";

/**
 * AT-3601: the Design a service split guide on a second subject. Step 1 offers
 * to walk the same guide on a payroll system, and the way back. Where each
 * step's node sits, and the panel's text in both languages, are decided in
 * AT-3563's layout block.
 */

const tour = (page: Page) => page.getByRole("region", { name: "Guided tour" });
const next = (page: Page) => tour(page).getByRole("button", { name: "Next →" });
const toPayroll = (page: Page) =>
  tour(page).getByRole("button", { name: /Try it with a payroll system/ });
const toShop = (page: Page) =>
  tour(page).getByRole("button", { name: /Try it with an online shop/ });
const diffBanner = (page: Page) => page.getByRole("status", { name: "Diff mode active" });
const projects = (page: Page) => page.getByRole("combobox", { name: "Project" });
const copies = (page: Page, name: RegExp) => projects(page).getByRole("option", { name });

function node(page: Page, id: string) {
  return page.locator(`.preview-container svg [data-node-id="${id}"]`).first();
}

async function sceneLanded(page: Page, step: number) {
  await expect(tour(page)).toContainText(`${step} / 5`);
  await expect(tour(page)).toHaveAttribute("data-scene-landed", "true");
}

async function startDesign(page: Page, opfs: OpfsFixture) {
  await opfs.reset({ showWelcome: true });
  await opfs.gotoApp();
  await page.getByRole("button", { name: /Design a service split/ }).click();
  await sceneLanded(page, 1);
  await expect(node(page, "CommerceApp")).toBeVisible();
}

async function switchToPayroll(page: Page) {
  await toPayroll(page).click();
  await expect(tour(page)).toContainText("Workforce Application");
  await sceneLanded(page, 1);
  await expect(node(page, "WorkforceApp")).toBeVisible();
}

async function runCommand(page: Page, name: string) {
  await pressChord(page, "Shift+P");
  await page.getByRole("combobox", { name: "Search commands" }).fill(name);
  await page.keyboard.press("Enter");
}

test.describe("AT-3601 switching the guide's subject", () => {
  test("walks the five steps on the payroll sample after switching on step 1", async ({
    page,
    opfs,
  }) => {
    await startDesign(page, opfs);
    await switchToPayroll(page);
    await expect(tour(page)).toContainText("Design a service split");
    await expect(projects(page).locator("option:checked")).toHaveText("payroll-split");

    // The step's ask is the payroll sample's node, with nothing carried over.
    await expect(tour(page).getByText(/✓ Done/)).toHaveCount(0);
    await drillInto(page, ["WorkforceApp"], { firstMatch: true });
    await expect(tour(page).getByText(/✓ Done/)).toBeVisible();

    await next(page).click();
    await sceneLanded(page, 2);
    await expect(selectedTab(page, "Org")).toBeVisible();
    await expect(tour(page)).toContainText("The Payroll Team owns the Payroll domain");

    await next(page).click();
    await sceneLanded(page, 3);
    await expect(diffBanner(page)).toBeVisible();
    await expect(node(page, "PayrollService")).toHaveAttribute("data-diff-state", "added");

    await next(page).click();
    await sceneLanded(page, 4);
    await expect(diffBanner(page)).toHaveCount(0);
    await expect(node(page, "PayrollDB")).toBeVisible();
    await expect(tour(page)).toContainText("What does an independent Payroll Service improve?");

    await next(page).click();
    await sceneLanded(page, 5);
    await tour(page).getByRole("button", { name: "✓ Continue to editor" }).click();
    await expect(tour(page)).toHaveCount(0);
  });

  test("offers the switch on step 1 only", async ({ page, opfs }) => {
    await startDesign(page, opfs);
    await expect(toPayroll(page)).toBeVisible();
    await next(page).click();
    await sceneLanded(page, 2);
    await expect(toPayroll(page)).toHaveCount(0);
    await tour(page).getByRole("button", { name: "← Back" }).click();
    await sceneLanded(page, 1);
    await expect(toPayroll(page)).toBeVisible();
  });

  test("going back and forth adds no copies", async ({ page, opfs }) => {
    await startDesign(page, opfs);
    await switchToPayroll(page);
    await toShop(page).click();
    await expect(tour(page)).toContainText("Commerce Application");
    await sceneLanded(page, 1);
    await switchToPayroll(page);

    await expect(copies(page, /^service-split/)).toHaveCount(1);
    await expect(copies(page, /^payroll-split/)).toHaveCount(1);
  });

  test("a copy the visitor edited stays as it is, and the guide gets a new one", async ({
    page,
    opfs,
  }) => {
    await startDesign(page, opfs);
    await switchToPayroll(page);
    await replaceEditorContent(page, 'system Mine { label "Mine" }\n');
    await expect(node(page, "WorkforceApp")).toHaveCount(0);

    await toShop(page).click();
    await expect(tour(page)).toContainText("Commerce Application");
    await sceneLanded(page, 1);
    await toPayroll(page).click();
    await expect(tour(page)).toContainText("Workforce Application");
    await sceneLanded(page, 1);

    await expect(copies(page, /^payroll-split/)).toHaveCount(2);
    await expect(projects(page).locator("option:checked")).toHaveText("payroll-split (2)");
    await expect(node(page, "WorkforceApp")).toBeVisible();
  });

  test("a reload comes back to the same step of the guide switched to", async ({ page, opfs }) => {
    await startDesign(page, opfs);
    await switchToPayroll(page);
    await next(page).click();
    await next(page).click();
    await sceneLanded(page, 3);

    await page.reload();
    await sceneLanded(page, 3);
    await expect(tour(page)).toContainText("What if Payroll became an independent service?");
    await expect(node(page, "PayrollService")).toHaveAttribute("data-diff-state", "added");
  });

  test("Restart Guided Tour… walks the guide switched to, in its project", async ({
    page,
    opfs,
  }) => {
    await startDesign(page, opfs);
    await switchToPayroll(page);
    await next(page).click();
    await sceneLanded(page, 2);

    await runCommand(page, "Restart Guided Tour");
    await sceneLanded(page, 1);
    await expect(tour(page)).toContainText("Workforce Application");
    await expect(copies(page, /^payroll-split/)).toHaveCount(1);
  });

  test("going back to the previous subject's project shows no panel", async ({ page, opfs }) => {
    await startDesign(page, opfs);
    await switchToPayroll(page);
    await projects(page).selectOption({ label: "service-split" });
    await expect(node(page, "CommerceApp")).toBeVisible();
    await expect(tour(page)).toHaveCount(0);
    await expect(copies(page, /^service-split/)).toHaveCount(1);
  });
});
