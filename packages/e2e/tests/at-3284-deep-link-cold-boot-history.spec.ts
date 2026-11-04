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

// #3598: a project switch opens `index.krs`; a link naming another file used
// to have it land after the restoration ended, which pushed a second entry.
const OTHER = `system Shop {
  service BillingService {
    domain Billing {}
  }
}

organization Acme {
  team Billing {
    owns BillingService
  }
}
`;

const file = (path: string) => `?file=${encodeURIComponent(path)}`;

test("a cold boot on a link naming another file than index.krs adds one history entry (AT-F)", async ({
  page,
  opfs,
}) => {
  await opfs.seed({
    projects: [{ id: "shop", name: "Shop", files: { "index.krs": KRS, "other.krs": OTHER } }],
    lastProjectId: "shop",
  });
  const linkedFrom = page.url();
  const before = await page.evaluate(() => history.length);

  const hash = `#krs-org-root${file("/projects/shop/other.krs")}`;
  await opfs.gotoApp(`/${hash}`);
  await expect(page.locator('svg [data-node-id="Billing"]').first()).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines").first()).toContainText("BillingService");
  await expect.poll(() => page.evaluate(() => location.hash)).toBe(hash);

  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  await page.goBack();
  await expect.poll(() => page.url()).toBe(linkedFrom);
});

// A missing file opens as an empty buffer (the selection lands) whose index
// stays empty, so the link's Deploy tab stays pending; leaving the file is the
// visitor's navigation and must end the restoration. A file that does not open
// at all is the unit test's `stops waiting for the named file when it does not open`.
test("after a link naming a file the project does not have, a file switch is a new entry (AT-G)", async ({
  page,
  opfs,
}) => {
  await opfs.seed({
    projects: [{ id: "shop", name: "Shop", files: { "index.krs": KRS } }],
    lastProjectId: "shop",
  });
  const missing = file("/projects/shop/missing.krs");
  await opfs.gotoApp(`/#krs-deploy${missing}`);
  // The tab cannot be restored on an empty buffer; the entry keeps the file.
  await expect.poll(() => page.evaluate(() => location.hash)).toContain(missing);
  const indexItem = page.locator(".file-tree-item", { hasText: "index.krs" }).first();
  await expect(indexItem).toBeVisible();
  const restored = await page.evaluate(() => history.length);

  await indexItem.click();
  await expect(page.locator('svg [data-node-id="OrderService"]').first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toBe(`#krs-system-root${file("/projects/shop/index.krs")}`);
  expect(await page.evaluate(() => history.length)).toBe(restored + 1);

  await page.goBack();
  await expect.poll(() => page.evaluate(() => location.hash)).toContain(missing);
});
