import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-3284: opening a deep link adds one history entry, the link itself.
 *
 * The unit layer drives the hook on the real reducer (AT-A). What it cannot
 * reach is the whole boot: the OPFS project seed, the compiled model that
 * fills the path index, and the browser's own history. Before #3284 the hook
 * pushed the pre-restore states it saw on the way (`#krs-system-root`, the
 * hash's tab before the seed's reset, the root before a drill landed), so
 * `history.length` grew by up to three and Back walked through them before
 * reaching the page that linked here.
 */

const KRS = `system Shop {
  service OrderService {
    domain Ordering {}
  }
}

deploy Prod {
  oci "order-api" { realizes OrderService }
}

organization Acme {
  team Orders {
    owns OrderService
  }
}
`;

for (const [hash, settled] of [
  ["#krs-deploy", 'svg [data-realized-node-id="OrderService"]'],
  ["#krs-org-root", 'svg [data-node-id="Orders"]'],
  ["#krs-system-OrderService", 'svg [data-node-id="Ordering"]'],
  ["#krs-system-root:OrderService", 'svg [data-node-id="OrderService"]'],
] as const) {
  test(`a cold boot at ${hash} adds one history entry, and Back leaves it (AT-B)`, async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [{ id: "shop", name: "Shop", files: { "index.krs": KRS } }],
      lastProjectId: "shop",
    });
    // The page the link is opened from.
    const linkedFrom = page.url();
    const before = await page.evaluate(() => history.length);

    await opfs.gotoApp(`/${hash}`);
    await expect(page.locator(settled).first()).toBeVisible();
    // The token the link names is what the entry holds once restored.
    await expect.poll(() => page.evaluate(() => location.hash.split("?")[0])).toBe(hash);

    expect(await page.evaluate(() => history.length)).toBe(before + 1);

    await page.goBack();
    await expect.poll(() => page.url()).toBe(linkedFrom);
  });
}
