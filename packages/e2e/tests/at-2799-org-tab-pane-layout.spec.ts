import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";
import { expectDragPans, expectFitsPane, expectWheelZooms } from "../fixtures/preview-pane.js";

/**
 * AT-2799: the org tab's two sub-modes read through the shared preview pane.
 *
 * Org Tree View and Team Dependencies were the last sub-mode panes outside
 * `PreviewPane`: bare `overflow: auto` divs, so neither got
 * `max-width/max-height: 100%` (no fit-to-pane) and neither reached the
 * wheel/drag handlers (no zoom, no pan). For the tree that is the failure
 * ADR-309 left open as "大規模組織での SVG サイズ上限": a deep org could only
 * be read through a scrollbar, never seen whole.
 *
 * Both diagrams are wide on purpose, so "fits the pane" is a real assertion
 * rather than a trivially-true one:
 *  - the org tree is four levels deep (x grows by `TEAM_W + H_GAP` = 240px per
 *    level, so ~960px of intrinsic width)
 *  - the team dependencies form a four-team chain — Storefront -> Billing ->
 *    Accounting -> Compliance — which the graph lays out as four columns
 *    (`NODE_W + H_GAP` = 256px each)
 */
const ORG_KRS = `system Shop {
  service Checkout {
    domain Cart {
      Cart -> Authorization "Authorize card"
    }
  }

  service Payments {
    domain Authorization {
      Authorization -> Posting "Post entry"
    }
  }

  service Ledger {
    domain Posting {
      Posting -> Trail "Record posting"
    }
  }

  service Audit {
    domain Trail {}
  }
}

organization ShopOrg {
  team Engineering {
    team Platform {
      team Core {
        team Storefront {
          owns Checkout
          member alice { label "Alice" }
        }
      }
    }

    team Billing {
      owns Payments
      member bob { label "Bob" }
    }

    team Accounting {
      owns Ledger
    }

    team Compliance {
      owns Audit
    }
  }
}
`;

const TREE_PANE = ".preview-pane--org-tree";
const DEPENDENCIES_PANE = ".preview-pane--team-dependencies";

async function openTreeView(page: Page) {
  await openViewTab(page, "Org");
  await page.getByRole("button", { name: "Toggle org tree view" }).click();
}

async function openDependencies(page: Page) {
  await openViewTab(page, "Org");
  await page.getByRole("button", { name: "Toggle derived team dependencies" }).click();
}

test.describe("AT-2799 Org tab sub-mode pane layout", () => {
  test("the org tree sits in .preview-container and is scaled to fit the pane", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, ORG_KRS);
    await openTreeView(page);
    await expectFitsPane(page, TREE_PANE);
  });

  test("the org tree zooms on wheel and pans on drag", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, ORG_KRS);
    await openTreeView(page);
    await expectWheelZooms(page, TREE_PANE);
    await expectDragPans(page, TREE_PANE);
  });

  test("clicking a team card still expands its members through the pane", async ({
    page,
    opfs,
  }) => {
    // The click moved from the pane div's own onClick to PreviewPane's mouseup
    // dispatch, which also owns drag-vs-click: a press that moves more than
    // three pixels is a pan, not a click. AT-0044's expand/collapse cases now
    // run on this same path and cover it in full; this asserts it once here so
    // the re-parent's own spec shows the affordance survived.
    await bootMemoryApp(page, opfs, ORG_KRS);
    await openTreeView(page);

    const treePane = page.locator(TREE_PANE);
    await expect(treePane.locator('[data-node-id="bob"]')).toHaveCount(0);

    await treePane.locator('[data-team-id="Billing"]').click();
    await expect(treePane.locator('[data-node-id="bob"]')).toBeVisible();
  });

  test("the team dependency graph sits in .preview-container and is scaled to fit the pane", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, ORG_KRS);
    await openDependencies(page);
    await expectFitsPane(page, DEPENDENCIES_PANE);
  });

  test("the team dependency graph zooms on wheel and pans on drag", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, ORG_KRS);
    await openDependencies(page);
    await expectWheelZooms(page, DEPENDENCIES_PANE);
    await expectDragPans(page, DEPENDENCIES_PANE);
  });

  test("zoom does not carry from Tree View into Dependencies", async ({ page, opfs }) => {
    // Pressing Dependencies while Tree View is on switches "tree" ->
    // "dependencies" in one update. The two panes share a child slot, so this
    // is the switch a missing per-mode `key` shows up on (#2811 review); the
    // grid pane is keyed separately and would hide it.
    await bootMemoryApp(page, opfs, ORG_KRS);
    await openTreeView(page);

    const layer = (pane: string) => page.locator(`${pane} .preview-container > div`).first();
    await page.locator(`${TREE_PANE} .preview-container`).hover();
    await page.mouse.wheel(0, -200);
    await expect
      .poll(() => layer(TREE_PANE).evaluate((el) => (el as HTMLElement).style.transform))
      .toContain("scale(1.1)");

    await page.getByRole("button", { name: "Toggle derived team dependencies" }).click();
    await expect(page.locator(TREE_PANE)).toHaveCount(0);
    await expect
      .poll(() => layer(DEPENDENCIES_PANE).evaluate((el) => (el as HTMLElement).style.transform))
      .toBe("translate(0px, 0px) scale(1)");
  });
});
