import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-1907: Entity view app integration (PR 2b-1).
 *
 * Covers the deterministic DOM/URL-observable parts of the AT:
 *  - The "Entities" toggle appears only when drilled into a domain that owns
 *    entities (system view sub-mode, not a top-level tab)
 *  - Activating it renders the domain's entities + intra-domain relation and
 *    excludes usecases
 *  - The URL hash reflects the entity sub-mode as `#krs-entity-<domainId>`
 *  - Deactivating restores the usecase view
 *  - SVG export in entity mode uses the `-entity.svg` filename
 *
 * Out of scope (unit-tested): buildHash/parseHash round-trip and share-payload
 * `entityView` flag (packages/app useHistoryNavigation.test / inline-share.test),
 * and the core slice/render (packages/core renderEntityView tests).
 */

const ENTITY_KRS = `system EC {
  service OrderService {
    domain Ordering {
      usecase PlaceOrder {}
      entity Order {
        Order -> LineItem "has"
      }
      entity LineItem {}
    }
  }
}
`;

async function drillIntoOrderingDomain(page: Page) {
  await page.locator('svg [data-node-id="OrderService"]').first().click();
  await page.locator('svg [data-node-id="Ordering"]').first().click();
}

const entityToggle = (page: Page) => page.getByRole("button", { name: "Toggle entity view" });

test.describe("AT-1907 Entity view app integration", () => {
  test("Entities toggle appears only when drilled into a domain with entities", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, ENTITY_KRS);

    // At the system root there is no drilled domain → no toggle.
    await expect(entityToggle(page)).toHaveCount(0);

    // Drill into the service — still not a domain → no toggle.
    await page.locator('svg [data-node-id="OrderService"]').first().click();
    await expect(entityToggle(page)).toHaveCount(0);

    // Drill into the domain that owns entities → toggle appears.
    await page.locator('svg [data-node-id="Ordering"]').first().click();
    await expect(entityToggle(page)).toBeVisible();
  });

  test("Activating the entity view renders entities + relation, excludes usecases, and sets the hash", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, ENTITY_KRS);
    await drillIntoOrderingDomain(page);

    // Usecase view first: PlaceOrder is shown, entities are not.
    await expect(page.locator('svg [data-node-id="PlaceOrder"]').first()).toBeVisible();

    await entityToggle(page).click();
    await expect(entityToggle(page)).toHaveAttribute("aria-pressed", "true");

    const entityPane = page.locator(".preview-pane--entity");
    await expect(entityPane).toBeVisible();
    await expect(entityPane.locator('[data-node-id="Order"]')).toBeVisible();
    await expect(entityPane.locator('[data-node-id="LineItem"]')).toBeVisible();
    // Usecases do not appear in the entity view.
    await expect(entityPane.locator('[data-node-id="PlaceOrder"]')).toHaveCount(0);

    // The URL hash reflects the entity sub-mode, keyed by the domain id. The
    // `?file=` suffix (persisted open file, Issue #811) may follow it.
    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#krs-entity-Ordering(\?file=|$)/);
  });

  test("Deactivating the entity view restores the usecase view", async ({ page, opfs }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, ENTITY_KRS);
    await drillIntoOrderingDomain(page);

    await entityToggle(page).click();
    await expect(page.locator(".preview-pane--entity")).toBeVisible();

    await entityToggle(page).click();
    await expect(page.locator(".preview-pane--entity")).toHaveCount(0);
    await expect(page.locator('svg [data-node-id="PlaceOrder"]').first()).toBeVisible();
  });

  test("Export SVG in entity mode uses the `-entity.svg` filename with entity nodes embedded", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, ENTITY_KRS);
    await drillIntoOrderingDomain(page);
    await entityToggle(page).click();
    await expect(page.locator(".preview-pane--entity")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export SVG" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/-entity\.svg$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString("utf-8");
    expect(content).toContain("<svg");
    expect(content).toContain('data-node-id="Order"');
    expect(content).toContain('data-node-id="LineItem"');
  });

  // "Group by frames an entity member once selected, without leaving the
  // entity view (#1983)" — not e2e-testable from the live app right now.
  //
  // `renderEntityView` never received `groupBy` before #1983; this PR wires
  // it, and the core render math is unit-tested in
  // packages/core/src/renderer/group-by-drilldown-render.test.ts and
  // packages/app/src/hooks/useViewSvg.test.tsx (both call the
  // function/hook directly with an explicit `groupBy` argument). But driven
  // through the real UI, the frame never appears, for two independent
  // reasons:
  //
  //  1. `owns` (team axis) structurally excludes `entity` — it is only
  //     indexed for service/domain/client (+ top-level infra) in
  //     `buildNodePathIndex` (packages/core/src/parser/parser.ts). An entity
  //     can only ever be grouped via the `boundary` axis (`contains` has no
  //     kind restriction).
  //  2. `boundary` never reaches this surface: AppShell hardcodes
  //     `views.system.groupBy === "team" ? "team" : undefined` when calling
  //     `useViewSvg` (packages/app/src/components/AppShell.tsx:228, added by
  //     #1879 before the boundary axis existed). The P2b-B boundary-axis
  //     rollout (#1973) updated the selector, `useSystemView`, and every core
  //     render path, but not this call site — so `groupBy: "boundary"` is
  //     silently dropped before it reaches the entity view AND the three
  //     export builders (Show All Layers / drill-down export / Open All
  //     Views), even though the "Boundary" option is offered in the UI.
  //     Confirmed live: selecting Boundary and toggling Show All Layers on a
  //     `boundary`-only fixture exports zero group frames.
  //
  // This looks like a pre-existing parity gap (TPL-20260510-11 / the very
  // TPL-20260716-02 this PR introduces), not something introduced by this
  // diff — flagged for a human decision rather than patched here. Re-enable
  // once AppShell forwards `views.system.groupBy` unfiltered (mirroring the
  // `groupBy === "none" ? undefined : groupBy` used for the main system view).
  test.skip("Group by: boundary frames an entity member (blocked — see comment)", () => {});
});
