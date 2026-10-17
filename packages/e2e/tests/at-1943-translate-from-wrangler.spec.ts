import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-1943 AC-5: the App's Translate dialog accepts `wrangler.toml`.
 *
 * The adapter's mapping is fenced by `packages/core/src/translate/wrangler.test.ts`;
 * this spec checks the dialog surface in a real browser: the format is offered,
 * picking it shows the system-name override and hides the options wrangler
 * does not take (map file, granularity, bindings), and translating produces the
 * self-wrapped `system` block plus the physical `deploy` with the Cloudflare
 * technology on the `store`, not on the logical node.
 */

const WRANGLER = `name = "my-worker"

[[d1_databases]]
binding = "DB"
database_name = "app-db"
`;

test.describe("AT-1943 Translate from wrangler.toml (App dialog)", () => {
  test("the wrangler format shows only its own options and produces a system block", async ({
    page,
    opfs,
  }) => {
    // The sidebar entry exists only in project mode (memory mode reaches the
    // dialog through the palette — AT-1463).
    await opfs.seed({
      projects: [{ id: "wrangler", name: "Wrangler", files: { "index.krs": "system Shop {}\n" } }],
      lastProjectId: "wrangler",
    });
    await opfs.gotoApp();

    await page.getByRole("button", { name: "⇄ Translate", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "⇄ Translate infra config to .krs" });
    await expect(dialog).toBeVisible();

    const format = dialog.getByRole("combobox", { name: "Input format" });
    await expect(format.getByRole("option", { name: "Cloudflare wrangler.toml" })).toHaveCount(1);
    await format.selectOption("wrangler");

    await dialog.getByText("Advanced options").click();
    await expect(dialog.getByRole("textbox", { name: "System name" })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "karasu.map.yaml content" })).toHaveCount(0);
    await expect(dialog.getByRole("combobox", { name: "Granularity" })).toHaveCount(0);
    await expect(dialog.getByText("Emit usecase → resource bindings")).toHaveCount(0);

    await dialog.getByRole("textbox", { name: "Source content" }).fill(WRANGLER);
    await dialog.getByRole("button", { name: "⇄ Translate" }).click();

    const output = dialog.getByRole("textbox", { name: "Generated .krs" });
    await expect(output).toHaveValue(/^system MyWorker \{/m);
    await expect(output).toHaveValue(/^deploy "my-worker" \{/m);
    await expect(output).toHaveValue(/type "Cloudflare D1"/);
    // The technology stays on the physical store, never on a logical label.
    await expect(output).not.toHaveValue(/\blabel\s+"[^"\n]*Cloudflare[^"\n]*"/);
  });
});
