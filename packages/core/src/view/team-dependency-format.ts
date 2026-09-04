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
import { edgeArrow } from "../types/ast.js";

/**
 * A nested pair is drawn parenthesized — present, but not a cross-team path.
 *
 * The mark is the `.krs` arrow itself (`edgeArrow`, shared with the formatter),
 * so the cell needs no legend beyond the syntax the reader already knows.
 */
function mark(dep: TeamDependency): string {
  const arrow = edgeArrow(dep.kind);
  return dep.relation === "nested" ? `(${arrow})` : arrow;
}

/** `~` marks an endpoint whose team was inherited from an ancestor, as the spike's report did. */
function endpointLabel(path: string, inherited: boolean): string {
  return inherited ? `${path}~` : path;
}

function viaLabel(edge: TeamDependencyEdge): string {
  const arrow = edgeArrow(edge.kind);
  const base = `${endpointLabel(edge.fromPath, edge.fromInherited)} ${arrow} ${endpointLabel(edge.toPath, edge.toInherited)}`;
  return edge.label === undefined ? base : `${base} "${edge.label}"`;
}

function unownedViaLabel(via: UnownedEndpoint["via"][number]): string {
  return `${via.from} ${edgeArrow(via.kind)} ${via.to}`;
}

/**
 * Team id -> display name, built once. The Dependencies table asks twice per
 * row, so a linear `find` over the axis made rendering O(rows x teams) for a
 * list the header already walks.
 */
function teamLabels(report: TeamDependencyReport): Map<string, string> {
  return new Map(report.teams.map((t) => [t.id, t.label ?? t.id]));
}

export function formatTeamDependenciesAsMarkdown(report: TeamDependencyReport): string {
  const lines: string[] = [];
  const labels = teamLabels(report);
  const nameOf = (id: string): string => labels.get(id) ?? id;

  if (report.teams.length === 0) {
    // No matrix to draw, but the sections below still run. Returning here would
    // make the default surface silent about a join that covered nothing — the
    // failure this module's header names — while the csv projection reported
    // it, so the two would disagree about the same model.
    lines.push("_(no organization declared)_");
  } else {
    const cells = new Map<string, string[]>();
    for (const dep of report.dependencies) {
      const key = pairKey(dep.fromTeam, dep.toTeam);
      const list = cells.get(key);
      if (list === undefined) cells.set(key, [mark(dep)]);
      else list.push(mark(dep));
    }

    const header = ["from \\ to", ...report.teams.map((t) => nameOf(t.id))];
    lines.push(`| ${header.map(mdCell).join(" | ")} |`);
    lines.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (const from of report.teams) {
      const row = [nameOf(from.id)];
      for (const to of report.teams) {
        // The diagonal is not "no dependency", it is a question the derivation
        // does not ask — an edge inside one team's holdings is internal work.
        row.push(from.id === to.id ? "—" : (cells.get(pairKey(from.id, to.id))?.join(" ") ?? ""));
      }
      lines.push(`| ${row.map(mdCell).join(" | ")} |`);
    }
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
      const cells = [
        nameOf(dep.fromTeam),
        nameOf(dep.toTeam),
        dep.kind,
        dep.relation,
        String(dep.via.length),
        dep.via.map(viaLabel).join("<br>"),
      ];
      lines.push(`| ${cells.map(mdCell).join(" | ")} |`);
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
      const cells = [entry.path, entry.kind, entry.via.map(unownedViaLabel).join("<br>")];
      lines.push(`| ${cells.map(mdCell).join(" | ")} |`);
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

/**
 * `|` is the markdown table's own column separator, so a team label or an edge
 * label containing one splits its row into more cells than the header declares
 * and misaligns every row after it. Escaping is the cell writer's job — there
 * is no value a projection may pass through unescaped.
 */
/**
 * Matrix cell key. Joined the way `dependencyKey` joins its triple, and for the
 * same reason: a team id may contain spaces, so no printable separator tells
 * `("Team", "A B")` from `("Team A", "B")`, and a collision here puts a mark in
 * the wrong cell.
 */
function pairKey(fromTeam: string, toTeam: string): string {
  return JSON.stringify([fromTeam, toTeam]);
}

function mdCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
