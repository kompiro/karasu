import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-1907: the two entity-view claims that `at-1907-entity-view-toggle.spec.ts`
 * does not reach.
 *
 *  - The "Manual verification" step: copy a `#krs-entity-<domain>` URL, open it
 *    fresh, and land on that domain's entity view. The unit layer fences
 *    `parseHash`/`buildHash` in isolation; what is untested is a cold boot
 *    actually restoring the sub-mode — the hash has to survive project load,
 *    drill-down restoration *and* the sub-mode flag together.
 *  - "The toggle never appears outside the system view", which sits under an
 *    automated marker but is not asserted by the existing spec (it covers root
 *    and service-level absence within the system view only).
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

deploy Prod {
  oci "order-api" {
    realizes OrderService
  }
}

organization Acme {
  team Core {
    owns OrderService
    member a {
      label "A"
    }
  }
}
`;

const entityToggle = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Toggle entity view" });

test.describe("AT-1907 entity view deep link", () => {
  test("opening #krs-entity-<domain> cold boots into that domain's entity view", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [{ id: "entity", name: "Entity", files: { "index.krs": ENTITY_KRS } }],
      lastProjectId: "entity",
    });
    await opfs.gotoApp("/#krs-entity-Ordering");

    const entityPane = page.locator(".preview-pane--entity");
    await expect(entityPane).toBeVisible();

    // The domain's entities and their relation are what renders…
    await expect(entityPane.locator('[data-node-id="Order"]')).toBeVisible();
    await expect(entityPane.locator('[data-node-id="LineItem"]')).toBeVisible();
    // …and the usecase view is not underneath it.
    await expect(entityPane.locator('[data-node-id="PlaceOrder"]')).toHaveCount(0);

    // The toggle reflects the restored sub-mode, so the deep link and the
    // interactive state agree rather than the pane rendering out of band.
    await expect(entityToggle(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("the Entities toggle never appears outside the system view", async ({ page, opfs }) => {
    await opfs.seed({
      projects: [{ id: "entity", name: "Entity", files: { "index.krs": ENTITY_KRS } }],
      lastProjectId: "entity",
    });
    await opfs.gotoApp("/#krs-entity-Ordering");
    await expect(entityToggle(page)).toBeVisible();

    // The sub-mode is layered on `activeView === "system"`, so switching to any
    // other view must retract the toggle — not leave it available where it has
    // no meaning.
    for (const view of [/Org$/, /Deploy$/]) {
      await page.getByRole("tab", { name: view }).click();
      await expect(entityToggle(page)).toHaveCount(0);
    }

    // Returning to the system view lands at the root, not back inside the
    // domain: switching views resets the system drill-down (hash goes to
    // `#krs-system-root`, breadcrumb back to `EC`). So the toggle is still
    // absent here — correctly, since no domain is drilled — and the way to show
    // the retraction was view-scoping rather than a permanent loss is to drill
    // in again.
    await page.getByRole("tab", { name: /System$/ }).click();
    await expect(
      page.locator('.preview-container svg [data-node-id="OrderService"]'),
    ).toBeVisible();
    await expect(entityToggle(page)).toHaveCount(0);

    await page.locator('.preview-container svg [data-node-id="OrderService"]').first().click();
    await page.locator('.preview-container svg [data-node-id="Ordering"]').first().click();
    await expect(entityToggle(page)).toBeVisible();
  });
});
