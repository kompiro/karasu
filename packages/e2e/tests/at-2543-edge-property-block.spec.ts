import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { clickEdge, rightClickEdge } from "../fixtures/edges.js";

/**
 * AT: edge property block (#2543, `docs/acceptance/edge-property-block.md`).
 * An edge that carries a `{ description … link … }` block opens the edge
 * detail panel on left-click; right-click keeps opening the direction menu.
 * `PreviewPane.test.tsx` covers the dispatch on synthetic events; this spec
 * clicks the drawn edge in a real browser, where the hit has to land on the
 * renderer's transparent hitline. The AT file is unnumbered, so the spec is
 * named after its Issue (design decision 5 of #3039).
 *
 * Coverage map (test name → AT bullet):
 *  - "left-click opens the detail panel with the prose and a link that opens a new tab" → M-2
 *  - "right-click opens the direction menu, not the detail panel" → M-3
 */

const RUNBOOK_URL = "https://runbook.example.com/settlement-feed";

const KRS = `system EdgeSample {
  service A { label "Service A" }
  service D { label "Service D" }

  A --> D [async] #settlementFeed {
    label       "streams settlements"
    description "At-least-once delivery. Retries are idempotent on settlementId."
    link        "${RUNBOOK_URL}" "Runbook"
  }
}
`;

test.describe("AT-2543 edge property block in the preview", () => {
  test("left-click opens the detail panel with the prose and a link that opens a new tab (M-2)", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, KRS);

    await clickEdge(page, "settlementFeed");
    // The panel is a region named after the edge's route (#3045).
    const panel = page.getByRole("region", { name: "A ⇢ D" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("streams settlements");
    await expect(panel).toContainText(
      "At-least-once delivery. Retries are idempotent on settlementId.",
    );

    // The link opens in a new tab. The runbook host is stubbed so the popup
    // never reaches the network.
    await page
      .context()
      .route(`${RUNBOOK_URL}**`, (route) =>
        route.fulfill({ contentType: "text/html", body: "<title>Runbook</title>" }),
      );
    const popupPromise = page.waitForEvent("popup");
    await panel.getByRole("link", { name: /Runbook/ }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(RUNBOOK_URL);
    await popup.close();

    await panel.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("region", { name: "A ⇢ D" })).toHaveCount(0);
  });

  test("right-click opens the direction menu, not the detail panel (M-3)", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, KRS);

    await rightClickEdge(page, "settlementFeed");
    const menu = page.getByRole("menu");
    await expect(menu).toContainText("edge#settlementFeed");
    await expect(menu.getByRole("menuitem", { name: "↓ Down" })).toBeVisible();
    await expect(page.getByRole("region", { name: "A ⇢ D" })).toHaveCount(0);
  });
});
