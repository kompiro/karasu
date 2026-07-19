import type { Page } from "@playwright/test";
import { expect, test, type OpfsFixture } from "../fixtures/opfs.js";

/**
 * AT-0041 (bundled all-views SVG) driven through the AT-0043 popup.
 *
 * The bundled SVG's browser-level navigation — CSS `:target` tab switching,
 * drill-down, the "← Back" control, and disabled tabs — was long declared "not
 * headlessly drivable" and left to manual / AI visual review (see the former
 * header of `at-0043-all-views-preview.spec.ts`). It is drivable: opening the
 * `blob:` popup yields a fully scriptable `Page` for the SVG document, and the
 * `:target` / `:has()` effects are observable via `getComputedStyle`.
 *
 * The Back control is asserted as a working affordance — the paint-order bug
 * (#2044, back button occluded by the level canvas rect) was fixed in #2051 and
 * is fenced at the unit layer by `drill-down-svg.test.ts`; this is its
 * browser-level counterpart.
 */

const FULL_KRS = `system Shop {
  service Store {
    domain Catalog {
      usecase Browse {}
    }
  }
  service Billing
  Store -> Billing "charges"
}

deploy Prod {
  oci "store-svc" { realizes Store }
  oci "billing-svc" { realizes Billing }
}

organization Acme {
  team Core {
    team Platform {
      member alice { label "Alice" }
    }
  }
}
`;

const NO_ORG_KRS = `system Shop {
  service Store
  service Billing
  Store -> Billing "charges"
}

deploy Prod {
  oci "store-svc" { realizes Store }
}
`;

async function openPopup(page: Page) {
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open all views in new window" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  return popup;
}

async function seedAndOpen(page: Page, opfs: OpfsFixture, krs: string) {
  await opfs.seed({
    projects: [{ id: "p", name: "P", files: { "index.krs": krs } }],
    lastProjectId: "p",
  });
  await opfs.gotoApp();
  await page.locator(".file-tree-item", { hasText: "index.krs" }).first().click();
  await expect(page.locator('svg [data-node-id="Store"]').first()).toBeVisible();
  return openPopup(page);
}

// Pane visibility is controlled on the `.krs-pane--<type>` group itself:
// `.krs-pane { display:none }` + `.krs-pane--system { display:block }` +
// `:has([id^=krs-…]:target)` overrides (buildAllViewsCss).
const paneDisplay = (popup: Page, type: string) =>
  popup.locator(`.krs-pane--${type}`).evaluate((el) => getComputedStyle(el).display);

const tabFill = (popup: Page, type: string) =>
  popup.locator(`.krs-tab--${type} rect`).evaluate((el) => getComputedStyle(el).fill);

// Tab anchors must be scoped to the tab bar: a drill level's "← Back" anchor
// shares its href with a tab (e.g. both the Org tab and #krs-org-Core's Back
// button point at "#krs-org-root"), so a bare a[href=…] locator is ambiguous
// under strict mode. Same for node drill anchors vs. deeper levels' Back
// targets — scope those to their containing level group.
const tabLink = (popup: Page, type: string) =>
  popup.locator(`.krs-tab-bar a[href="#krs-${type}-root"]`);

test.describe("AT-0041 all-views bundled SVG (via AT-0043 popup)", () => {
  test("tab navigation via :target — panes switch, fragment updates, active tab distinct", async ({
    page,
    opfs,
  }) => {
    const popup = await seedAndOpen(page, opfs, FULL_KRS);
    // Outer app URL is stable once the project is loaded; popup navigation must
    // never change it.
    const outerUrlBefore = page.url();
    expect(popup.url()).toMatch(/^blob:/);

    // Default (no fragment): System pane visible, Deploy/Org hidden.
    expect(await paneDisplay(popup, "system")).toBe("block");
    expect(await paneDisplay(popup, "deploy")).toBe("none");
    expect(await paneDisplay(popup, "org")).toBe("none");

    // Click Deploy tab → fragment #krs-deploy-root, deploy pane shown.
    await tabLink(popup, "deploy").click();
    await expect.poll(() => new URL(popup.url()).hash).toBe("#krs-deploy-root");
    expect(await paneDisplay(popup, "deploy")).toBe("block");
    expect(await paneDisplay(popup, "system")).toBe("none");
    await expect(popup.locator('.krs-pane--deploy [data-node-id*="store-svc"]')).toBeVisible();
    await expect(popup.locator('.krs-pane--deploy [data-node-id*="billing-svc"]')).toBeVisible();

    // Active tab is visually distinct: deploy tab fill differs from system tab.
    expect(await tabFill(popup, "deploy")).not.toBe(await tabFill(popup, "system"));

    // Org tab, then back to System.
    await tabLink(popup, "org").click();
    await expect.poll(() => new URL(popup.url()).hash).toBe("#krs-org-root");
    expect(await paneDisplay(popup, "org")).toBe("block");

    await tabLink(popup, "system").click();
    await expect.poll(() => new URL(popup.url()).hash).toBe("#krs-system-root");
    expect(await paneDisplay(popup, "system")).toBe("block");
    expect(await paneDisplay(popup, "org")).toBe("none");

    // Popup navigation never touches the outer page URL.
    expect(page.url()).toBe(outerUrlBefore);
    await popup.close();
    expect(page.url()).toBe(outerUrlBefore);
  });

  test("drill-down — node links descend levels; browser-back ascends", async ({ page, opfs }) => {
    const popup = await seedAndOpen(page, opfs, FULL_KRS);

    // System drill-down: Store has children → wrapped in an anchor on the root
    // level (scoped to #krs-system-root because deeper levels' Back anchors
    // reuse the same hrefs).
    const storeLink = popup.locator('#krs-system-root a[href="#krs-system-Store"]');
    await expect(storeLink).toBeVisible();
    await storeLink.click();
    await expect.poll(() => new URL(popup.url()).hash).toBe("#krs-system-Store");

    // The drilled level is the :target → shown; root level hidden.
    const storeLevel = popup.locator("#krs-system-Store");
    expect(await storeLevel.evaluate((el) => getComputedStyle(el).display)).toBe("block");
    expect(
      await popup.locator("#krs-system-root").evaluate((el) => getComputedStyle(el).display),
    ).toBe("none");

    // Nested level 2: Catalog domain inside Store.
    await popup.locator('#krs-system-Store a[href="#krs-system-Catalog"]').click();
    await expect.poll(() => new URL(popup.url()).hash).toBe("#krs-system-Catalog");
    await expect(popup.locator('#krs-system-Catalog [data-node-id="Browse"]')).toBeVisible();

    // Fragment navigation creates history entries → browser Back restores the
    // parent level.
    await popup.goBack();
    await expect.poll(() => new URL(popup.url()).hash).toBe("#krs-system-Store");
    expect(await storeLevel.evaluate((el) => getComputedStyle(el).display)).toBe("block");

    // Org drill-down: a team with sub-teams links to its level.
    await tabLink(popup, "org").click();
    const coreLink = popup.locator('#krs-org-root a[href="#krs-org-Core"]');
    await expect(coreLink).toBeVisible();
    await coreLink.click();
    await expect.poll(() => new URL(popup.url()).hash).toBe("#krs-org-Core");
    await expect(popup.locator("#krs-org-Core").getByText("Platform").first()).toBeVisible();

    await popup.close();
  });

  test("Back control click returns to the parent level (#2044 browser fence)", async ({
    page,
    opfs,
  }) => {
    const popup = await seedAndOpen(page, opfs, FULL_KRS);

    await popup.locator('#krs-system-root a[href="#krs-system-Store"]').click();
    await expect.poll(() => new URL(popup.url()).hash).toBe("#krs-system-Store");

    // The Back control is painted on top of the level canvas rect (#2051), so
    // its hit target is the button itself and the click navigates — the fix
    // for #2044, fenced here at the browser layer.
    const back = popup.locator("#krs-system-Store .krs-back-button");
    await expect(back).toContainText("Back");
    await back.click();
    await expect.poll(() => new URL(popup.url()).hash).toBe("#krs-system-root");
    expect(
      await popup.locator("#krs-system-root").evaluate((el) => getComputedStyle(el).display),
    ).toBe("block");

    await popup.close();
  });

  test("disabled tab (no org block) has no <a> wrapper and stays inert", async ({ page, opfs }) => {
    const popup = await seedAndOpen(page, opfs, NO_ORG_KRS);

    await expect(popup.locator(".krs-tab--org")).toHaveClass(/krs-tab--disabled/);
    await expect(popup.locator('a[href="#krs-org-root"]')).toHaveCount(0);

    // Clicking the disabled tab does not navigate.
    await popup.locator(".krs-tab--org").click();
    expect(new URL(popup.url()).hash).toBe("");
    expect(await paneDisplay(popup, "system")).toBe("block");

    await popup.close();
  });
});
