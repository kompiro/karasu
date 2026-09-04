// ---------------------------------------------------------------------------
// Text projections of the team-dependency derivation (#2597 slice A / #2635).
//
// Two shapes from one extraction, because two different readings are wanted
// and neither is a formatting variant of the other (the split ADR-1062 made
// for the CRUD matrix):
//
//   - **Markdown** is the reading surface. A team × team matrix answers "who
//     do we have to talk to" at a glance and stays legible past the point an
//     edge graph turns into a hairball; the detail table under it carries the
//     provenance that makes a cell checkable.
//   - **CSV** is the grep / spreadsheet surface, so it is tidy data: one row
//     per fact, discriminated by a `relation` column, with no sections a
//     parser would have to know about.
//
// Both print the unowned remainder. A projection that showed only what
// resolved would present a partial join as a complete one.
// ---------------------------------------------------------------------------

import type {
  TeamDependency,
  TeamDependencyEdge,
  TeamDependencyReport,
  UnownedEndpoint,
} from "./team-dependency-extract.js";

/**
 * The arrow each edge kind is written with in `.krs`, reused as the matrix
 * mark so the cell needs no legend beyond the syntax the reader already knows.
 */
const KIND_MARK: Record<string, string> = { sync: "->", async: "-->" };

/** A nested pair is drawn parenthesized — present, but not a cross-team path. */
function mark(dep: TeamDependency): string {
  const arrow = KIND_MARK[dep.kind] ?? dep.kind;
  return dep.relation === "nested" ? `(${arrow})` : arrow;
}

/** `~` marks an endpoint whose team was inherited from an ancestor, as the spike's report did. */
function endpointLabel(path: string, inherited: boolean): string {
  return inherited ? `${path}~` : path;
}

function viaLabel(edge: TeamDependencyEdge): string {
  const arrow = KIND_MARK[edge.kind] ?? edge.kind;
  const base = `${endpointLabel(edge.fromPath, edge.fromInherited)} ${arrow} ${endpointLabel(edge.toPath, edge.toInherited)}`;
  return edge.label === undefined ? base : `${base} "${edge.label}"`;
}

function unownedViaLabel(via: UnownedEndpoint["via"][number]): string {
  return `${via.from} ${KIND_MARK[via.kind] ?? via.kind} ${via.to}`;
}

function teamLabel(report: TeamDependencyReport, id: string): string {
  const team = report.teams.find((t) => t.id === id);
  return team?.label ?? id;
}

export function formatTeamDependenciesAsMarkdown(report: TeamDependencyReport): string {
  if (report.teams.length === 0) {
    return "_(no organization declared)_\n";
  }

  const lines: string[] = [];
  const ids = report.teams.map((t) => t.id);
  const cells = new Map<string, string[]>();
  for (const dep of report.dependencies) {
    const key = `${dep.fromTeam} ${dep.toTeam}`;
    const list = cells.get(key);
    if (list === undefined) cells.set(key, [mark(dep)]);
    else list.push(mark(dep));
  }

  const header = ["from \\ to", ...report.teams.map((t) => t.label ?? t.id)];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  for (const from of report.teams) {
    const row = [from.label ?? from.id];
    for (const to of ids) {
      // The diagonal is not "no dependency", it is a question the derivation
      // does not ask — an edge inside one team's holdings is internal work.
      row.push(from.id === to ? "—" : (cells.get(`${from.id} ${to}`)?.join(" ") ?? ""));
    }
    lines.push(`| ${row.join(" | ")} |`);
  }

  lines.push("");
  lines.push("## Dependencies");
  lines.push("");
  if (report.dependencies.length === 0) {
    lines.push("_(no team dependencies derived)_");
  } else {
    lines.push("| from | to | kind | relation | edges | via |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const dep of report.dependencies) {
      lines.push(
        `| ${teamLabel(report, dep.fromTeam)} | ${teamLabel(report, dep.toTeam)} | ${dep.kind} | ${dep.relation} | ${dep.via.length} | ${dep.via.map(viaLabel).join("<br>")} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Unowned endpoints");
  lines.push("");
  if (report.unowned.length === 0) {
    lines.push("_(every endpoint resolved to a team)_");
  } else {
    lines.push(
      `> ${report.unowned.length} endpoint(s) name a node no team owns, so the dependencies above are derived from part of the model. \`user\` endpoints are excluded — an actor is not ownable.`,
    );
    lines.push("");
    lines.push("| node | kind | edges |");
    lines.push("| --- | --- | --- |");
    for (const entry of report.unowned) {
      lines.push(
        `| ${entry.path} | ${entry.kind} | ${entry.via.map(unownedViaLabel).join("<br>")} |`,
      );
    }
  }

  lines.push("");
  lines.push("> `~` marks an endpoint whose team was inherited from its nearest owned ancestor.");
  lines.push(
    "> A parenthesized mark is a nested pair: one team is the other's ancestor in the org tree.",
  );

  return lines.join("\n") + "\n";
}

const CSV_HEADER = [
  "relation",
  "from_team",
  "to_team",
  "edge_kind",
  "node",
  "node_kind",
  "edges",
  "via",
];

export function formatTeamDependenciesAsCsv(report: TeamDependencyReport): string {
  const lines: string[] = [CSV_HEADER.join(",")];
  for (const dep of report.dependencies) {
    lines.push(
      [
        dep.relation,
        dep.fromTeam,
        dep.toTeam,
        dep.kind,
        "",
        "",
        String(dep.via.length),
        dep.via.map(viaLabel).join("|"),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  // Unowned endpoints share the table rather than getting a second one: CSV has
  // no sections, and a consumer that filters on `relation` reads both facts
  // with one pass instead of parsing two files.
  for (const entry of report.unowned) {
    lines.push(
      [
        "unowned",
        "",
        "",
        "",
        entry.path,
        entry.kind,
        String(entry.via.length),
        entry.via.map(unownedViaLabel).join("|"),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
