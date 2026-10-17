import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { clickAndDownload, readDownloadText } from "../fixtures/download.js";
import { pressChord } from "../fixtures/keyboard.js";

/**
 * AT-1463: the in-app Translate dialog, in a real browser.
 *
 * The conversion itself (`translateInfraConfig`) and the dialog's branches are
 * fenced by `TranslateDialog.test.tsx` / `TranslateProvider.test.tsx` and the
 * core translate tests. What jsdom cannot reach, and this spec covers, is the
 * part that crosses a browser boundary: the two entry points (the sidebar
 * button and the command palette entry `translate.openDialog`, opened through
 * a real `mod+shift+p` keydown), loading a source through the hidden file
 * input, and the `.krs` download. Translation is local and writes nothing to
 * OPFS, so the project seed only gives the sidebar something to render.
 */

const COMPOSE = `services:
  order-service:
    image: order-service:1.0.0
`;

const PROJECT = {
  projects: [{ id: "translate", name: "Translate", files: { "index.krs": "system Shop {}\n" } }],
  lastProjectId: "translate",
};

function translateDialog(page: Page) {
  return page.getByRole("dialog", { name: "⇄ Translate infra config to .krs" });
}

/**
 * Open the dialog from the command palette (`translate.openDialog`).
 *
 * The palette's chord is live while Monaco has focus (`whenTextInputFocused:
 * "allow"`, TPL-1419), so focus does not matter here. What does is that the
 * app has registered its handlers: `KeyboardShortcutDispatcher` listens, and
 * `TranslateProvider` registers `translate.openDialog`, from effects that can
 * run after `gotoApp()` returns. A chord pressed before them opens nothing.
 * A drawn node means the tree under `App` has committed, which is the same
 * readiness `bootProjectApp` waits for.
 */
async function openTranslateFromPalette(page: Page): Promise<void> {
  await expect(page.locator("svg [data-node-id]").first()).toBeVisible();
  await pressChord(page, "Shift+P");
  const search = page.getByRole("combobox", { name: "Search commands" });
  await expect(search).toBeFocused();
  await search.fill("Translate");
  await page.getByRole("option", { name: /Translate Infra Config to \.krs…/ }).click();
}

test.describe("AT-1463 App translate dialog", () => {
  test("the sidebar entry translates a pasted compose file into a deploy block", async ({
    page,
    opfs,
  }) => {
    await opfs.seed(PROJECT);
    await opfs.gotoApp();

    await page.getByRole("button", { name: "⇄ Translate", exact: true }).click();
    const dialog = translateDialog(page);
    await expect(dialog).toBeVisible();

    await dialog.getByRole("textbox", { name: "Source content" }).fill(COMPOSE);
    await dialog.getByRole("button", { name: "⇄ Translate" }).click();

    const output = dialog.getByRole("textbox", { name: "Generated .krs" });
    await expect(output).toHaveValue(/^deploy "[^"]+" \{/m);
    await expect(output).toHaveValue(/oci "order-service" \{/);
    // Nothing is written to the project: translate only produces text.
    expect(await opfs.read("/projects/translate/index.krs")).toBe("system Shop {}\n");
  });

  test("the palette command opens the dialog in memory mode", async ({ page, opfs }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();

    await openTranslateFromPalette(page);

    const dialog = translateDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Source content" })).toHaveValue("");
  });

  test("loading a file fills the source and the source name, and the result downloads", async ({
    page,
    opfs,
  }) => {
    await opfs.seed(PROJECT);
    await opfs.gotoApp();

    await page.getByRole("button", { name: "⇄ Translate", exact: true }).click();
    const dialog = translateDialog(page);

    await dialog.getByLabel("Load a file").setInputFiles({
      name: "production.yaml",
      mimeType: "text/yaml",
      buffer: Buffer.from(COMPOSE),
    });
    await expect(dialog.getByRole("textbox", { name: "Source content" })).toHaveValue(COMPOSE);
    // The source name lives under the collapsed "Advanced options"; the file
    // name minus its extension becomes the deploy name and the download name.
    await expect(dialog.getByLabel("Source name")).toHaveValue("production");

    await dialog.getByRole("button", { name: "⇄ Translate" }).click();
    const output = dialog.getByRole("textbox", { name: "Generated .krs" });
    await expect(output).toHaveValue(/^deploy "production" \{/m);

    const download = await clickAndDownload(
      dialog.getByRole("button", { name: "↓ Download .krs" }),
    );
    expect(download.suggestedFilename()).toBe("production.krs");
    expect(await readDownloadText(download)).toBe(await output.inputValue());
  });

  test("invalid YAML shows the error and the app stays usable", async ({ page, opfs }) => {
    await opfs.seed(PROJECT);
    await opfs.gotoApp();

    await page.getByRole("button", { name: "⇄ Translate", exact: true }).click();
    const dialog = translateDialog(page);
    await dialog.getByRole("textbox", { name: "Source content" }).fill("services: [unclosed");
    await dialog.getByRole("button", { name: "⇄ Translate" }).click();

    await expect(dialog.getByText(/Failed to parse docker-compose file/)).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Generated .krs" })).toHaveCount(0);

    // Still usable: the dialog closes, the preview is still drawn, and the
    // dialog opens again.
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".preview-container svg").first()).toBeVisible();
    await page.getByRole("button", { name: "⇄ Translate", exact: true }).click();
    await expect(dialog).toBeVisible();
  });
});
