// Build-time guard (proactive TPL-20260616-01): fail if any repo-relative link or
// `#fragment` that points *into the published site* doesn't resolve — an unresolved
// route or a missing heading/`<a id>` anchor would otherwise 404 silently on the
// deployed site. Links that leave the site (examples/, ADRs, external) are out of
// scope here; they become GitHub URLs and are not validated.

import fs from "node:fs";
import { collectAnchors, extractTitle } from "./lib/markdown.ts";
import { extractLinkTargets, resolveLink } from "./lib/rewrite.ts";
import { routeOf } from "./lib/site-map.ts";
import { listSources, publishedSet } from "./sources.ts";

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
  const hasAnchor = (route: string, fragment: string): boolean => {
    if (fragment === "") return true;
    const id = decodeURIComponent(fragment.replace(/^#/, ""));
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
        } else if (!hasAnchor(resolved.route, resolved.fragment)) {
          failures.push({
            docsRel,
            target,
            reason: `anchor ${resolved.fragment} not found on /${resolved.route}`,
          });
        }
      } else if (resolved.kind === "in-page") {
        if (!hasAnchor(selfRoute, resolved.fragment)) {
          failures.push({
            docsRel,
            target,
            reason: `in-page anchor ${resolved.fragment} not found`,
          });
        }
      }
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`✗ ${failures.length} unresolved in-site link(s):\n\n`);
    for (const f of failures) {
      process.stderr.write(`  docs/${f.docsRel}\n    ${f.target}\n    → ${f.reason}\n`);
    }
    process.stderr.write(
      "\nFix the link or anchor in docs/, or add the target page to PUBLISHED_EN_FILES.\n",
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `✓ All in-site links and anchors resolve (${sources.length} pages checked).\n`,
  );
}

main();
