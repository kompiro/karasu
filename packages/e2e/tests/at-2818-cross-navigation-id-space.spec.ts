import { bootMemoryApp } from "../fixtures/boot.js";
import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-2818: cross-navigation highlights match on the node id, in both
 * directions, even when the deploy container's id is not spelled like the
 * node's (a quoted id keeps its quotes, a qualified id carries its system).
 *
 * The plain-id path (`Web`) is AT-0014's; this spec covers the ids that path
 * cannot tell apart from a coincidence:
 *  - a quoted id (`service "www.example.com"`) lights up deploy → system and
 *    system → deploy, and the hash carries the bare node id
 *  - a qualified container (`Shop.Api` beside `Admin.Api`) and a narrowed ref
 *    (`Shop.Api` while `Admin.Api` is undeployed) switch to System and light
 *    nothing — the same verdict the deploy-jump button already gives them
 *    (ADR-2714), now on the deploy → system side too
 *
 * Every click lands at the container's top-left corner: the unit label sits in
 * a sibling overlay group and would intercept a centred click (AT-0014).
 */

const KRS_QUOTED = `system Weird {
  service "www.example.com" {
    label "Public host"
  }
}

deploy "Production" {
  oci edge {
    runtime "nginx"
    realizes "www.example.com"
  }
}
`;

const KRS_QUALIFIED = `system Shop {
  service Api {}
  service Worker {}
}

system Admin {
  service Api {}
}

deploy "Production" {
  oci a {
    runtime "Node.js"
    realizes Shop.Api
  }
  oci b {
    runtime "Node.js"
    realizes Admin.Api
  }
  oci w {
    runtime "Node.js"
    realizes Worker
  }
}
`;

const KRS_NARROWED = `system Shop {
  service Api {}
}

system Admin {
  service Api {}
}

deploy "Production" {
  oci a {
    runtime "Node.js"
    realizes Shop.Api
  }
}
`;

test.describe("AT-2818 cross-navigation highlight id space", () => {
  test("a quoted id lights the node on deploy → system and carries the bare id in the hash", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, KRS_QUOTED);

    await page.getByRole("tab", { name: /Deploy$/ }).click();
    await expect(page.locator(".preview-column svg").first()).toContainText("edge");

    // The container's identity keeps the quotes; the DOM reads them back as `"www.example.com"`.
    const container = page.locator("svg [data-container-id='\"www.example.com\"']").first();
    await expect(container).toBeAttached();
    await expect(container).toHaveAttribute("data-realized-node-id", "www.example.com");
    await container.click({ position: { x: 4, y: 4 } });

    await expect(page.getByRole("tab", { name: /System$/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.locator('svg [data-node-id="www.example.com"].karasu-highlighted'),
    ).toHaveCount(1);
    await expect(page).toHaveURL(/#krs-system-root:www\.example\.com(\?|$)/);
  });

  test("a quoted id lights the container on system → deploy", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS_QUOTED);

    await page.locator('svg [data-deploy-button="www.example.com"]').first().click();

    await expect(page.getByRole("tab", { name: /Deploy$/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.locator('svg [data-realized-node-id="www.example.com"].karasu-highlighted'),
    ).toHaveCount(1);
    await expect(page).toHaveURL(/#krs-deploy:www\.example\.com(\?|$)/);
  });

  test("a qualified container switches to System and lights nothing", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS_QUALIFIED);

    await page.getByRole("tab", { name: /Deploy$/ }).click();
    await expect(page.locator(".preview-column svg").first()).toContainText("Node.js");

    const container = page.locator('svg [data-container-id="Shop.Api"]').first();
    await expect(container).toBeAttached();
    await expect(container).not.toHaveAttribute("data-realized-node-id", /.*/);
    await container.click({ position: { x: 4, y: 4 } });

    await expect(page.getByRole("tab", { name: /System$/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("svg .karasu-highlighted")).toHaveCount(0);
    await expect(page).toHaveURL(/#krs-system-root(\?|$)/);
    await expect(page).not.toHaveURL(/#krs-system-root:/);
  });

  test("a narrowed ref switches to System and lights nothing", async ({ page, opfs }) => {
    await bootMemoryApp(page, opfs, KRS_NARROWED);

    await page.getByRole("tab", { name: /Deploy$/ }).click();
    await expect(page.locator(".preview-column svg").first()).toContainText("Node.js");

    // One container, so its id is the bare `Api` — the spelling that used to
    // light Shop's node by coincidence while `Api` also reaches Admin's.
    const container = page.locator('svg [data-container-id="Api"]').first();
    await expect(container).toBeAttached();
    await expect(container).not.toHaveAttribute("data-realized-node-id", /.*/);
    await container.click({ position: { x: 4, y: 4 } });

    await expect(page.getByRole("tab", { name: /System$/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("svg .karasu-highlighted")).toHaveCount(0);
    await expect(page).toHaveURL(/#krs-system-root(\?|$)/);
    await expect(page).not.toHaveURL(/#krs-system-root:/);
  });
});
