import { type Page, expect } from "@playwright/test";

/**
 * Press an app keyboard shortcut. `chord` is the part after the primary
 * modifier, in Playwright key syntax: `pressChord(page, "Shift+P")` presses
 * `ControlOrMeta+Shift+P`, which is `mod+shift+p` in the app's chord notation
 * (`packages/app/src/keyboard/chord.ts`). `ControlOrMeta` resolves to Control
 * on the Linux runners, which is what the app reads as `mod` off macOS.
 *
 * Digits go through as-is (`"Shift+1"`): the app resolves digit-row keys from
 * `event.code`, so Shift does not turn `1` into `!`.
 *
 * Write the chord as a literal at the call site.
 * `scripts/lint/e2e-command-coverage.ts` finds a keybinding's spec by this
 * argument (or by the full `ControlOrMeta+…` form), so a chord assembled from
 * a variable is invisible to it.
 */
export async function pressChord(page: Page, chord: string): Promise<void> {
  await page.keyboard.press(`ControlOrMeta+${chord}`);
}

/**
 * Move keyboard focus off every text input by clicking the preview's empty
 * corner, so `whenTextInputFocused: "skip"` shortcuts fire. The preview
 * container is not focusable, so focus falls back to `<body>`; the corner
 * keeps the click off any node (a node click would drill or highlight).
 *
 * The assertion is the point: a shortcut spec that starts with the editor
 * still focused would see every `skip` chord ignored and fail far from here.
 */
export async function blurToPreview(page: Page): Promise<void> {
  await page.locator(".preview-container").click({ position: { x: 4, y: 4 } });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return false;
        return (
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          (el as HTMLElement).isContentEditable
        );
      }),
    )
    .toBe(false);
}

/** The Monaco editor's focus target (an EditContext `role="textbox"`). */
export function editorTextbox(page: Page) {
  return page.getByRole("textbox", { name: "Editor content" });
}

/** Focus the Monaco editor and wait until it holds focus. */
export async function focusEditor(page: Page): Promise<void> {
  const textbox = editorTextbox(page);
  await textbox.focus();
  await expect(textbox).toBeFocused();
}
