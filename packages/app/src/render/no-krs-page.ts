/**
 * The signpost page: what `/<owner>/<repo>` returns when that repo has no
 * committed `.krs` (ADR-2249).
 *
 * The permalink surface only ever *resolves* a `.krs` that already exists; it
 * never generates one. So a miss is not an error and not a dead end — it is the
 * point where karasu-nest takes over. Returning the SPA here would swallow a
 * useful fact ("this repo has no model yet") and show no way forward, which is
 * exactly the wall the nest pivot exists to break.
 *
 * Everything a synchronous response can honestly give is the current state and
 * the next step. Generation takes minutes and belongs to another surface, so it
 * is linked, never started here.
 *
 * The wording must not claim the repository exists. A missing repo and a repo
 * without a `.krs` both come back as a 404 from GitHub raw, and separating them
 * would cost an authenticated API call on the hot path — which ADR-1828 rules
 * out. So the page says what karasu actually knows ("no model found here") and
 * names both readings, rather than asserting a repo it never verified.
 *
 * English-only, matching the existing server-rendered pages (`share-page.ts`).
 * The Workers layer does not carry the i18n table — `docs/spec/i18n.md` governs
 * the app, SVG output and CLI, and pulling translations into a Pages Function
 * would duplicate that machinery for two pages.
 */

const HTML = "text/html; charset=utf-8";

/** Guide that already documents how to produce a `.krs` with your own LLM. */
const REVERSE_GUIDE_URL =
  "https://github.com/kompiro/karasu/blob/main/docs/guide/reverse-engineering-with-ai.md";

interface NoKrsPageResult {
  status: number;
  body: string;
  contentType: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the signpost page for `<owner>/<repo>`.
 *
 * `owner` / `repo` come from a path that already passed the route guard
 * (`OWNER_RE` / `REPO_RE`, so no quotes or angle brackets can survive), but they
 * are escaped anyway — the guard is a routing decision, not an output contract,
 * and this text is echoed back to the visitor (TPL-168).
 *
 * Returns 200, not 404: the URL is well-formed and the answer ("no model yet,
 * here is how to get one") is the page's content, not a failure.
 */
export function buildNoKrsPage(owner: string, repo: string): NoKrsPageResult {
  const slug = escapeHtml(`${owner}/${repo}`);
  const repoUrl = escapeHtml(`https://github.com/${owner}/${repo}`);

  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>No .krs yet — ${slug} — karasu</title>
<meta name="robots" content="noindex">
<style>
:root { color-scheme: light dark; }
body {
  margin: 0 auto; padding: 3rem 1.25rem; max-width: 44rem; line-height: 1.7;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
h1 { font-size: 1.4rem; line-height: 1.4; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.95em; }
ol { padding-left: 1.25rem; }
li { margin: 0.5rem 0; }
.muted { opacity: 0.75; font-size: 0.925rem; }
</style>
</head>
<body>
<h1>No <code>.krs</code> found for ${slug}</h1>
<p>
  karasu renders an architecture model that lives <em>in the repository</em>, and it
  could not find one here. Either <a href="${repoUrl}">${slug}</a> has no model yet, or
  there is no such repository — GitHub answers both the same way, and karasu does not
  ask it a second time to tell them apart.
</p>
<h2>Getting a model for this repo</h2>
<ol>
  <li>
    Reverse-engineer one with your own LLM — see the
    <a href="${REVERSE_GUIDE_URL}">reverse-engineering guide</a>.
  </li>
  <li>
    Commit it as <code>index.krs</code> (or <code>karasu.krs</code>) at the repo root,
    or at any path you like.
  </li>
  <li>Reload this page. karasu resolves the committed file from the default branch.</li>
</ol>
<p class="muted">
  Pointing at a file directly also works:
  <code>/${slug}/path/to/model.krs</code>. Add <code>@&lt;commit-sha&gt;</code> to pin a
  permalink to one commit.
</p>
</body>
</html>
`;

  return { status: 200, body, contentType: HTML };
}
