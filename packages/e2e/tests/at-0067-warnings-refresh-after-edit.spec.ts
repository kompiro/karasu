import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/opfs.js";
import { bootMemoryApp } from "../fixtures/boot.js";
import { expectNoWarningMatching, replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-0067: the WarningPanel follows editor edits in both directions, and a
 * parse error marks the last good diagram as outdated until it is fixed.
 *
 * `useSystemView.test.tsx` fences the hook's state updates; this spec drives
 * the same edits through Monaco and the real compile debounce, and reads the
 * panel the user sees. Item assertions are scoped to `.warning-item--warning`
 * (TPL-1608): `info` items share `.warning-item` and are an open set.
 *
 * Every "it went away" assertion follows a "it is there" assertion on the
 * same item, so it waits for a real transition rather than sampling an empty
 * panel that has not rendered yet.
 */

const HANDLES_OK = `system S {
  client WebApp [web] { handles Order }
  service Backend { domain Order {} }
  WebApp -> Backend
}
`;
const HANDLES_TYPO = HANDLES_OK.replace("handles Order", "handles Ordr");

const STANDALONE = `service Standalone { label "Standalone" }
`;
const STANDALONE_IN_SYSTEM = `system S {
  service Standalone {}
}
`;

function warningItem(page: Page, text: RegExp) {
  return page.locator(".warning-panel .warning-item--warning", { hasText: text });
}

const OUTDATED_BADGE = "⚠ Diagram is outdated — fix errors to update";

test.describe("AT-0067 Warnings refresh after editor edits", () => {
  test("an unresolved handles warning appears on the typo and clears on the fix", async ({
    page,
    opfs,
  }) => {
    const unresolved = /declares handles "Ordr"/;

    await bootMemoryApp(page, opfs, HANDLES_OK);
    await expectNoWarningMatching(page, /declares handles/);

    await replaceEditorContent(page, HANDLES_TYPO);
    // The fixture confirms a paste by its first line, which all three buffers
    // share; confirm the edited line too, so a dropped paste fails here.
    await expect(page.locator(".monaco-editor .view-lines").first()).toContainText("handles Ordr");
    await expect(warningItem(page, unresolved)).toHaveCount(1);

    await replaceEditorContent(page, HANDLES_OK);
    await expect(warningItem(page, unresolved)).toHaveCount(0);
  });

  test("unassigned-service follows the service in and out of a system", async ({ page, opfs }) => {
    const unassigned = /Service "Standalone" is not assigned to any system/;

    await bootMemoryApp(page, opfs, STANDALONE);
    await expect(warningItem(page, unassigned)).toHaveCount(1);

    await replaceEditorContent(page, STANDALONE_IN_SYSTEM);
    await expect(warningItem(page, unassigned)).toHaveCount(0);

    await replaceEditorContent(page, STANDALONE);
    await expect(warningItem(page, unassigned)).toHaveCount(1);
  });

  test("a parse error marks the diagram outdated until the source is fixed", async ({
    page,
    opfs,
  }) => {
    await bootMemoryApp(page, opfs, HANDLES_OK);
    await expect(page.locator(".preview-container svg").first()).toBeVisible();
    // The overlay is `aria-hidden` (the banner carries the error for assistive
    // tech), so it is found by text rather than by role.
    await expect(page.getByText(OUTDATED_BADGE)).toHaveCount(0);

    // Drop the closing brace: the last good diagram stays, flagged outdated.
    await replaceEditorContent(page, HANDLES_OK.trimEnd().replace(/\}$/, ""));
    await expect(page.getByText(OUTDATED_BADGE)).toBeVisible();
    await expect(page.locator(".preview-container svg").first()).toBeVisible();

    await replaceEditorContent(page, HANDLES_OK);
    await expect(page.getByText(OUTDATED_BADGE)).toHaveCount(0);
  });
});
