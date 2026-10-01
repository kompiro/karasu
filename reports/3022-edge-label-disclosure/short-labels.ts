// Rewrites the 41 domain-level edges of the Umami model the way #3018 asks the
// reverse-architecture skill to write them: a short verb-phrase label, with the
// original evidence moved to the edge's `description` (property block, ADR-2209).
// This is the writer-side variant (V1): it changes the model, not the renderer.

const SHORT: Record<string, string> = {
  "Tracking->TrackedEntities": "resolves tracked entity",
  "Analytics->Identity": "authorizes requests",
  "Analytics->TrackedEntities": "loads website",
  "Analytics->Tracking": "deletes sessions",
  "SessionReplay->Tracking": "uses session token",
  "SessionReplay->TrackedEntities": "reads replay config",
  "SessionReplay->Identity": "authorizes requests",
  "SessionReplay->Analytics": "reuses query filters",
  "SessionReplay->Teams": "checks plan gate",
  "TrackedEntities->Sharing": "manages share links",
  "TrackedEntities->Identity": "authorizes routes",
  "TrackedEntities->Teams": "checks team limits",
  "TrackedEntities->Analytics": "lists sparkline charts",
  "TrackedEntities->SessionReplay": "normalizes replay config",
  "TrackedEntities->Boards": "resolves board ids",
  "TrackedEntities->Administration": "checks plan limits",
  "Boards->Identity": "authorizes board access",
  "Boards->TrackedEntities": "checks entity access",
  "Boards->Analytics": "validates report ids",
  "Boards->Teams": "lists team boards",
  "Sharing->TrackedEntities": "loads shared entity",
  "Sharing->Boards": "loads shared board",
  "Sharing->Teams": "finds team owner",
  "Sharing->Identity": "verifies share token",
  "Sharing->Analytics": "embeds overview pages",
  "Teams->Identity": "authorizes team routes",
  "Teams->TrackedEntities": "deletes team entities",
  "Teams->Boards": "deletes team boards",
  "Teams->Sharing": "deletes team shares",
  "Teams->Administration": "checks plan limits",
  "Identity->Teams": "loads memberships",
  "Identity->TrackedEntities": "checks entity ownership",
  "Identity->Boards": "checks board ownership",
  "Identity->Analytics": "checks report ownership",
  "Identity->Administration": "checks plan limits",
  "Administration->Identity": "manages users",
  "Administration->Teams": "lists teams",
  "Administration->TrackedEntities": "lists websites",
  "McpTools->TrackedEntities": "lists websites",
  "McpTools->Analytics": "calls read API",
  "McpTools->Identity": "verifies API key",
};

/** Returns the model with every domain-level edge rewritten, and how many were. */
export function shortenDomainEdgeLabels(source: string): { source: string; rewritten: number } {
  let domain = "";
  let rewritten = 0;
  const out: string[] = [];
  for (const line of source.split("\n")) {
    const d = /^ {4}domain (\w+) \{/.exec(line);
    if (d) domain = d[1];
    const e = /^( {6})-> (\w+) "(.*)"\s*$/.exec(line);
    if (e && domain) {
      const key = `${domain}->${e[2]}`;
      const short = SHORT[key];
      if (!short) throw new Error(`no short label for ${key}`);
      const evidence = e[3].replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      out.push(
        `${e[1]}-> ${e[2]} {`,
        `${e[1]}  label "${short}"`,
        `${e[1]}  description "${evidence}"`,
        `${e[1]}}`,
      );
      rewritten++;
      continue;
    }
    out.push(line);
  }
  return { source: out.join("\n"), rewritten };
}
