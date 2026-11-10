// Build-time guard (proactive TPL-1621): fail if any repo-relative link or
// `#fragment` that points *into the published site* doesn't resolve — an unresolved
// route or a missing heading/`<a id>` anchor would otherwise 404 silently on the
// deployed site.
//
// A repo-relative link that leaves the site (examples/, ADRs, design docs) becomes
// a GitHub URL. Its fragment is not validated, but its file must exist: a renamed
// or deleted unpublished doc would otherwise leave a published page pointing at a
// GitHub 404 (TPL-2005). External links are out of scope.

import fs from "node:fs";
import path from "node:path";
import { collectAnchors, extractTitle } from "./lib/markdown.ts";
import { extractLinkTargets, resolveLink } from "./lib/rewrite.ts";
import { routeOf } from "./lib/site-map.ts";
import { REPO_ROOT, listSources, publishedSet } from "./sources.ts";

interface Failure {
  docsRel: string;
  target: string;
  reason: string;
}

function main(): void {
  const sources = listSources();
  const published = publishedSet(sources);

  // route -> reachable anchors, plus the set of valid routes.
  const anchorsByRoute = new Map<string, Set<string>>();
  const validRoutes = new Set<string>();
  const rawByDocsRel = new Map<string, string>();

  for (const { docsRel, absPath } of sources) {
    const raw = fs.readFileSync(absPath, "utf8");
    rawByDocsRel.set(docsRel, raw);
    const { title, body } = extractTitle(raw);
    const route = routeOf(docsRel);
    validRoutes.add(route);
    anchorsByRoute.set(route, collectAnchors(body, title));
  }

  const failures: Failure[] = [];
  // `suffix` is the `?query#fragment` tail; only the fragment (if any) is an anchor.
  const hasAnchor = (route: string, suffix: string): boolean => {
    const hashIdx = suffix.indexOf("#");
    if (hashIdx < 0) return true;
    const id = decodeURIComponent(suffix.slice(hashIdx + 1));
    return anchorsByRoute.get(route)?.has(id) ?? false;
  };

  for (const { docsRel } of sources) {
    const selfRoute = routeOf(docsRel);
    for (const target of extractLinkTargets(rawByDocsRel.get(docsRel) ?? "")) {
      const resolved = resolveLink(target, { srcDocsRel: docsRel, published });
      if (resolved.kind === "internal") {
        if (!validRoutes.has(resolved.route)) {
          failures.push({
            docsRel,
            target,
            reason: `route /${resolved.route} is not a published page`,
          });
        } else if (!hasAnchor(resolved.route, resolved.suffix)) {
          failures.push({
            docsRel,
            target,
            reason: `anchor ${resolved.suffix} not found on /${resolved.route}`,
          });
        }
      } else if (resolved.kind === "repo") {
        if (!fs.existsSync(path.join(REPO_ROOT, resolved.repoPath))) {
          failures.push({
            docsRel,
            target,
            reason: `${resolved.repoPath} does not exist in the repo`,
          });
        }
      } else if (resolved.kind === "in-page") {
        if (!hasAnchor(selfRoute, resolved.suffix)) {
          failures.push({
            docsRel,
            target,
            reason: `in-page anchor ${resolved.suffix} not found`,
          });
        }
      }
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`✗ ${failures.length} unresolved link(s):\n\n`);
    for (const f of failures) {
      process.stderr.write(`  docs/${f.docsRel}\n    ${f.target}\n    → ${f.reason}\n`);
    }
    process.stderr.write(
      "\nFix the link or anchor in docs/, or add the target page to PUBLISHED_EN_FILES.\n" +
        "A link to a file that left the repo follows the file to its new path, or goes.\n",
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `✓ All in-site links and anchors resolve, and every repo link's file exists (${sources.length} pages checked).\n`,
  );
}

main();
