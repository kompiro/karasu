import { validateDirectory, type ParsedAdr } from "./validator.ts";

export type OutputFormat = "list" | "markdown" | "json";

export function effectiveSet(parsed: ParsedAdr[]): ParsedAdr[] {
  return parsed.filter((p) => p.fm.status === "accepted" && !p.fm.superseded_by);
}

export function scopeSlice(
  parsed: ParsedAdr[],
  filter: { packages?: string[]; concerns?: string[]; topics?: string[] },
): ParsedAdr[] {
  const packages = filter.packages ?? [];
  const concerns = filter.concerns ?? [];
  const topics = filter.topics ?? [];
  if (packages.length === 0 && concerns.length === 0 && topics.length === 0) {
    throw new Error("slice requires at least one --package, --concern, or --topic filter");
  }
  const directlyMatched = parsed.filter((p) => {
    // `topic` is a top-level frontmatter field, not under `scope`, but it
    // slices the corpus the same way so we treat it as a third filter axis.
    const topicOk = topics.length === 0 || topics.includes(p.fm.topic);
    const scope = p.fm.scope;
    const pkgOk =
      packages.length === 0 ||
      (scope !== undefined && (scope.packages ?? []).some((pk) => packages.includes(pk)));
    const concernOk =
      concerns.length === 0 ||
      (scope !== undefined && (scope.concerns ?? []).some((c) => concerns.includes(c)));
    return topicOk && pkgOk && concernOk;
  });
  return expandClosure(
    parsed,
    directlyMatched.map((p) => p.id),
  );
}

export function closure(parsed: ParsedAdr[], startId: string): ParsedAdr[] {
  const byId = new Map(parsed.map((p) => [p.id, p]));
  if (!byId.has(startId)) {
    throw new Error(`ADR id "${startId}" not found`);
  }
  return expandClosure(parsed, [startId]);
}

function expandClosure(parsed: ParsedAdr[], seeds: string[]): ParsedAdr[] {
  const byId = new Map(parsed.map((p) => [p.id, p]));
  const visited = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (!node) continue;
    for (const dep of node.fm.depends_on ?? []) queue.push(dep);
  }
  return parsed.filter((p) => visited.has(p.id));
}

export function loadParsed(dir: string): ParsedAdr[] {
  // We reuse the validator's parsing pass. Any validation errors surface via
  // `pnpm adr:validate` / CI; extractors proceed with the parsed subset.
  return validateDirectory(dir).parsed;
}

export function format(adrs: ParsedAdr[], fmt: OutputFormat): string {
  const sorted = [...adrs].sort((a, b) => a.id.localeCompare(b.id));
  if (fmt === "json") {
    return (
      JSON.stringify(
        sorted.map((p) => ({
          id: p.id,
          title: p.fm.title,
          status: p.fm.status,
          date: p.fm.date,
          file: p.file,
          scope: p.fm.scope ?? null,
          depends_on: p.fm.depends_on ?? [],
          superseded_by: p.fm.superseded_by ?? null,
        })),
        null,
        2,
      ) + "\n"
    );
  }
  if (fmt === "markdown") {
    const lines = sorted.map((p) => `- [${p.id}](${p.file.split("/").pop()}) — ${p.fm.title}`);
    return lines.join("\n") + "\n";
  }
  return sorted.map((p) => `${p.id}\t${p.fm.status}\t${p.fm.title}`).join("\n") + "\n";
}
