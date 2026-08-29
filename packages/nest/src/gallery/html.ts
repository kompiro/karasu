/**
 * Server-rendered HTML, hand-written, because the pages this service needs are
 * a list and a form.
 *
 * No framework, no build step, no client script. This package holds itself to
 * no runtime dependencies, and the gallery's pages are a submission with a
 * diagram on it and a console of plain `<form>`s — reached for a bundler, they
 * would still be that, plus a build to keep working.
 *
 * The no-script property is worth naming rather than settling for. The console
 * is same-origin with the session cookie (ADR-2578 decision 5, and the
 * `__Host-` prefix in `auth/session.ts`), so every byte of script served here
 * would run with that session's authority. There is none.
 */

/**
 * Escape text for an element body or a double-quoted attribute.
 *
 * Every interpolation in this module goes through here, including values that
 * "cannot" contain markup. A submission title is typed by a stranger, and a
 * login is chosen by one; the id and the timestamps are ours, but exempting
 * them would leave a reader of the templates having to know which is which.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The one stylesheet, inline.
 *
 * Inline rather than a served asset so a page is one request and there is no
 * second route to keep alive. It is small enough that the duplication across
 * responses costs less than the file would.
 */
const STYLE = `
  :root { color-scheme: light dark; --fg: #16181d; --muted: #5b616e; --bg: #ffffff;
          --surface: #f6f7f9; --line: #d7dbe0; --accent: #1f6feb; --danger: #b3261e; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #e7e9ee; --muted: #9aa1ae; --bg: #14161a; --surface: #1c1f25;
            --line: #2e333b; --accent: #6aa8ff; --danger: #f2836f; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg);
         font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main, header { max-width: 60rem; margin: 0 auto; padding: 0 1.25rem; }
  header { display: flex; align-items: baseline; gap: 1rem; padding-top: 1.5rem;
           padding-bottom: 1.5rem; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  header a { color: inherit; text-decoration: none; font-weight: 600; }
  main { padding-top: 1.5rem; padding-bottom: 3rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .meta { color: var(--muted); font-size: 0.875rem; margin: 0 0 1.5rem; }
  .figure { border: 1px solid var(--line); border-radius: 8px; background: var(--surface);
            padding: 0.5rem; overflow-x: auto; }
  .figure svg { max-width: 100%; height: auto; display: block; }
  a { color: var(--accent); }
  .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.25rem; }
  .card { border: 1px solid var(--line); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
  .card h2 { font-size: 1.0625rem; margin: 0 0 0.25rem; }
  .tag { font-size: 0.75rem; border: 1px solid var(--line); border-radius: 999px;
         padding: 0.05rem 0.5rem; color: var(--muted); }
  button { font: inherit; padding: 0.4rem 0.85rem; border-radius: 6px;
           border: 1px solid var(--line); background: var(--surface); color: inherit;
           cursor: pointer; }
  button.danger { border-color: var(--danger); color: var(--danger); }
  label { display: block; margin-top: 1rem; font-weight: 600; }
  input[type="text"], textarea { width: 100%; font: inherit; padding: 0.5rem;
    border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: inherit; }
  textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; min-height: 14rem; }
  .empty { color: var(--muted); }
`;

export interface PageOptions {
  title: string;
  /** Rendered into the header, right of the service name. */
  nav?: string;
  body: string;
}

/** Wrap a body in the shared page chrome. */
export function page({ title, nav, body }: PageOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<header><a href="/">karasu gallery</a>${nav ?? ""}</header>
<main>
${body}
</main>
</body>
</html>
`;
}
