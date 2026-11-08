// The web app's first-run experience (#3563): Welcome on a first visit, and the
// Design a service split guide walking the bundled service-split sample.
//
// Scenes: a fresh profile opens the app and Welcome greets it -> Design a service split
// opens the sample as a new project -> step 1, the current system, drilled into the
// Commerce Application -> step 2, the org view with team dependencies -> step 3, the plan
// diffed against today -> step 4, the state in between -> step 5, Share -> back to the
// editor.
//
// The app is the production build under `vite preview`, opened in a fresh browser
// profile so OPFS is empty and the boot seeds the default projects, which is what
// Welcome keys on. The app seeds its own projects: the fixture model is not used.
//
// The tour panel sits at the bottom left, where captions normally go, so this scenario
// moves its captions to the bottom right, over the warnings panel.

import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { launchAppBrowser, screenCenter } from "../lib/browser.mts";
import { clickAt, parkPointer, registerCleanup, sleep } from "../lib/display.mts";
import { caption } from "../lib/overlay.mts";
import type { Scenario } from "../lib/scenario.mts";

const PORT = 4317;
const BASE = `http://localhost:${PORT}`;

const T = {
  en: {
    design: "Design a service split",
    next: "Next →",
    finish: "✓ Continue to editor",
    dependencies: "Dependencies",
    welcome: [
      "A first visit opens Welcome",
      "What karasu is for, and three places to start. No account, install or DSL needed",
    ],
    opened: [
      "Design a service split",
      "The sample opens as a new project; a five-step guide sits at the bottom left",
    ],
    current: [
      "1 · The current system",
      "Ordering and Billing are separate domains, yet live in one service on one database",
    ],
    org: [
      "2 · Who owns what",
      "The Billing Team owns the Billing domain, but the service it runs in is the Commerce Team's",
    ],
    target: [
      "3 · The plan, compared with today",
      "The app's diff mode: added in green, removed in red",
    ],
    decision: [
      "4 · The state in between",
      "Billing Service runs on the shared database; its own database is still ◇ Planned",
    ],
    share: ["5 · Share it with the team", "A link to the model, or an SVG for a document"],
    done: ["Back in the editor, on the same model", "Every step used views the app already has"],
  },
  ja: {
    design: "サービス分割を設計する",
    next: "次へ →",
    finish: "✓ エディタに進む",
    dependencies: "チーム依存",
    welcome: [
      "初めて開くと Welcome が出る",
      "karasu が何のためのものかと、3 つの入口。アカウントもインストールも DSL も不要",
    ],
    opened: [
      "サービス分割を設計する",
      "サンプルを新しいプロジェクトとして開き、左下の 5 ステップのガイドが案内する",
    ],
    current: [
      "1 · 現在のシステム",
      "注文と請求は別のドメインなのに、1 つのサービスと 1 つのデータベースに同居している",
    ],
    org: [
      "2 · 誰が何を持っているか",
      "請求ドメインは請求チームのものだが、それが動くサービスはコマースチームのもの",
    ],
    target: ["3 · 計画を現在と比べる", "アプリの差分モード：追加は緑、削除は赤"],
    decision: [
      "4 · 移行途中の状態",
      "請求サービスは共有データベースの上で動き、専用のデータベースはまだ ◇ Planned",
    ],
    share: ["5 · チームと共有する", "モデルへのリンク、または文書に貼る SVG"],
    done: [
      "同じモデルのまま、エディタに戻る",
      "どのステップも、アプリにあるビューだけを使っている",
    ],
  },
} as const;

/** Moves the caption card to the bottom right, clear of the tour panel. */
async function say(p: Page, text: readonly [string, string]): Promise<void> {
  // The override goes in first, so no recorded frame shows the card at the left.
  await p.evaluate(() => {
    if (document.getElementById("krs-demo-cap-right")) return;
    const style = document.createElement("style");
    style.id = "krs-demo-cap-right";
    style.textContent = "#krs-demo-cap{left:auto !important;right:32px}";
    document.documentElement.appendChild(style);
  });
  await caption(p, text);
}

async function answers(): Promise<boolean> {
  try {
    return (await fetch(BASE, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

/** Resolves once the preview server answers; rejects if it exits first. */
async function waitForPreview(server: ChildProcess): Promise<void> {
  let exited = false;
  // "error" is a spawn failure (the vite binary missing when deps are not installed).
  server.once("exit", () => {
    exited = true;
  });
  server.once("error", () => {
    exited = true;
  });
  for (let i = 0; i < 150; i++) {
    if (exited) throw new Error(`vite preview exited before answering (is port ${PORT} taken?)`);
    if (await answers()) return;
    await sleep(100);
  }
  throw new Error(`vite preview did not answer on ${BASE}`);
}

const scenario: Scenario = {
  requires: [
    {
      path: "packages/app/dist/index.html",
      build: "pnpm --filter @karasu-tools/app run build",
    },
  ],
  fixture: "shop",
  cards: {
    en: {
      intro: {
        kicker: "karasu · this week",
        title: "A guided first visit to the web app",
        sub: "Design a service split, in five steps",
      },
      outroSub: "Welcome · current vs planned · ownership · migration · share",
    },
    ja: {
      intro: {
        kicker: "karasu · 今週のハイライト",
        title: "Web アプリの初回体験にガイドが付いた",
        sub: "サービス分割を 5 ステップで設計する",
      },
      outroSub: "Welcome / 現在と計画 / 所有 / 移行途中 / 共有",
    },
  },

  async run(ctx) {
    const t = T[ctx.lang];
    if (await answers()) throw new Error(`port ${PORT} is already in use; stop that server first`);
    const appDir = join(ctx.repo, "packages/app");
    const server = spawn(
      join(appDir, "node_modules/.bin/vite"),
      ["preview", "--port", String(PORT), "--strictPort"],
      { cwd: appDir, stdio: "ignore" },
    );
    const unregister = registerCleanup(() => server.kill());
    let app: Awaited<ReturnType<typeof launchAppBrowser>> | undefined;
    try {
      await waitForPreview(server);
      app = await launchAppBrowser(join(ctx.work, "chrome-profile"), ctx.lang);
      const p = app.page;
      parkPointer();
      await p.goto(`${BASE}/`);
      const welcome = p.locator(".first-run-welcome");
      await welcome.waitFor({ timeout: 30_000 });
      await sleep(1200);
      ctx.startRecording();
      await sleep(600);

      // Welcome
      await say(p, t.welcome);
      await sleep(5500);

      // Design a service split opens the sample and the guide
      const panel = p.locator(".first-run-tour");
      await clickAt(await screenCenter(welcome.locator("button", { hasText: t.design })), {
        ms: 900,
      });
      await panel.waitFor();
      parkPointer();
      await sleep(800);
      await say(p, t.opened);
      await sleep(4000);

      // 1. the current system: drill into the Commerce Application
      await say(p, t.current);
      await sleep(1500);
      await clickAt(
        await screenCenter(
          p.locator('.preview-container svg [data-node-id="CommerceApp"]').first(),
        ),
        { ms: 900 },
      );
      parkPointer();
      await sleep(5000);

      const next = async () => {
        await clickAt(await screenCenter(panel.locator("button", { hasText: t.next })), {
          ms: 700,
        });
        await sleep(1500);
      };

      // 2. the org view, with the derived team dependencies
      await next();
      await say(p, t.org);
      await sleep(2500);
      await clickAt(await screenCenter(p.locator("button", { hasText: t.dependencies }).first()), {
        ms: 800,
      });
      parkPointer();
      await sleep(4500);

      // 3. the plan, diffed against today
      await next();
      parkPointer();
      await say(p, t.target);
      await sleep(2500);
      await ctx.markThumbnail(p);
      await sleep(4000);

      // 4. the state in between
      await next();
      parkPointer();
      await say(p, t.decision);
      await sleep(7000);

      // 5. Share
      await next();
      await say(p, t.share);
      await sleep(2000);
      // The button's accessible name is localized; its visible text is "Share" in both.
      await clickAt(await screenCenter(p.locator("button", { hasText: "Share" }).first()), {
        ms: 900,
      });
      await sleep(3500);
      await p.keyboard.press("Escape");
      await sleep(1000);

      // Continue to editor
      await clickAt(await screenCenter(panel.locator("button", { hasText: t.finish })), {
        ms: 800,
      });
      parkPointer();
      await say(p, t.done);
      await sleep(4500);
      await ctx.stopRecording();
    } finally {
      await app?.close();
      unregister();
      server.kill();
    }
  },
};

export default scenario;
