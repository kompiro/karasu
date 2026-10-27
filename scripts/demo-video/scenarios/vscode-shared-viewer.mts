// The VS Code preview runs the app's viewer (#2996: #3311 / #3312 / #3313).
//
// Scenes: open the preview -> zoom, edge hover, drill down and back -> an unsaved edit
// shows as you type -> an unsaved edit in an imported file shows too -> change an edge's
// direction from the preview: the rule lands in the style sheet's buffer, unsaved, and
// the editor's undo takes it back -> Ctrl+click a node defined in an imported file opens
// that file.
//
// The preview follows the active .krs editor, so the imported-file scene edits
// order.krs and then switches back to index.krs to show the unsaved edit there.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clickAt, ctrlClick, moveTo, parkPointer, sleep, wheelAt } from "../lib/display.mts";
import { caption } from "../lib/overlay.mts";
import type { Scenario } from "../lib/scenario.mts";
import {
  centerIn,
  edgePoint,
  editorKeys,
  inViewer,
  launchCode,
  vscodeExecutable,
} from "../lib/vscode.mts";

// A fresh worktree has no core / i18n build yet, and the extension build resolves them.
const VSCODE_BUILD =
  "pnpm --filter @karasu-tools/core run build && pnpm --filter @karasu-tools/i18n run build && pnpm --filter karasu-vscode run build";

const T = {
  en: {
    newEdge: 'Customer -> UserService "signs up"',
    dbLines: ["database OrderDB {}", 'OrderService -> OrderDB "stores orders"'],
    open: "karasu: Open Preview",
    same: [
      "The app's viewer, running inside VS Code",
      "Pan and zoom, drill-down, the CRUD view, facets, edge hover and the detail panel, with nothing ported to the extension",
    ],
    typing: [
      "Unsaved edits show up as you type",
      "The viewer asks the extension for every file it reads, and the extension reads the open buffer first (it used to read the disk)",
    ],
    importEdit: [
      "Edits to imported files too",
      "Open services/order.krs and add lines without saving",
    ],
    backToIndex: [
      "Back in index.krs, the unsaved edit is there",
      "Both tabs are still unsaved (●)",
    ],
    writeBack: [
      "Edits in the preview go back to the editor",
      "Right-click an edge and pick a direction",
    ],
    buffer: [
      "The edit lands in the buffer, unsaved",
      "A direction rule was added to theme.krs.style. Nothing is written if the buffer changed since the viewer read it",
    ],
    undo: ["The editor's undo takes it back", "Ctrl+Z"],
    jump: [
      "Jumping to a node opens the file that defines it",
      "Ctrl+click → Catalog is defined in services/catalog.krs",
    ],
  },
  ja: {
    newEdge: 'Customer -> UserService "会員登録する"',
    dbLines: ["database OrderDB {}", 'OrderService -> OrderDB "注文を保存する"'],
    open: "karasu: Open Preview",
    same: [
      "app と同じビューアが VS Code の中で動く",
      "パン・ズーム、ドリルダウン、CRUD ビュー、facet、エッジのホバーと詳細パネル。VS Code 側へ移植しなくても使える",
    ],
    typing: [
      "保存前の編集が、入力したそばからプレビューに出る",
      "ビューアは読むファイルをすべて拡張に問い合わせ、拡張はエディタのバッファを先に読む（以前はディスクから読んでいた）",
    ],
    importEdit: [
      "import 先のファイルの編集も同じ",
      "services/order.krs を開いて、保存せずに書き足す",
    ],
    backToIndex: [
      "未保存のまま index.krs に戻っても反映されている",
      "どちらのタブも未保存（●）のまま",
    ],
    writeBack: ["プレビューからの編集をエディタに書き戻す", "エッジを右クリックして向きを選ぶ"],
    buffer: [
      "書き戻しは未保存の変更としてバッファに入る",
      "theme.krs.style に向きのルールが追加された。書く直前にバッファが変わっていないかも確かめる",
    ],
    undo: ["エディタの undo で取り消せる", "Ctrl+Z"],
    jump: [
      "import 先のノードへのジャンプも正しいファイルを開く",
      "Ctrl+クリック → 商品カタログを定義している services/catalog.krs",
    ],
  },
} as const;

/**
 * 1-based number of the line in `file` that contains `needle`, so the typing scenes
 * follow the fixture instead of hard-coding line numbers that drift when it changes.
 */
function lineOf(file: string, needle: string): number {
  const index = readFileSync(file, "utf8")
    .split("\n")
    .findIndex((line) => line.includes(needle));
  if (index < 0) throw new Error(`${file} has no line containing ${needle}`);
  return index + 1;
}

const scenario: Scenario = {
  requires: [
    { path: "packages/vscode/out/extension.js", build: VSCODE_BUILD },
    { path: "packages/vscode/out/webview", build: VSCODE_BUILD },
  ],
  fixture: "shop",
  cards: {
    en: {
      intro: {
        kicker: "karasu · this week",
        title: "The VS Code preview now runs the app's viewer",
        sub: "The hand-written webview is gone; the app's viewer runs inside the webview as is",
      },
      outroSub: "Unsaved edits show live · edits from the preview go back · jumps into imports",
    },
    ja: {
      intro: {
        kicker: "karasu · 今週のハイライト",
        title: "VS Code のプレビューを app と同じビューアに",
        sub: "手書きの webview をやめ、app のビューアを webview の中でそのまま動かす",
      },
      outroSub: "未保存の編集も即反映 / プレビューから書き戻し / import 先へのジャンプ",
    },
  },

  async run(ctx) {
    const t = T[ctx.lang];
    parkPointer();
    const code = await launchCode({
      executable: await vscodeExecutable(ctx.repo),
      extensionPath: join(ctx.repo, "packages/vscode"),
      userDataDir: join(ctx.work, "vscode-user-data"),
      workspace: ctx.model,
      log: join(ctx.work, "vscode.log"),
    });
    const { win } = code;
    const keys = editorKeys(win);
    const node = (id: string) =>
      inViewer(win, (f) => centerIn(f, f.locator(`svg [data-node-id="${id}"]`).first()));
    const edge = (from: string, to: string, at = 0.5) =>
      inViewer(win, (f) => edgePoint(f, from, to, at));
    try {
      await sleep(2500);
      await keys.quickOpen("index.krs");
      await sleep(1000);
      ctx.startRecording();
      await sleep(800);

      // 1. open the preview
      await caption(win, t.open);
      await keys.command(t.open);
      await inViewer(win, async () => {});
      await sleep(4000);

      // 2. the app's viewer: zoom, hover, drill down and back
      await caption(win, t.same);
      const storefront = await node("Storefront");
      await wheelAt({ x: storefront.x, y: storefront.y + 120 }, "down", 1);
      await sleep(900);
      const hover1 = await edge("Storefront", "CatalogService");
      await moveTo(hover1.x, hover1.y, 700);
      await sleep(1400);
      const hover2 = await edge("Storefront", "OrderService");
      await moveTo(hover2.x, hover2.y, 500);
      await sleep(1200);
      await clickAt(await node("OrderService"), { ms: 700 });
      await sleep(2200);
      await clickAt(
        await inViewer(win, (f) => centerIn(f, f.locator(".breadcrumb-link").first())),
        { ms: 700 },
      );
      await sleep(1500);

      // 3. an unsaved edit in the open file
      await caption(win, t.typing);
      parkPointer();
      // The new edge goes right after the last edge of the system body.
      await keys.lineEnd(lineOf(join(ctx.model, "index.krs"), "Storefront -> UserService"));
      await keys.typeLine(t.newEdge, 70);
      await sleep(3500);

      // 4. an unsaved edit in an imported file, then back to index.krs
      await caption(win, t.importEdit);
      await keys.quickOpen("order.krs");
      await sleep(1200);
      await keys.lineEnd(
        lineOf(join(ctx.model, "services/order.krs"), "OrderService -> UserService"),
      );
      for (const line of t.dbLines) await keys.typeLine(line, 60);
      await sleep(2500);
      await keys.quickOpen("index.krs");
      await caption(win, t.backToIndex);
      await sleep(2000);
      // Thumbnail: the editor and the shared viewer side by side, unsaved edits drawn.
      await ctx.markThumbnail(win);
      await sleep(2500);

      // 5. write back from the preview, then undo in the editor.
      // 0.3 along the edge stays clear of the edges the earlier scenes added.
      await caption(win, t.writeBack);
      const target = await edge("Storefront", "CatalogService", 0.3);
      await moveTo(target.x, target.y, 700);
      await sleep(400);
      await clickAt(target, { button: 3, ms: 100 });
      await sleep(1200);
      // The direction items are hardcoded English: "Auto", "↑ Up", "↓ Down", "← Left", "→ Right".
      const right = await inViewer(win, (f) =>
        centerIn(
          f,
          f.locator(".edge-context-menu .context-menu-item", { hasText: "Right" }).first(),
        ),
      );
      await clickAt(right, { ms: 600 });
      await sleep(2200);
      await caption(win, t.buffer);
      await keys.quickOpen("theme.krs.style");
      await sleep(3800);
      await caption(win, t.undo);
      await sleep(800);
      await win.keyboard.press("Control+z");
      await sleep(3000);

      // 6. jump to a node defined in an imported file
      await keys.quickOpen("index.krs");
      await sleep(1200);
      await caption(win, t.jump);
      const catalog = await node("CatalogService");
      await moveTo(catalog.x, catalog.y, 800);
      await sleep(400);
      await ctrlClick();
      await sleep(4000);
      parkPointer();
      await sleep(500);
      await ctx.stopRecording();
    } finally {
      await code.close();
    }
  },
};

export default scenario;
