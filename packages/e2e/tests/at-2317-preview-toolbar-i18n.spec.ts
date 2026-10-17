import { expect, test } from "../fixtures/opfs.js";

/**
 * AT-2317: switching the UI to Japanese, in a real browser.
 *
 * `PreviewColumn.test.tsx` renders the toolbar under `locale=ja` and fences
 * that no English hardcode is left. What it cannot reach is the switch itself:
 * every other spec runs with `karasu-locale=en` pinned by the `opfs` fixture,
 * so the `ja` path had never run in a browser. This spec starts in English,
 * picks 日本語 in Settings, and checks that the preview toolbar relabels, that
 * the choice is stored under `karasu-locale`, and that it survives a reload.
 */

const PROJECT = {
  projects: [{ id: "i18n", name: "I18n", files: { "index.krs": "system Shop {}\n" } }],
  lastProjectId: "i18n",
};

test.describe("AT-2317 Preview toolbar in Japanese", () => {
  test("Settings → Language → 日本語 relabels the toolbar and persists across a reload", async ({
    page,
    opfs,
  }) => {
    // Start pinned to English so the switch is an observable transition.
    await opfs.seed(PROJECT);
    await opfs.gotoApp();
    await expect(page.getByRole("button", { name: "Export SVG", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter focus mode" })).toBeVisible();

    await page.getByRole("tab", { name: /Settings/ }).click();
    await page.getByRole("combobox", { name: "Language" }).selectOption("ja");

    const expectJapaneseToolbar = async () => {
      await expect(
        page.getByRole("button", { name: "SVG をエクスポート", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "フォーカスモードに入る" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Export SVG", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Enter focus mode" })).toHaveCount(0);
      await expect(page.getByRole("combobox", { name: "言語" })).toHaveValue("ja");
    };
    await expectJapaneseToolbar();
    expect(await page.evaluate(() => localStorage.getItem("karasu-locale"))).toBe("ja");

    // A plain reload: nothing re-pins the locale, so what the app stored is
    // what it boots with.
    await page.reload();
    await page.getByRole("tab", { name: /Settings/ }).click();
    await expectJapaneseToolbar();
  });
});
