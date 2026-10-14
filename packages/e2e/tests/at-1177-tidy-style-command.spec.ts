import type { Page } from "@playwright/test";
import { type OpfsFixture, expect, test } from "../fixtures/opfs.js";

/**
 * AT-1177 (App surface): the edit-pane toolbar's ✨ Tidy and ⌥ Format.
 *
 * `EditPaneToolbar.test.tsx` fences which button renders for which props, but
 * the buttons act through `useEditorDocument` → `handleEditorChange`, which
 * updates the Monaco buffer and saves through the project's file system. Both
 * halves only exist in a real browser, so this spec asserts the rendered
 * buffer and the OPFS file after each click. AT-1177 has no separate Format
 * AT; the ⌥ Format presence and behaviour check lives here too.
 */

const PROJECT_ID = "tidy";
const KRS_PATH = `/projects/${PROJECT_ID}/index.krs`;
const STYLE_PATH = `/projects/${PROJECT_ID}/index.krs.style`;

// Two rules for the same edge: tidy merges them, the cascade tail winning.
const UNTIDY_STYLE = `edge#A->B { direction: down; }
edge#A->B { direction: up; }
`;
const TIDIED_STYLE = `edge#A->B {
  direction: up;
}
`;

const UNFORMATTED_KRS = `system Shop {
service  Api {}
      service Db {}
Api -> Db
}
`;
const FORMATTED_KRS = `system Shop {
  service Api {}

  service Db {}

  Api -> Db
}
`;

async function seedProject(opfs: OpfsFixture): Promise<void> {
  await opfs.seed({
    projects: [
      {
        id: PROJECT_ID,
        name: "Tidy",
        files: { "index.krs": UNFORMATTED_KRS, "index.krs.style": UNTIDY_STYLE },
      },
    ],
    lastProjectId: PROJECT_ID,
  });
  await opfs.gotoApp();
}

// Exact name: `index.krs` is a prefix of `index.krs.style`.
async function openFile(page: Page, name: string): Promise<void> {
  await page.locator(".file-tree-item", { has: page.getByText(name, { exact: true }) }).click();
}

const editorLines = (page: Page) => page.locator(".monaco-editor .view-lines").first();
// Each buffer here is a few lines long, so every line is rendered and the
// rendered line count is the buffer's line count.
const renderedLines = (page: Page) => page.locator(".monaco-editor").first().locator(".view-line");
const tidyButton = (page: Page) => page.getByRole("button", { name: "✨ Tidy" });
const formatButton = (page: Page) => page.getByRole("button", { name: "⌥ Format" });

test.describe("AT-1177 Tidy / Format in the edit-pane toolbar", () => {
  test("✨ Tidy appears only for .krs.style and rewrites the buffer and the saved file", async ({
    page,
    opfs,
  }) => {
    await seedProject(opfs);

    await openFile(page, "index.krs.style");
    await expect(editorLines(page)).toContainText("direction: down;");
    await expect(tidyButton(page)).toBeVisible();
    await expect(formatButton(page)).toHaveCount(0);

    await tidyButton(page).click();

    // The open buffer is rewritten in place (no reload), and the save lands.
    await expect(editorLines(page)).not.toContainText("direction: down;");
    await expect(editorLines(page)).toContainText("direction: up;");
    await expect(renderedLines(page)).toHaveCount(TIDIED_STYLE.split("\n").length);
    await expect.poll(() => opfs.read(STYLE_PATH)).toBe(TIDIED_STYLE);
    // The .krs next to it is untouched.
    expect(await opfs.read(KRS_PATH)).toBe(UNFORMATTED_KRS);
  });

  test("on a .krs, ✨ Tidy is absent and ⌥ Format formats the buffer and the saved file", async ({
    page,
    opfs,
  }) => {
    await seedProject(opfs);

    await openFile(page, "index.krs.style");
    await expect(tidyButton(page)).toBeVisible();
    await openFile(page, "index.krs");
    await expect(editorLines(page)).toContainText("service Db {}");
    await expect(tidyButton(page)).toHaveCount(0);
    await expect(formatButton(page)).toBeEnabled();

    await formatButton(page).click();

    await expect.poll(() => opfs.read(KRS_PATH)).toBe(FORMATTED_KRS);
    await expect(renderedLines(page)).toHaveCount(FORMATTED_KRS.split("\n").length);
    expect(await opfs.read(STYLE_PATH)).toBe(UNTIDY_STYLE);
  });
});
