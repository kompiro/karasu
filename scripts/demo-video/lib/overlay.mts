// Overlays drawn into the recorded page: a caption card (lower left) and a code panel
// that shows the edit a scene makes (upper right). Title cards are rendered to PNG by
// compose.mts instead of being drawn here: a full-screen overlay in the VS Code
// workbench leaves the karasu webview grey and unpainted.
//
// The DOM is built with createElement / textContent only: the VS Code workbench enforces
// Trusted Types, so assigning to innerHTML throws there.

import type { Frame, Page } from "@playwright/test";

type Target = Page | Frame;

export const OVERLAY_CSS = `
#krs-demo-cap{position:fixed;left:32px;bottom:32px;z-index:2147483647;max-width:min(560px,36vw);
 background:rgba(15,23,42,.9);color:#fff;border-radius:14px;padding:16px 28px;
 font-family:"Noto Sans","Noto Sans CJK JP",sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3);
 transition:opacity .35s;pointer-events:none;text-align:left}
#krs-demo-cap .t{font-size:26px;font-weight:700;line-height:1.4}
#krs-demo-cap .s{font-size:18px;opacity:.85;margin-top:4px;line-height:1.5}
#krs-demo-code{position:fixed;right:28px;top:120px;z-index:2147483646;width:min(540px,42vw);background:#0f172a;
 color:#e2e8f0;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.35);
 font-family:"DejaVu Sans Mono","Noto Sans Mono CJK JP",monospace;font-size:15px;overflow:hidden;
 transition:opacity .35s;pointer-events:none}
#krs-demo-code .h{background:#1e293b;padding:8px 14px;font-size:14px;color:#94a3b8;display:flex;justify-content:space-between}
#krs-demo-code .h b{color:#fbbf24;font-weight:600}
#krs-demo-code pre{margin:0;padding:10px 0;font-family:inherit;white-space:pre}
#krs-demo-code .l{padding:0 14px;line-height:1.55}
#krs-demo-code .add{background:rgba(34,197,94,.22);border-left:3px solid #22c55e;padding-left:11px}
#krs-demo-code .del{background:rgba(239,68,68,.22);border-left:3px solid #ef4444;padding-left:11px;text-decoration:line-through;opacity:.8}
#krs-demo-title{position:fixed;inset:0;z-index:2147483647;background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;
 display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"Noto Sans","Noto Sans CJK JP",sans-serif}
#krs-demo-title .k{font-size:22px;letter-spacing:.3em;opacity:.7;margin-bottom:18px}
#krs-demo-title .t{font-size:48px;font-weight:800;text-align:center;line-height:1.35;max-width:90%}
#krs-demo-title .s{font-size:24px;opacity:.85;margin-top:22px;text-align:center;line-height:1.6;max-width:85%}
#krs-demo-thumb{position:fixed;inset:0;z-index:2147483647;background:linear-gradient(135deg,#0f172a,#1e3a8a);
 font-family:"Noto Sans","Noto Sans CJK JP",sans-serif;color:#fff}
#krs-demo-thumb .text{position:absolute;left:56px;top:50%;transform:translateY(-50%);width:33%}
#krs-demo-thumb .shot{position:absolute;right:48px;top:50%;transform:translateY(-50%);width:60%;aspect-ratio:16/9;
 background:#fff center/cover no-repeat;border-radius:14px;border:1px solid rgba(255,255,255,.18);
 box-shadow:0 24px 60px rgba(0,0,0,.45)}
#krs-demo-thumb .k{font-size:18px;letter-spacing:.3em;opacity:.75;margin-bottom:14px}
#krs-demo-thumb .t{font-size:46px;font-weight:800;line-height:1.25}
#krs-demo-thumb .s{font-size:20px;opacity:.85;margin-top:18px;line-height:1.5}
#krs-demo-thumb .t,#krs-demo-thumb .s{text-wrap:balance;word-break:auto-phrase}
`;

async function ensureStyle(target: Target): Promise<void> {
  await target.evaluate((css) => {
    if (document.getElementById("krs-demo-style")) return;
    const style = document.createElement("style");
    style.id = "krs-demo-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  }, OVERLAY_CSS);
}

/** Shows a caption card (a title, or a [title, sub] pair); an empty title hides it. */
export async function caption(
  target: Target,
  text: string | readonly [string, string],
  extra = "",
): Promise<void> {
  const [title, sub] = typeof text === "string" ? [text, extra] : text;
  // oxlint-disable-next-line no-console -- progress log: which scene the run reached
  console.log(new Date().toISOString().slice(11, 19), "caption:", title || "(hidden)");
  await ensureStyle(target);
  await target.evaluate(
    ([head, detail]) => {
      let el = document.getElementById("krs-demo-cap");
      if (!head) {
        if (el) el.style.opacity = "0";
        return;
      }
      if (!el) {
        el = document.createElement("div");
        el.id = "krs-demo-cap";
        document.documentElement.appendChild(el);
      }
      el.replaceChildren();
      const t = document.createElement("div");
      t.className = "t";
      t.textContent = head;
      el.appendChild(t);
      if (detail) {
        const s = document.createElement("div");
        s.className = "s";
        s.textContent = detail;
        el.appendChild(s);
      }
      el.style.opacity = "1";
    },
    [title, sub] as const,
  );
}

/**
 * Shows a file excerpt with the edit a scene is about to make. A line starting with
 * "+ " is drawn as added, "- " as removed, anything else as context (a leading two
 * spaces is dropped so context lines line up with the marked ones). An empty file
 * name hides the panel.
 */
export async function codePanel(
  target: Target,
  file: string,
  lines: readonly string[] = [],
  note = "",
): Promise<void> {
  await ensureStyle(target);
  await target.evaluate(
    ([fileName, rows, badgeText]) => {
      let el = document.getElementById("krs-demo-code");
      if (!fileName) {
        if (el) el.style.opacity = "0";
        return;
      }
      if (!el) {
        el = document.createElement("div");
        el.id = "krs-demo-code";
        document.documentElement.appendChild(el);
      }
      el.replaceChildren();
      const head = document.createElement("div");
      head.className = "h";
      const name = document.createElement("span");
      name.textContent = fileName;
      const badge = document.createElement("b");
      badge.textContent = badgeText;
      head.append(name, badge);
      const pre = document.createElement("pre");
      for (const line of rows) {
        const row = document.createElement("div");
        row.className = "l";
        if (line.startsWith("+ ")) {
          row.classList.add("add");
          row.textContent = line.slice(2);
        } else if (line.startsWith("- ")) {
          row.classList.add("del");
          row.textContent = line.slice(2);
        } else {
          row.textContent = line.startsWith("  ") ? line.slice(2) : line;
        }
        pre.appendChild(row);
      }
      el.append(head, pre);
      el.style.opacity = "1";
    },
    [file, lines, note] as const,
  );
}

/** Hides the caption and code panel; passed as the `style` of a thumbnail screenshot. */
export const HIDE_OVERLAYS_CSS = "#krs-demo-cap,#krs-demo-code{visibility:hidden !important}";

/**
 * Fills the page with a thumbnail: the card's text on the left and `frameUrl` (a data
 * URL of a frame) as a framed screenshot on the right, so the text covers none of the
 * screen. Used by compose.mts on a blank page.
 */
export async function thumbnailCard(
  target: Target,
  lang: string,
  frameUrl: string,
  kicker: string,
  title: string,
  sub: string,
): Promise<void> {
  await ensureStyle(target);
  await target.evaluate(
    ([language, url, k, t, s]) => {
      const el = document.createElement("div");
      el.id = "krs-demo-thumb";
      // word-break: auto-phrase only breaks at Japanese phrase boundaries under lang="ja";
      // without it the narrow title column splits words mid-phrase.
      el.lang = language;
      const band = document.createElement("div");
      band.className = "text";
      const shot = document.createElement("div");
      shot.className = "shot";
      shot.style.backgroundImage = `url("${url}")`;
      for (const [cls, value] of [
        ["k", k],
        ["t", t],
        ["s", s],
      ] as const) {
        if (!value) continue;
        const d = document.createElement("div");
        d.className = cls;
        d.textContent = value;
        band.appendChild(d);
      }
      el.append(band, shot);
      document.body.appendChild(el);
    },
    [lang, frameUrl, kicker, title, sub] as const,
  );
}

/** Fills the page with a title card. Used by compose.mts on a blank page only. */
export async function titleCard(
  target: Target,
  kicker: string,
  title: string,
  sub: string,
): Promise<void> {
  await ensureStyle(target);
  await target.evaluate(
    ([k, t, s]) => {
      const el = document.createElement("div");
      el.id = "krs-demo-title";
      for (const [cls, value] of [
        ["k", k],
        ["t", t],
        ["s", s],
      ] as const) {
        if (!value) continue;
        const d = document.createElement("div");
        d.className = cls;
        d.textContent = value;
        el.appendChild(d);
      }
      document.body.appendChild(el);
    },
    [kicker, title, sub] as const,
  );
}
