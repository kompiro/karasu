import { type Page, expect, test } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0044: Org Tree View.
 *
 * Covers the deterministic DOM-observable parts of the AT:
 *  - Tree View toggle visibility per tab
 *  - Tree View renders top-level teams as roots (org block label suppressed)
 *  - Sub-teams render as children
 *  - Click-to-expand/collapse members (single and multiple teams)
 *  - Breadcrumb hidden while Tree View is active
 *  - SVG export in tree mode uses `-tree.svg` filename and embeds all members
 *  - Multiple organization blocks stack their top-level teams as roots
 *
 * Out of scope (handled by AI visual review):
 *  - Bezier connector geometry and spacing
 *  - Precise card positioning
 */

const ORG_KRS = `organization Acme {
  team Engineering {
    team Backend {
      member alice { label "Alice" }
      member bob   { label "Bob" }
    }
    team Frontend {
      member carol { label "Carol" }
    }
  }
  team Product {
    member dave { label "Dave" }
  }
}
`;

const TWO_ORGS_KRS = `organization Acme {
  team Engineering {
    member alice { label "Alice" }
  }
}

organization Globex {
  team Operations {
    member eve { label "Eve" }
  }
}
`;

async function openOrgTab(page: Page) {
  await page.getByRole("tab", { name: /Org/ }).click();
}

async function activateTreeView(page: Page) {
  await page.getByRole("button", { name: "Toggle org tree view" }).click();
}

test.describe("AT-0044 Org Tree View", () => {
  test("Tree View toggle appears on Org tab only (Case 1)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, ORG_KRS);

    // ORG_KRS has no system block, so `useAutoSwitchToOrg` (#817) fires and
    // lands the user on the Org tab automatically. Explicitly navigate back
    // to System to verify the toggle is not rendered there.
    await page.getByRole("tab", { name: "System" }).click();
    await expect(page.getByRole("tab", { name: "System", selected: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Toggle org tree view" })).toHaveCount(0);

    await openOrgTab(page);
    await expect(page.getByRole("button", { name: "Toggle org tree view" })).toBeVisible();
  });

  test("Activating Tree View renders top-level teams as roots and hides breadcrumb (Cases 2 & 3)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, ORG_KRS);
    await openOrgTab(page);

    const breadcrumb = page.locator(".breadcrumb");
    await expect(breadcrumb).toBeVisible();

    await activateTreeView(page);

    // Button becomes active
    await expect(page.getByRole("button", { name: "Toggle org tree view" })).toHaveClass(/active/);

    // Breadcrumb bar is hidden
    await expect(breadcrumb).toHaveCount(0);

    // Top-level teams appear as roots; organization block label ("Acme") is NOT shown
    const treePane = page.locator(".preview-pane--org-tree");
    await expect(treePane.locator('[data-team-id="Engineering"]')).toBeVisible();
    await expect(treePane.locator('[data-team-id="Product"]')).toBeVisible();
    await expect(treePane.locator('[data-team-id="Acme"]')).toHaveCount(0);

    // Team cards show member-count indicator in collapsed state
    await expect(treePane.getByText("1 member ▾").first()).toBeVisible();
  });

  test("Sub-teams render to the right of their parent (Case 4, DOM only)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, ORG_KRS);
    await openOrgTab(page);
    await activateTreeView(page);

    const treePane = page.locator(".preview-pane--org-tree");
    await expect(treePane.locator('[data-team-id="Backend"]')).toBeVisible();
    await expect(treePane.locator('[data-team-id="Frontend"]')).toBeVisible();
  });

  test("Click to expand members; click again to collapse (Cases 5 & 7)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, ORG_KRS);
    await openOrgTab(page);
    await activateTreeView(page);

    const treePane = page.locator(".preview-pane--org-tree");

    // Initially no member leaf nodes for Backend's children
    await expect(treePane.locator('[data-node-id="alice"]')).toHaveCount(0);
    await expect(treePane.locator('[data-node-id="bob"]')).toHaveCount(0);

    await treePane.locator('[data-team-id="Backend"]').click();

    await expect(treePane.locator('[data-node-id="alice"]')).toBeVisible();
    await expect(treePane.locator('[data-node-id="bob"]')).toBeVisible();

    // Indicator flipped to expanded state — the "2 members ▴" label appears
    await expect(treePane.getByText("2 members ▴")).toBeVisible();

    // Collapse
    await treePane.locator('[data-team-id="Backend"]').click();
    await expect(treePane.locator('[data-node-id="alice"]')).toHaveCount(0);
    await expect(treePane.locator('[data-node-id="bob"]')).toHaveCount(0);
    await expect(treePane.getByText("2 members ▾")).toBeVisible();
  });

  test("Multiple teams can be expanded simultaneously (Case 6)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, ORG_KRS);
    await openOrgTab(page);
    await activateTreeView(page);

    const treePane = page.locator(".preview-pane--org-tree");
    await treePane.locator('[data-team-id="Backend"]').click();
    await treePane.locator('[data-team-id="Frontend"]').click();

    await expect(treePane.locator('[data-node-id="alice"]')).toBeVisible();
    await expect(treePane.locator('[data-node-id="bob"]')).toBeVisible();
    await expect(treePane.locator('[data-node-id="carol"]')).toBeVisible();
  });

  test("Deactivating Tree View restores breadcrumb bar (Case 8)", async ({ page }) => {
    await page.goto("/");
    await replaceEditorContent(page, ORG_KRS);
    await openOrgTab(page);
    await activateTreeView(page);

    await expect(page.locator(".breadcrumb")).toHaveCount(0);
    await expect(page.locator(".preview-pane--org-tree")).toBeVisible();

    await activateTreeView(page);

    await expect(page.locator(".breadcrumb")).toBeVisible();
    await expect(page.locator(".preview-pane--org-tree")).toHaveCount(0);
  });

  test("Export SVG in Tree View produces `-tree.svg` with all members embedded (Case 9)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, ORG_KRS);
    await openOrgTab(page);
    // Wait for the new ORG_KRS content to be reflected in the rendered SVG
    // before exporting — otherwise the export can capture the seed's org
    // SVG. `Engineering` is a top-level team unique to ORG_KRS, so its
    // presence proves the seed has been replaced. (Members like `dave` are
    // not visible until the team is expanded, so we cannot wait on them.)
    await expect(page.locator("svg").first()).toContainText("Engineering");
    await activateTreeView(page);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export SVG" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/-tree\.svg$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString("utf-8");

    expect(content).toContain("<svg");
    expect(content).toContain("</svg>");
    // All members are embedded regardless of the app's expand state
    for (const memberId of ["alice", "bob", "carol", "dave"]) {
      expect(content).toContain(`data-node-id="${memberId}"`);
    }
  });

  test("Multiple organizations — top-level teams from each org appear as roots (Case 10)", async ({
    page,
  }) => {
    await page.goto("/");
    await replaceEditorContent(page, TWO_ORGS_KRS);
    await openOrgTab(page);
    await activateTreeView(page);

    const treePane = page.locator(".preview-pane--org-tree");
    await expect(treePane.locator('[data-team-id="Engineering"]')).toBeVisible();
    await expect(treePane.locator('[data-team-id="Operations"]')).toBeVisible();
    await expect(treePane.locator('[data-team-id="Acme"]')).toHaveCount(0);
    await expect(treePane.locator('[data-team-id="Globex"]')).toHaveCount(0);
  });
});
