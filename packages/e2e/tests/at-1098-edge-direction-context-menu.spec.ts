import { expect, test } from "../fixtures/opfs.js";
import { rightClickEdge } from "../fixtures/edges.js";

/**
 * AT-1098 / AT-1141 / AT-1142: the edge context menu is the one preview action
 * that writes a file. Right-clicking an edge and picking a direction upserts
 * `edge#<id> { direction: <value>; }` into the `.krs.style` the source imports;
 * with no `@import` it bootstraps one (the directive on line 1 of the `.krs`,
 * the style file created next to it). The unit tests cover the string
 * transforms (`append-style-rule.test.ts`) and the menu's callback
 * (`PreviewPane.test.tsx`); these specs read the written text back from OPFS,
 * which is the part only a real browser shows.
 *
 * Coverage map (test name → AT bullet):
 *  - "a direction pick writes the rule into the imported style file" → AT-1098 AT-K
 *  - "with no @import, the first pick injects it and creates the style file" → AT-1141 AT-H
 *  - "later picks rewrite the rule in place and add no second @import" → AT-1141 AT-I, AT-1142 AT-K
 *  - "a hand-written multi-property rule is left alone and the pick is appended" → AT-1142 AT-L
 */

const PROJECT = "edges";
const KRS_PATH = `/projects/${PROJECT}/index.krs`;
const STYLE_PATH = `/projects/${PROJECT}/index.krs.style`;

// Two services, one edge. The edge has no author id, so its canonical id is
// the base form `<from>-><to>`.
const SYSTEM = `system Shop {
  service OrderService {}
  service PaymentService {}

  OrderService -> PaymentService "pays"
}
`;
const EDGE_ID = "OrderService->PaymentService";
const IMPORT_LINE = '@import "index.krs.style"';

function seedProject(files: Record<string, string>) {
  return {
    projects: [{ id: PROJECT, name: "Edges", files }],
    lastProjectId: PROJECT,
  };
}

test.describe("AT-1098 edge direction context menu writes .krs.style", () => {
  test("a direction pick writes the rule into the imported style file (AT-1098 AT-K)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed(
      seedProject({ "index.krs": `${IMPORT_LINE}\n${SYSTEM}`, "index.krs.style": "" }),
    );
    await opfs.gotoApp();

    await rightClickEdge(page, EDGE_ID);
    const menu = page.getByRole("menu");
    // The header names the edge and the file the pick will write to.
    await expect(menu).toContainText(`edge#${EDGE_ID}`);
    await expect(menu).toContainText("index.krs.style");
    await menu.getByRole("menuitem", { name: "↓ Down" }).click();

    await expect.poll(() => opfs.read(STYLE_PATH)).toBe(`edge#${EDGE_ID} { direction: down; }\n`);
    // The source already imported the file, so it is not touched.
    expect(await opfs.read(KRS_PATH)).toBe(`${IMPORT_LINE}\n${SYSTEM}`);
  });

  test("with no @import, the first pick injects it and creates the style file (AT-1141 AT-H)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed(seedProject({ "index.krs": SYSTEM }));
    await opfs.gotoApp();
    expect(await opfs.read(STYLE_PATH)).toBeNull();

    await rightClickEdge(page, EDGE_ID);
    await page.getByRole("menuitem", { name: "↓ Down" }).click();

    await expect.poll(() => opfs.read(STYLE_PATH)).toBe(`edge#${EDGE_ID} { direction: down; }\n`);
    // The directive goes on line 1 and the rest of the source follows unchanged.
    await expect.poll(() => opfs.read(KRS_PATH)).toBe(`${IMPORT_LINE}\n${SYSTEM}`);
    // The open editor shows the injected line too: the write went through the
    // editor's own change path, not around it.
    await expect(page.locator(".monaco-editor .view-line").first()).toHaveText(IMPORT_LINE);
  });

  test("later picks rewrite the rule in place and add no second @import (AT-1141 AT-I, AT-1142 AT-K)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed(seedProject({ "index.krs": SYSTEM }));
    await opfs.gotoApp();

    // Down bootstraps; Right and Up then go through the existing import.
    for (const [item, value] of [
      ["↓ Down", "down"],
      ["→ Right", "right"],
      ["↑ Up", "up"],
    ] as const) {
      await rightClickEdge(page, EDGE_ID);
      await page.getByRole("menuitem", { name: item }).click();
      await expect
        .poll(() => opfs.read(STYLE_PATH))
        .toBe(`edge#${EDGE_ID} { direction: ${value}; }\n`);
    }

    // One rule (asserted above on every pick) and one directive.
    expect(await opfs.read(KRS_PATH)).toBe(`${IMPORT_LINE}\n${SYSTEM}`);
  });

  test("a hand-written multi-property rule is left alone and the pick is appended (AT-1142 AT-L)", async ({
    page,
    opfs,
  }) => {
    const handWritten = `edge#${EDGE_ID} { color: red; direction: down; }\n`;
    await opfs.seed(
      seedProject({ "index.krs": `${IMPORT_LINE}\n${SYSTEM}`, "index.krs.style": handWritten }),
    );
    await opfs.gotoApp();

    await rightClickEdge(page, EDGE_ID);
    await page.getByRole("menuitem", { name: "→ Right" }).click();

    await expect
      .poll(() => opfs.read(STYLE_PATH))
      .toBe(`${handWritten}edge#${EDGE_ID} { direction: right; }\n`);
  });
});
