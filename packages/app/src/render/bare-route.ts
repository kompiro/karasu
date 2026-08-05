import { RESERVED_TOP_SEGMENTS } from "../routes.js";
import { OWNER_RE, REPO_RE, type ResolveResult } from "./repo-permalink.js";

/**
 * Route guard and response shaping for the bare `/<owner>/<repo>[/<path>][@<ref>]`
 * permalink (#1961).
 *
 * The bare form exists so a GitHub URL becomes a karasu URL by swapping the
 * host alone — no prefix to remember (ADR-1961). The cost is that a root-level
 * catch-all Pages Function runs *before* static assets, so it sees every request
 * `_routes.json` did not exclude and must decline anything that is not a genuine
 * permalink. That inverts the default for unknown paths, which is why the guard
 * and the reserved-segment table (`../routes.ts`) are load-bearing rather than
 * cosmetic (TPL-1961).
 *
 * Framework-agnostic on purpose (mirrors repo-permalink.ts / share-page.ts): the
 * Function is a thin adapter over these pure functions, so the routing decisions
 * are unit-testable without the Workers runtime (ADR-1801's split).
 */

/**
 * Decode a request pathname for guard/parse use, or return null when the
 * percent-encoding is malformed.
 *
 * `url.pathname` keeps percent-encoding, so `%40` does not match the `@` that
 * separates the ref. The `/r/` route never had to care — Pages handed it an
 * already-decoded `params.path` — so decoding here is the boundary guard that
 * keeps `…/repo%40<sha>` from silently missing the ref and being read as a
 * repo name.
 */
export function decodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    // A stray `%` throws URIError. Not a permalink we can act on.
    return null;
  }
}

/** Strip the leading/trailing slashes a route path carries. */
function trimSlashes(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

/** The `<owner>/<repo>` a bare path addresses. */
interface BarePermalinkMatch {
  owner: string;
  repo: string;
}

/**
 * Match a decoded pathname against `<owner>/<repo>[/<path>][@<ref>]`.
 *
 * Shape only — it never touches the network. `@<ref>` is optional, because the
 * ref-less form (`…/<owner>/<repo>` → default branch HEAD) is the one a reader
 * can type from memory, and requiring `@` would mean looking up a SHA first.
 *
 * `null` means "hand this back to the SPA". A match only means "worth asking
 * GitHub" — a path that matches but resolves to nothing still ends up on the
 * signpost page or back at the SPA, decided by {@link classifyResolveOutcome}.
 * The owner/repo are returned so the signpost can name the repo without
 * re-parsing.
 */
export function matchBarePermalink(decodedPathname: string): BarePermalinkMatch | null {
  const path = trimSlashes(decodedPathname);
  if (path === "") return null;

  // The ref is split on the LAST `@`, matching parseRepoPermalink.
  const at = path.lastIndexOf("@");
  const left = at === -1 ? path : path.slice(0, at);

  const segments = left.split("/");
  if (segments.length < 2) return null;

  const [owner, repo] = segments;
  if (RESERVED_TOP_SEGMENTS.has(owner)) return null;
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo)) return null;
  return { owner, repo };
}

/** Does the path pin a ref explicitly? Used as a signal of intent, not a requirement. */
export function hasExplicitRef(decodedPathname: string): boolean {
  return decodedPathname.includes("@");
}

/**
 * What the Function should do with a resolver result.
 *
 * - `redirect` — resolved; 302 to the `/s` share page.
 * - `signpost` — we looked inside the repo and found no `.krs`. Not an error:
 *   under ADR-2249 this is where karasu-nest takes over, so the visitor gets a
 *   page explaining the state and pointing onward.
 * - `passthrough` — the path was never permalink-shaped. Hand it back to the SPA
 *   exactly as before this route existed.
 * - `error` — surface the resolver's message.
 *
 * Three distinctions decide this, and conflating any two produces a wrong page:
 *
 * 1. **404 vs 400.** A 404 means the repo was searched and had no `.krs` — the
 *    signpost's premise. A 400 means the path never parsed as a permalink at
 *    all (`/docs/getting-started/intro` does not end in `.krs`), and telling
 *    that visitor "this repo has no model" invents a repo out of a URL. Those
 *    paths belong to the SPA, which is where they went before this route
 *    existed.
 * 2. **Deterministic vs transient.** A 502/500 is an outage. Dressing it as
 *    "no model here" would hide a working permalink behind a friendly page and
 *    turn a visible failure into a silent one.
 * 3. **Ref pinned or not.** An explicit `@<ref>` says the visitor meant a
 *    permalink, so they get the diagnosis rather than a page about how to make
 *    one — including for a 400, where the ref itself may be what is malformed.
 */
type BareRouteOutcome = "redirect" | "signpost" | "passthrough" | "error";

export function classifyResolveOutcome(
  result: Pick<ResolveResult, "status">,
  explicitRef: boolean,
): BareRouteOutcome {
  if (result.status === 200) return "redirect";
  if (explicitRef) return "error";
  if (result.status === 404) return "signpost";
  if (result.status === 400) return "passthrough";
  return "error";
}

/**
 * `Cache-Control` for a resolved 302.
 *
 * A full-SHA ref can never change, so it is cached for a year everywhere. A
 * `HEAD`/branch ref is held only by the shared edge cache (`s-maxage`) while the
 * visitor's browser revalidates (`max-age=0`), which shields GitHub raw without
 * ever replaying a stale redirect. The Cloudflare Cache API honours `s-maxage`
 * over `max-age`, so this still caches at the edge.
 */
export function redirectCacheControl(immutable: boolean | undefined): string {
  return immutable
    ? "public, max-age=31536000, immutable"
    : "public, s-maxage=60, max-age=0, must-revalidate";
}

/**
 * Rewrite a `/r/<rest>` path to its bare equivalent `/<rest>`.
 *
 * `/r/` was the original prefix (ADR-1828) and is retired by ADR-1961: it breaks
 * the host-swap property the bare form exists for. Nothing in the repo ever
 * published a `/r/` permalink, but links may exist outside it, so the prefix
 * survives as a 301 rather than disappearing.
 */
export function bareTargetForLegacyPrefix(pathname: string): string {
  const rest = pathname.replace(/^\/r(?=\/|$)/, "");
  return rest === "" ? "/" : rest;
}
