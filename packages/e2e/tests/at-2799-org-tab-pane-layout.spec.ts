import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { openViewTab } from "../fixtures/tabs.js";

/**
 * AT-2799: the org tab's two sub-modes read through the shared preview pane.
 *
 * Org Tree View and Team Dependencies were the last diagram surfaces outside
 * `PreviewPane` — bare `overflow: auto` divs, so neither got
 * `max-width/max-height: 100%` (no fit-to-pane) and neither reached the
 * wheel/drag handlers (no zoom, no pan). For the tree that is the failure
 * ADR-309 left open as "大規模組織での SVG サイズ上限": a deep org could only
 * be read through a scrollbar, never seen whole.
 *
 * The org tree here is deliberately four levels deep (x grows by
 * `TEAM_W + H_GAP` per level, so ~960px of intrinsic width) so "fits the pane"
 * is a real assertion rather than a trivially-true one.
 */
const ORG_KRS = `system Shop {
  service Checkout {
    domain Cart {
      Cart -> Authorization "Authorize card"
    }
  }

  service Payments {
    domain Authorization {}
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
  }
}
`;

const treeToggle = (page: Page) => page.getByRole("button", { name: "Toggle org tree view" });
const dependenciesToggle = (page: Page) =>
  page.getByRole("button", { name: "Toggle derived team dependencies" });

/** Both sub-modes live on the Org tab, behind their own toolbar toggle. */
async function openOrgTab(page: Page) {
  await openViewTab(page, "Org");
}

/**
 * The structural fence shared by both panes: the SVG sits inside
 * `.preview-container` — the element the wheel listener is bound to and the one
 * the fit rules are scoped to — and the diagram is drawn no wider than the pane.
 */
async function expectFittedInSharedContainer(page: Page, paneSelector: string) {
  const pane = page.locator(paneSelector);
  await expect(pane).toBeVisible();

  const container = pane.locator(".preview-container");
  await expect(container).toHaveCount(1);
  await expect(container.locator("svg")).toBeVisible();

  const { intrinsic, drawn, paneWidth } = await pane.evaluate((el) => {
    const svg = el.querySelector("svg") as SVGSVGElement;
    const vb = svg.getAttribute("viewBox")?.split(/\s+/) ?? [];
    return {
      intrinsic: Number(vb[2] ?? 0),
      drawn: svg.getBoundingClientRect().width,
      paneWidth: el.getBoundingClientRect().width,
    };
  });
  return { intrinsic, drawn, paneWidth };
}

/** Wheel over the pane changes the zoom layer's transform. */
async function expectWheelZooms(page: Page, paneSelector: string) {
  const zoomLayer = page.locator(`${paneSelector} .preview-container > div`).first();
  await expect(zoomLayer).toBeVisible();
  const before = await zoomLayer.evaluate((el) => (el as HTMLElement).style.transform);

  await page.locator(`${paneSelector} .preview-container`).hover();
  await page.mouse.wheel(0, -200);

  await expect
    .poll(() => zoomLayer.evaluate((el) => (el as HTMLElement).style.transform))
    .not.toEqual(before);
}

test.describe("AT-2799 Org tab sub-mode pane layout", () => {
  test("the org tree sits in .preview-container and is scaled to fit the pane", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, ORG_KRS);
    await openOrgTab(page);
    await treeToggle(page).click();

    const { intrinsic, drawn, paneWidth } = await expectFittedInSharedContainer(
      page,
      ".preview-pane--org-tree",
    );
    expect(intrinsic).toBeGreaterThan(paneWidth);
    expect(drawn).toBeLessThanOrEqual(paneWidth + 1);
  });

  test("wheel over the org tree zooms it", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, ORG_KRS);
    await openOrgTab(page);
    await treeToggle(page).click();

    await expectWheelZooms(page, ".preview-pane--org-tree");
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
    await openOrgTab(page);
    await treeToggle(page).click();

    const treePane = page.locator(".preview-pane--org-tree");
    await expect(treePane.locator('[data-node-id="bob"]')).toHaveCount(0);

    await treePane.locator('[data-team-id="Billing"]').click();
    await expect(treePane.locator('[data-node-id="bob"]')).toBeVisible();
  });

  test("the team dependency graph sits in .preview-container and is zoomable", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, ORG_KRS);
    await openOrgTab(page);
    await dependenciesToggle(page).click();

    await expectFittedInSharedContainer(page, ".preview-pane--team-dependencies");
    await expectWheelZooms(page, ".preview-pane--team-dependencies");
  });
});
