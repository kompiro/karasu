// `karasu serve` resolves imports (#3258), and Share is back on serve (#3162).
//
// Scenes: the opened file draws its imports and style sheet -> saving an imported file
// redraws -> saving the style sheet redraws -> a drilled-down view survives an edit to an
// imported file -> a file in a sub-directory opens by path -> Share builds a link on the
// hosted app, which opens the diagram without karasu running.
//
// Edits are written to disk by the script (serve watches the directory); the code panel
// shows each edit as a diff so the viewer can see what was saved.

import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchAppBrowser, screenCenter } from "../lib/browser.mts";
import { clickAt, parkPointer, registerCleanup, sleep, wheelAt } from "../lib/display.mts";
import { caption, codePanel } from "../lib/overlay.mts";
import type { Scenario } from "../lib/scenario.mts";

const PORT = 3456;
const BASE = `http://localhost:${PORT}`;
/** Center of the canvas on screen: where the wheel zooms. */
const CANVAS = { x: 960, y: 560 };

const T = {
  en: {
    db: [
      "database OrderDB {",
      '  label "Order DB"',
      "}",
      'OrderService -> OrderDB "stores orders"',
    ],
    shippingDomain: ["domain Shipping {", '  usecase "Arrange shipping" {}', "}"],
    afterDomain: /(domain Payment \{[\s\S]*?\n {4}\}\n)/,
    saved: "saved",
    opened: "opened file",
    imports: [
      "import resolves in the preview",
      "0.9.0 showed “File not found” for every import. serve now hands the app the whole directory (GET /api/project) and resolves imports at their real paths, as karasu render does",
    ],
    importSaved: [
      "Saving an imported file redraws",
      "Only services/order.krs was saved; the preview of index.krs updates",
    ],
    styleSaved: ["So does the style sheet", "Saving theme.krs.style redraws too"],
    drill: ["Drill down…", "into Order Service"],
    drillKept: [
      "Edit an import while drilled down: the view stays",
      "No jump back to the root; only the new domain appears",
    ],
    subdir: [
      "Files in sub-directories open by path",
      'localhost:3456/services/order (this used to fail). Its import "user.krs" resolves relative to it',
    ],
    share: "Share is back on serve",
    shareSub: "Links are built on the hosted app, karasu.kompiro.dev",
    shared: "Whoever receives the link needs no karasu running",
  },
  ja: {
    db: ["database OrderDB {", '  label "注文DB"', "}", 'OrderService -> OrderDB "注文を保存する"'],
    shippingDomain: ["domain 配送 {", '  usecase "出荷を手配する" {}', "}"],
    afterDomain: /(domain 決済 \{[\s\S]*?\n {4}\}\n)/,
    saved: "保存",
    opened: "開いたファイル",
    imports: [
      "import 先のノードも描ける",
      "0.9.0 では import 先が「File not found」。いまは配信ディレクトリを GET /api/project でまとめて受け取り、実際のパスに置いて解決する",
    ],
    importSaved: [
      "import 先を保存すると描き直される",
      "services/order.krs を保存しただけで、開いている index.krs のプレビューが更新される",
    ],
    styleSaved: ["スタイルシートも同じ", "theme.krs.style の保存でも描き直される"],
    drill: ["ドリルダウンして…", "注文サービスの中に入る"],
    drillKept: [
      "import 先だけが変わったときは、ビューがそのまま残る",
      "ルートに戻されず、追加したドメインだけが増える",
    ],
    subdir: [
      "サブディレクトリのファイルも開ける",
      'localhost:3456/services/order（以前は開けなかった）。order.krs の import "user.krs" も相対パスで解決',
    ],
    share: "serve に Share が戻った",
    shareSub: "共有リンクは公開アプリ karasu.kompiro.dev を基準に作る",
    shared: "受け取った人は karasu を動かさなくても開ける",
  },
} as const;

async function answers(): Promise<boolean> {
  try {
    // A server that accepts but never answers must not hang the run.
    return (await fetch(BASE, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

/** Resolves once serve answers on PORT; rejects if it exits first (e.g. the port is taken). */
async function waitForServe(serve: ChildProcess): Promise<void> {
  let exited = false;
  serve.once("exit", () => {
    exited = true;
  });
  for (let i = 0; i < 100; i++) {
    if (exited) throw new Error(`karasu serve exited before answering (is port ${PORT} taken?)`);
    if (await answers()) return;
    await sleep(100);
  }
  throw new Error(`karasu serve did not answer on ${BASE}`);
}

const scenario: Scenario = {
  requires: [
    { path: "packages/cli/dist/index.js", build: "pnpm --filter ./packages/cli run build" },
    {
      path: "packages/cli/dist/app/index.html",
      build: "pnpm --filter ./packages/cli run build:app",
    },
  ],
  fixture: "shop",
  cards: {
    en: {
      intro: {
        kicker: "karasu · this week",
        title: "karasu serve now resolves imports",
        sub: "$ npx karasu serve .",
      },
      outroSub: "Imports and style sheets redraw on save · sub-directories · Share",
    },
    ja: {
      intro: {
        kicker: "karasu · 今週のハイライト",
        title: "karasu serve が import を解決するようになった",
        sub: "$ npx karasu serve .",
      },
      outroSub: "import 先・スタイルの保存で再描画 / サブディレクトリ / Share",
    },
  },

  async run(ctx) {
    const t = T[ctx.lang];
    // Anything already answering on PORT would be recorded instead of this run's model.
    if (await answers()) throw new Error(`port ${PORT} is already in use; stop that server first`);
    const serve = spawn(
      "node",
      [join(ctx.repo, "packages/cli/dist/index.js"), "serve", "-p", String(PORT), ctx.model],
      { stdio: "ignore" },
    );
    const unregister = registerCleanup(() => serve.kill());
    let app: Awaited<ReturnType<typeof launchAppBrowser>> | undefined;
    try {
      await waitForServe(serve);
      app = await launchAppBrowser(join(ctx.work, "chrome-profile"), ctx.lang);
      const p = app.page;
      parkPointer();
      await p.goto(`${BASE}/`);
      await sleep(2500);
      ctx.startRecording();
      await sleep(800);

      // 1. the opened file draws its imports
      await wheelAt(CANVAS, "down", 2);
      await codePanel(
        p,
        "index.krs",
        [
          '@import "theme.krs.style"',
          "",
          'import "services/order.krs"',
          'import "services/catalog.krs"',
          "",
          "system Shop { … }",
        ],
        t.opened,
      );
      await caption(p, t.imports);
      await sleep(7000);

      // 2. save an imported file
      const order = join(ctx.model, "services/order.krs");
      await codePanel(
        p,
        "services/order.krs",
        [
          "  system Shop {",
          "    service OrderService { … }",
          "    OrderService -> UserService …",
          ...t.db.map((l) => `+   ${l}`),
          "  }",
        ],
        t.saved,
      );
      await caption(p, t.importSaved);
      await sleep(1800);
      writeFileSync(
        order,
        readFileSync(order, "utf8").replace(
          /\n}\s*$/,
          `\n${t.db.map((l) => `  ${l}`).join("\n")}\n}\n`,
        ),
      );
      await sleep(5000);

      // 3. save the style sheet
      await codePanel(
        p,
        "theme.krs.style",
        [
          "  service {",
          "-   background-color: #1D4ED8;",
          "+   background-color: #047857;",
          "-   color: #DBEAFE;",
          "+   color: #D1FAE5;",
          "  }",
        ],
        t.saved,
      );
      await caption(p, t.styleSaved);
      await sleep(1800);
      writeFileSync(
        join(ctx.model, "theme.krs.style"),
        "service {\n  background-color: #047857;\n  color: #D1FAE5;\n}\n",
      );
      await sleep(2500);
      // Thumbnail: the root view with the imported services, the new DB and the new colors.
      await ctx.markThumbnail(p);
      await sleep(2000);

      // 4. drill down, then edit the import: the view stays
      await codePanel(p, "");
      await caption(p, t.drill);
      await clickAt(await screenCenter(p.locator('svg [data-node-id="OrderService"]').first()), {
        ms: 900,
      });
      await sleep(1200);
      await wheelAt({ x: 960, y: 600 }, "up", 2);
      parkPointer();
      await sleep(1500);
      await codePanel(
        p,
        "services/order.krs",
        [
          "  service OrderService {",
          "    domain … { … }",
          "    domain … { … }",
          ...t.shippingDomain.map((l) => `+   ${l}`),
          "  }",
        ],
        t.saved,
      );
      await caption(p, t.drillKept);
      await sleep(1800);
      writeFileSync(
        order,
        readFileSync(order, "utf8").replace(
          t.afterDomain,
          `$1${t.shippingDomain.map((l) => `    ${l}`).join("\n")}\n`,
        ),
      );
      await sleep(5500);

      // 5. a file in a sub-directory
      await codePanel(p, "");
      await p.goto(`${BASE}/services/order`);
      await sleep(1800);
      await wheelAt(CANVAS, "down", 2);
      await caption(p, t.subdir);
      await sleep(5500);

      // 6. Share, then open the link on the hosted app
      await p.goto(`${BASE}/`);
      await sleep(1800);
      await wheelAt(CANVAS, "down", 2);
      await caption(p, t.share);
      await sleep(1200);
      // The button's accessible name is localized ("Share this diagram" / Japanese);
      // its visible text is "Share" in both languages.
      await clickAt(await screenCenter(p.locator("button", { hasText: "Share" }).first()), {
        ms: 900,
      });
      await sleep(1200);
      await caption(p, t.share, t.shareSub);
      await sleep(5000);
      const link = await p.locator('[role="dialog"] input').first().inputValue();
      parkPointer();
      await p.goto(link);
      await sleep(2500);
      await wheelAt(CANVAS, "down", 2);
      await caption(p, t.shared, link.split("#")[0]);
      parkPointer();
      await sleep(5000);
      await ctx.stopRecording();
    } finally {
      await app?.close();
      unregister();
      serve.kill();
    }
  },
};

export default scenario;
