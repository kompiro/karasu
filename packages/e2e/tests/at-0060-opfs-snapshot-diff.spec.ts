import type { Page } from "@playwright/test";
import { replaceEditorContent } from "../fixtures/editor.js";
import { expect, test } from "../fixtures/opfs.js";
import {
  readSnapshotContent,
  readSnapshotIndex,
  seedSnapshotRecords,
  snapshotDir,
} from "../fixtures/snapshots.js";

/**
 * AT-0060: OPFS history snapshots as a diff compare source (Issue #740).
 *
 * The flow crosses `window.prompt`, OPFS persistence under
 * `/projects/<pid>/.snapshots/`, a 5-minute idle timer and the diff viewer —
 * none of which jsdom models, so the unit tests (`snapshot-manager.test.ts`,
 * `useSnapshotAutoCapture.test.tsx`) stop at the manager and the hook. This
 * spec drives the wiring between them.
 *
 * Coverage:
 *  - AT-2 / AT-5: "⤓ Snapshot now" with a prompted label writes a `manual`
 *    record whose content is the file; `.snapshots` stays out of the tree.
 *  - AT-3: "⇄ Compare with snapshot…" lists the records newest-first and the
 *    picked one drives the diff (banner names the snapshot, node marked).
 *  - AT-1: the idle auto-capture fires after 5 minutes of no edits.
 *  - AT-4: the 21st auto capture drops the oldest auto, never a manual.
 *  - AT-6: deleting the project removes its `.snapshots/` tree.
 *
 * The idle timer is driven with `page.clock` (#3047): `install()` must run
 * before `opfs.seed()` because the fixture navigates, and an install after
 * the last navigation would leave the app's `setTimeout` on the real clock.
 * `install()` keeps time flowing at the real rate, so Monaco and the compile
 * debounce behave as in every other spec. The idle period is `fastForward`,
 * not `runFor`: `runFor` replays every tick of the 5 minutes (Monaco's cursor
 * blink, animation frames) and crashed the renderer in about 1 run in 10,
 * while `fastForward` fires each due timer once — which is what an idle tab
 * sees.
 *
 * Not covered: the `beforeunload` flush in `useSnapshotAutoCapture`. The
 * handler starts an async OPFS write from an unloading document; in a local
 * probe (edit, then `page.reload()`) the capture never reached OPFS in 10
 * runs. AT-0060 has no item for it.
 */

const PID = "snap";
const REL = "index.krs";

/** Mirrors the `debounceMs` default of `useSnapshotAutoCapture`. */
const AUTO_CAPTURE_IDLE_MS = 5 * 60 * 1000;

const INDEX_KRS = `system Shop {
  service Catalog
  service Orders
  service Payments
  Orders -> Payments "charges"
}
`;

// The snapshot side lacks `Payments`, so comparing it against INDEX_KRS
// marks `Payments` as added.
const BEFORE_KRS = `system Shop {
  service Catalog
  service Orders
}
`;

const EDITED_KRS = `system Shop {
  service Catalog
  service Orders
  service Payments
  service Shipping
}
`;

const banner = (page: Page) => page.getByRole("status", { name: "Diff mode active" });

/** Click `index.krs` so it is the open file (the snapshot/compare target). */
async function openIndex(page: Page): Promise<void> {
  await page.locator(".file-tree-item", { hasText: REL }).first().click();
  await expect(page.locator('[data-node-id="Catalog"]')).toBeVisible();
}

async function openIndexContextMenu(page: Page): Promise<void> {
  await page.locator(".file-tree-item", { hasText: REL }).first().click({ button: "right" });
}

test.describe("AT-0060 OPFS snapshot as diff source", () => {
  test("Snapshot now writes a labeled manual record and keeps .snapshots out of the tree (AT-2, AT-5)", async ({
    page,
    opfs,
  }) => {
    await opfs.seed({
      projects: [{ id: PID, name: "Snap", files: { [REL]: INDEX_KRS } }],
      lastProjectId: PID,
    });
    await opfs.gotoApp();
    await openIndex(page);

    page.once("dialog", (d) => d.accept("before refactor"));
    await openIndexContextMenu(page);
    await page.getByRole("button", { name: "⤓ Snapshot now" }).click();

    await expect.poll(async () => (await readSnapshotIndex(opfs, PID, REL))?.length ?? 0).toBe(1);
    const [record] = (await readSnapshotIndex(opfs, PID, REL))!;
    expect(record).toMatchObject({ trigger: "manual", label: "before refactor", filePath: REL });
    expect(await readSnapshotContent(opfs, PID, REL, record.id)).toBe(INDEX_KRS);

    // The snapshot directory now exists on disk but the tree hides it.
    await expect(page.locator(".file-tree-item", { hasText: REL })).toHaveCount(1);
    await expect(page.locator(".file-tree-item", { hasText: ".snapshots" })).toHaveCount(0);
  });

  test("Compare with snapshot lists records newest-first and diffs against the picked one (AT-3)", async ({
    page,
    opfs,
  }) => {
    const { files } = seedSnapshotRecords(REL, [
      { trigger: "auto", content: INDEX_KRS },
      { trigger: "manual", label: "before-refactor", content: BEFORE_KRS },
    ]);
    await opfs.seed({
      projects: [{ id: PID, name: "Snap", files: { [REL]: INDEX_KRS, ...files } }],
      lastProjectId: PID,
    });
    await opfs.gotoApp();
    await openIndex(page);

    await openIndexContextMenu(page);
    await page.getByRole("button", { name: "⇄ Compare with snapshot…" }).click();

    const items = page.getByRole("dialog").getByRole("list").getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("manual");
    await expect(items.nth(0)).toContainText("before-refactor");
    await expect(items.nth(1)).toContainText("auto");

    await items.nth(0).getByRole("button").click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(banner(page)).toContainText(`${REL} @ `);
    await expect(banner(page)).toContainText('"before-refactor"');
    await expect(page.locator('[data-node-id="Payments"][data-diff-state="added"]')).toBeVisible();

    await page.getByRole("button", { name: "Exit diff mode" }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect(page.locator("[data-diff-state]")).toHaveCount(0);
  });

  test("an edit followed by 5 idle minutes is captured as an auto snapshot (AT-1)", async ({
    page,
    opfs,
  }) => {
    await page.clock.install();
    await opfs.seed({
      projects: [{ id: PID, name: "Snap", files: { [REL]: INDEX_KRS } }],
      lastProjectId: PID,
    });
    await opfs.gotoApp();
    await openIndex(page);
    await replaceEditorContent(page, EDITED_KRS);

    await page.clock.fastForward(AUTO_CAPTURE_IDLE_MS);

    await expect
      .poll(async () => (await readSnapshotIndex(opfs, PID, REL))?.map((r) => r.trigger))
      .toEqual(["auto"]);
    const [record] = (await readSnapshotIndex(opfs, PID, REL))!;
    // The capture is the editor buffer, and the clipboard paste in
    // `replaceEditorContent` arrives with CRLF line endings; compare as LF.
    const captured = await readSnapshotContent(opfs, PID, REL, record.id);
    expect(captured?.replace(/\r\n/g, "\n")).toBe(EDITED_KRS);
  });

  test("the 21st auto snapshot drops the oldest auto and keeps manual ones (AT-4)", async ({
    page,
    opfs,
  }) => {
    // The manual record is the oldest of all, so a GC that dropped "the
    // oldest record" instead of "the oldest auto" would take it.
    const { files, records } = seedSnapshotRecords(REL, [
      { trigger: "manual", label: "keep-me" },
      ...Array.from({ length: 20 }, () => ({ trigger: "auto" as const })),
    ]);
    const [manual, oldestAuto, secondAuto] = records;

    await page.clock.install();
    await opfs.seed({
      projects: [{ id: PID, name: "Snap", files: { [REL]: INDEX_KRS, ...files } }],
      lastProjectId: PID,
    });
    await opfs.gotoApp();
    await openIndex(page);

    await page.clock.fastForward(AUTO_CAPTURE_IDLE_MS);

    await expect
      .poll(async () => (await readSnapshotIndex(opfs, PID, REL))?.map((r) => r.id))
      .not.toContain(oldestAuto.id);
    const after = (await readSnapshotIndex(opfs, PID, REL))!;
    const autos = after.filter((r) => r.trigger === "auto");
    expect(autos).toHaveLength(20);
    expect(autos.map((r) => r.id)).toContain(secondAuto.id);
    expect(after.find((r) => r.id === manual.id)).toMatchObject({ label: "keep-me" });

    // The new capture is the current file; the dropped record's content is gone too.
    const fresh = autos.find((r) => !records.some((s) => s.id === r.id));
    expect(await readSnapshotContent(opfs, PID, REL, fresh!.id)).toBe(INDEX_KRS);
    expect(await readSnapshotContent(opfs, PID, REL, oldestAuto.id)).toBeNull();
    expect(await readSnapshotContent(opfs, PID, REL, secondAuto.id)).not.toBeNull();
  });

  test("deleting the project removes its .snapshots tree (AT-6)", async ({ page, opfs }) => {
    const { files, records } = seedSnapshotRecords(REL, [{ trigger: "manual", label: "x" }]);
    await opfs.seed({
      projects: [
        { id: "other", name: "Other", files: { [REL]: BEFORE_KRS } },
        { id: PID, name: "Snap", files: { [REL]: INDEX_KRS, ...files } },
      ],
      lastProjectId: PID,
    });
    await opfs.gotoApp();
    expect(await readSnapshotIndex(opfs, PID, REL)).not.toBeNull();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "✕ Delete" }).click();

    const dropdown = page.locator(".project-selector select.project-selector-dropdown");
    await expect(dropdown.locator('option:has-text("Snap")')).toHaveCount(0);

    expect(await opfs.read(`${snapshotDir(PID, REL)}/index.json`)).toBeNull();
    expect(await readSnapshotContent(opfs, PID, REL, records[0].id)).toBeNull();
    // Only the deleted project's tree goes.
    expect(await opfs.read(`/projects/other/${REL}`)).toBe(BEFORE_KRS);
  });
});
