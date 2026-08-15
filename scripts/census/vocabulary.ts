/* eslint-disable no-console -- CLI entry point; stdout reporting is the whole job */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Parser } from "../../packages/core/src/parser/parser.ts";
import { StyleParser } from "../../packages/core/src/parser/style-parser.ts";
import { analyze } from "../../packages/core/src/resolver/warnings.ts";
import { createEmptyKrsFile } from "../../packages/core/src/types/ast.ts";
import type { KrsFile, KrsNode } from "../../packages/core/src/types/ast.ts";
import {
  DEFAULT_DOC_ROOTS,
  extractFences,
  KNOWN_MARKERS,
  markdownFilesUnder,
} from "../lint/krs-fences.ts";

/**
 * Vocabulary census over a set of `.krs` / `.krs.style` sources.
 *
 * ## Why this exists
 *
 * The v2.0 vocabulary closure (`docs/roadmap.md` §Syntax 2.0 プログラム,
 * [ADR-2065](../../docs/adr/2065-tags-and-facets.md)) lists 「corpus 実測」 as
 * its first precondition: before tag / annotation are closed to the tool
 * vocabulary, measure what non-builtin vocabulary is actually in use, so the
 * genuinely-used names can be evaluated as builtin candidates at closure time.
 *
 * Nothing in the repo could answer that. `karasu coverage` and `karasu matrix`
 * report on **one** model; the promotion-gate rows in `docs/roadmap.md` assume
 * an aggregator over a *set* of models that nobody had built. This is that
 * aggregator.
 *
 * ## What it measures, and how the builtin split is decided
 *
 * The classification of a name as builtin or not is **read off the shipped
 * diagnostics** — `tag-not-builtin` / `annotation-not-builtin` and their
 * `.krs.style` counterparts — rather than re-derived from `REFERENCE_DATA`
 * here. Two reasons, and the second is the load-bearing one:
 *
 * 1. A second copy of the builtin list silently stops recognizing whichever
 *    name was added last (TPL-1720); [ADR-2172](../../docs/adr/2172-builtin-vocabulary-expansion.md)
 *    has already moved that list once.
 * 2. The census exists to predict what the closure will do. The closure is
 *    those diagnostics being escalated. Measuring anything other than "what
 *    the diagnostic fires on" would measure a different event than the one
 *    being planned.
 *
 * So the walk below supplies the *denominator* (how many tag / annotation
 * occurrences there are at all) and the diagnostics supply the *numerator*.
 * `vocabulary.test.ts` cross-checks the two against each other: if the walk
 * ever covers a node collection the diagnostic does not — or vice versa — the
 * non-builtin totals stop agreeing and the test fails.
 *
 * Note that the tool-owned side includes the **system-assigned** tags
 * (`SYSTEM_ASSIGNED_TAGS` — `[implicit]`, `[inferred]`, …). They are not
 * builtin *authored* vocabulary, but they are tool-owned, which is the
 * distinction the closure turns on.
 *
 * ## What it deliberately does not do
 *
 * It does not resolve imports. A tag is written literally in the file it
 * appears in, so per-file parsing counts each occurrence exactly once;
 * resolving imports would count a re-exported node again in every file that
 * imports it. This differs from the scope-sensitive checks in
 * `examples.test.ts`, which need the merged model precisely because an edge's
 * endpoints may live in another file.
 */

/** Occurrence counts keyed by the name as written (no `[...]` / `@` sigil). */
export type NameTally = Record<string, number>;

/** One vocabulary register's usage, split by who owns the name. */
export interface RegisterCensus {
  /** Every occurrence, builtin and not. */
  occurrences: number;
  /** Names the tool owns (builtin + system-assigned). */
  builtin: NameTally;
  /** Names the closure would warn about. */
  nonBuiltin: NameTally;
  /**
   * Where each non-builtin name was written, deduplicated, in first-seen
   * order. A bare tally answers "how much noise will the closure make"; the
   * precondition also asks "which of these names deserve promoting to
   * builtin", and that is unanswerable without being able to go read the use.
   */
  nonBuiltinSites: Record<string, string[]>;
}

export interface VocabularyCensus {
  scanned: {
    krsFiles: number;
    styleFiles: number;
    /** ```krs blocks parsed out of markdown (excludes `fragment`). */
    docFences: number;
    /** Sources the parser rejected outright; they contribute no counts. */
    unparseable: string[];
    /**
     * Names a diagnostic flagged that the walk never saw — i.e. the two halves
     * of the census disagree about where vocabulary can live. Non-empty means
     * the numbers below are wrong, not merely surprising, so callers surface
     * this rather than reporting a clean census.
     */
    divergences: string[];
  };
  tags: RegisterCensus;
  annotations: RegisterCensus;
  facets: {
    /** `facet <id> { … }` declaration blocks, by id. */
    declared: NameTally;
    /** Element-side `facets <id>` references, by id. */
    memberships: NameTally;
    /** Nodes carrying at least one `facets` reference. */
    nodesWithFacets: number;
  };
  styleSelectors: {
    tagBuiltin: NameTally;
    tagNonBuiltin: NameTally;
    annotationBuiltin: NameTally;
    annotationNonBuiltin: NameTally;
    /** `[facets=<id>]` selectors — the migration target the closure points at. */
    facet: NameTally;
    /**
     * Sheets each non-builtin selector name appears in. Annotation names are
     * prefixed `@` so a tag and an annotation of the same name stay apart.
     */
    nonBuiltinSites: Record<string, string[]>;
  };
}

function emptyRegister(): RegisterCensus {
  return { occurrences: 0, builtin: {}, nonBuiltin: {}, nonBuiltinSites: {} };
}

export function emptyCensus(): VocabularyCensus {
  return {
    scanned: { krsFiles: 0, styleFiles: 0, docFences: 0, unparseable: [], divergences: [] },
    tags: emptyRegister(),
    annotations: emptyRegister(),
    facets: { declared: {}, memberships: {}, nodesWithFacets: 0 },
    styleSelectors: {
      tagBuiltin: {},
      tagNonBuiltin: {},
      annotationBuiltin: {},
      annotationNonBuiltin: {},
      facet: {},
      nonBuiltinSites: {},
    },
  };
}

function bump(tally: NameTally, name: string, by = 1): void {
  tally[name] = (tally[name] ?? 0) + by;
}

/**
 * Every logical node in the file, depth-first.
 *
 * The root collections mirror the ones `detectTagsNotBuiltin` /
 * `detectAnnotationsNotBuiltin` visit in `packages/core/src/resolver/warnings.ts`.
 * `deploys` is absent on purpose and not an oversight: `DeployNode` has no
 * `tags` / `annotations` / `facets` fields at all, so a deploy unit cannot
 * carry vocabulary to count.
 */
function* walkNodes(file: KrsFile): Generator<KrsNode> {
  const roots = [
    ...file.systems,
    ...file.clients,
    ...file.services,
    ...file.domains,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ];
  const stack: KrsNode[] = [...roots];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    yield node;
    stack.push(...node.children);
  }
}

/** Annotation-bearing `team` blocks, including nested teams. */
function* walkTeams(file: KrsFile): Generator<{ annotations: string[] }> {
  const stack = file.organizations.flatMap((organization) => organization.teams);
  while (stack.length > 0) {
    const team = stack.pop();
    if (team === undefined) continue;
    yield team;
    stack.push(...team.children.filter((child) => child.kind === "team"));
  }
}

/**
 * Fold one `.krs` source into the census.
 *
 * `label` names the source in the `unparseable` list — a repo-relative path
 * for a file, `path:line` for a markdown fence.
 */
export function addKrsSource(census: VocabularyCensus, label: string, source: string): void {
  const parsed = Parser.parse(source);
  if (parsed.diagnostics.some((d) => d.severity === "error")) {
    census.scanned.unparseable.push(label);
    return;
  }
  const file = parsed.value;

  // Denominator: every occurrence as written.
  const tagTotals: NameTally = {};
  const annotationTotals: NameTally = {};
  for (const node of walkNodes(file)) {
    for (const tag of node.tags) bump(tagTotals, tag);
    for (const annotation of node.annotations) bump(annotationTotals, annotation);
    for (const edge of node.edges) {
      for (const tag of edge.tags) bump(tagTotals, tag);
    }
    // Membership is read off the declaration site rather than `facetIndex`:
    // the index is keyed by bare node id, so two same-named nodes in different
    // scopes collapse into one entry (TPL-1352, the bug #2177 hit).
    if (node.facets !== undefined && node.facets.length > 0) {
      census.facets.nodesWithFacets += 1;
      for (const facet of node.facets) bump(census.facets.memberships, facet);
    }
  }
  for (const team of walkTeams(file)) {
    for (const annotation of team.annotations) bump(annotationTotals, annotation);
  }
  for (const declaration of file.facets) bump(census.facets.declared, declaration.id);

  // Numerator: what the closure would warn about.
  const nonBuiltinTags: NameTally = {};
  const nonBuiltinAnnotations: NameTally = {};
  for (const warning of analyze(file, [])) {
    if (warning.kind === "tag-not-builtin") bump(nonBuiltinTags, warning.params.tag);
    if (warning.kind === "annotation-not-builtin") {
      bump(nonBuiltinAnnotations, warning.params.annotation);
    }
  }

  foldRegister(census, census.tags, tagTotals, nonBuiltinTags, label, "tag");
  foldRegister(
    census,
    census.annotations,
    annotationTotals,
    nonBuiltinAnnotations,
    label,
    "annotation",
  );
}

/**
 * Split one source's totals into the builtin / non-builtin sides.
 *
 * A name is non-builtin for the whole file or not at all — the diagnostic
 * tests the name, never the site — so the builtin remainder is a subtraction
 * rather than a second lookup.
 */
function foldRegister(
  census: VocabularyCensus,
  register: RegisterCensus,
  totals: NameTally,
  nonBuiltin: NameTally,
  label: string,
  register_: string,
): void {
  // The walk and the diagnostic are supposed to cover the same ground. If the
  // diagnostic flags a name the walk never reached, the walk is missing a node
  // collection and every number here is understated — so say so instead of
  // quietly reporting a smaller census. The reverse direction (walk sees a
  // name the diagnostic ignores) is what the builtin tally legitimately is.
  for (const name of Object.keys(nonBuiltin)) {
    if (totals[name] === undefined) {
      census.scanned.divergences.push(`${label}: ${register_} \`${name}\` flagged but not walked`);
    }
  }

  for (const [name, count] of Object.entries(totals)) {
    register.occurrences += count;
    const flagged = nonBuiltin[name] ?? 0;
    if (flagged > 0) {
      bump(register.nonBuiltin, name, flagged);
      const sites = (register.nonBuiltinSites[name] ??= []);
      if (!sites.includes(label)) sites.push(label);
    }
    if (count - flagged > 0) bump(register.builtin, name, count - flagged);
  }
}

/** Fold one `.krs.style` source into the census. */
export function addStyleSource(census: VocabularyCensus, label: string, source: string): void {
  const parsed = StyleParser.parse(source, label);
  if (parsed.diagnostics.some((d) => d.severity === "error")) {
    census.scanned.unparseable.push(label);
    return;
  }
  const sheet = parsed.value;

  const tagTotals: NameTally = {};
  const annotationTotals: NameTally = {};
  for (const rule of sheet.rules) {
    for (const tag of rule.selector.tags) bump(tagTotals, tag);
    for (const annotation of rule.selector.annotations) bump(annotationTotals, annotation);
    for (const facet of rule.selector.facets) bump(census.styleSelectors.facet, facet);
  }

  // `systemSheetCount = 0`: every rule here is authored, so none is exempt.
  // The default of 1 exists to skip the built-in sheet the app prepends.
  const nonBuiltinTags: NameTally = {};
  const nonBuiltinAnnotations: NameTally = {};
  for (const warning of analyze(createEmptyKrsFile(), [sheet], 0)) {
    if (warning.kind === "style-tag-selector-not-builtin") bump(nonBuiltinTags, warning.params.tag);
    if (warning.kind === "style-annotation-selector-not-builtin") {
      bump(nonBuiltinAnnotations, warning.params.annotation);
    }
  }

  for (const [name, count] of Object.entries(tagTotals)) {
    const flagged = nonBuiltinTags[name] ?? 0;
    if (flagged > 0) {
      bump(census.styleSelectors.tagNonBuiltin, name, flagged);
      noteSite(census.styleSelectors.nonBuiltinSites, name, label);
    }
    if (count - flagged > 0) bump(census.styleSelectors.tagBuiltin, name, count - flagged);
  }
  for (const [name, count] of Object.entries(annotationTotals)) {
    const flagged = nonBuiltinAnnotations[name] ?? 0;
    if (flagged > 0) {
      bump(census.styleSelectors.annotationNonBuiltin, name, flagged);
      noteSite(census.styleSelectors.nonBuiltinSites, `@${name}`, label);
    }
    if (count - flagged > 0) bump(census.styleSelectors.annotationBuiltin, name, count - flagged);
  }
}

function noteSite(sites: Record<string, string[]>, name: string, label: string): void {
  const seen = (sites[name] ??= []);
  if (!seen.includes(label)) seen.push(label);
}

/** Repo-relative paths of every `.krs` / `.krs.style` below `root`. */
export function sourceFilesUnder(repoRoot: string, root: string): string[] {
  const abs = join(repoRoot, root);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) {
    return root.endsWith(".krs") || root.endsWith(".krs.style") ? [root] : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    // `.claude/worktrees/**` holds whole copies of this repo, so a `.` root
    // would count every example once per in-flight branch. Dot-directories and
    // `node_modules` are skipped for the same reason `krs-fences` names its
    // roots explicitly: a census over accidental copies is not a census.
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const rel = `${root}/${entry.name}`;
    if (entry.isDirectory()) files.push(...sourceFilesUnder(repoRoot, rel));
    else if (entry.name.endsWith(".krs") || entry.name.endsWith(".krs.style")) files.push(rel);
  }
  return files;
}

/**
 * Census over `.krs` / `.krs.style` under `roots`, plus — when `docRoots` is
 * given — the ```krs fences embedded in the markdown below them.
 *
 * The fences are worth counting separately: `pnpm lint:krs-fences` guards them
 * for parse errors and deprecation-class codes, and `tag-not-builtin` is
 * neither, so our own spec and guide prose can teach vocabulary the closure
 * will warn about without any existing check noticing.
 */
export function censusOver(
  repoRoot: string,
  roots: string[],
  docRoots: string[] = [],
): VocabularyCensus {
  const census = emptyCensus();

  // Overlapping roots (`examples examples/en`) would otherwise count the
  // intersection twice and quietly inflate every tally.
  const seen = new Set<string>();

  for (const root of roots) {
    for (const file of sourceFilesUnder(repoRoot, root)) {
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(join(repoRoot, file), "utf8");
      if (file.endsWith(".krs.style")) {
        census.scanned.styleFiles += 1;
        addStyleSource(census, file, source);
      } else {
        census.scanned.krsFiles += 1;
        addKrsSource(census, file, source);
      }
    }
  }

  for (const root of docRoots) {
    for (const file of markdownFilesUnder(repoRoot, root)) {
      for (const fence of extractFences(readFileSync(join(repoRoot, file), "utf8"))) {
        const [lang, ...rest] = fence.info.split(/\s+/);
        const marker = rest.join(" ");
        // Any declared marker means the block is not a plain model: `fragment`
        // is an excerpt that does not parse, `invalid` is a deliberate
        // bad-input demo whose vocabulary is not a usage signal. Read from the
        // fences guard so a marker added there is skipped here the same day.
        if (lang !== "krs" || KNOWN_MARKERS.has(marker)) continue;
        census.scanned.docFences += 1;
        addKrsSource(census, `${file}:${fence.line}`, fence.body);
      }
    }
  }

  return census;
}

function total(tally: NameTally): number {
  return Object.values(tally).reduce((sum, count) => sum + count, 0);
}

/** `name×count` pairs, most-used first, then alphabetical. */
function rank(tally: NameTally): string {
  const entries = Object.entries(tally).sort(
    ([leftName, left], [rightName, right]) => right - left || leftName.localeCompare(rightName),
  );
  if (entries.length === 0) return "none";
  return entries.map(([name, count]) => `${name}×${count}`).join(", ");
}

/** Indented `name → site, site` lines for a register's non-builtin names. */
function sitesOf(register: RegisterCensus): string[] {
  return Object.entries(register.nonBuiltinSites)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, sites]) => `    ${name} → ${sites.join(", ")}`);
}

export function formatCensus(census: VocabularyCensus): string {
  const { scanned, tags, annotations, facets, styleSelectors } = census;
  const lines = [
    `scanned: ${scanned.krsFiles} .krs, ${scanned.styleFiles} .krs.style, ${scanned.docFences} doc fence(s)`,
  ];
  if (scanned.unparseable.length > 0) {
    lines.push(`  unparseable (excluded): ${scanned.unparseable.length}`);
    for (const label of scanned.unparseable) lines.push(`    ${label}`);
  }

  lines.push(
    "",
    `tags: ${tags.occurrences} occurrence(s) — ${total(tags.nonBuiltin)} non-builtin`,
    `  builtin:     ${rank(tags.builtin)}`,
    `  non-builtin: ${rank(tags.nonBuiltin)}`,
    ...sitesOf(tags),
    "",
    `annotations: ${annotations.occurrences} occurrence(s) — ${total(annotations.nonBuiltin)} non-builtin`,
    `  builtin:     ${rank(annotations.builtin)}`,
    `  non-builtin: ${rank(annotations.nonBuiltin)}`,
    ...sitesOf(annotations),
    "",
    `facets: ${total(facets.declared)} declaration block(s) of ` +
      `${Object.keys(facets.declared).length} id(s), ` +
      `${total(facets.memberships)} membership(s) on ${facets.nodesWithFacets} node(s)`,
    `  declared: ${rank(facets.declared)}`,
    `  members:  ${rank(facets.memberships)}`,
    "",
    "style selectors:",
    `  tag builtin:        ${rank(styleSelectors.tagBuiltin)}`,
    `  tag non-builtin:    ${rank(styleSelectors.tagNonBuiltin)}`,
    `  annotation builtin: ${rank(styleSelectors.annotationBuiltin)}`,
    `  annotation non-b.:  ${rank(styleSelectors.annotationNonBuiltin)}`,
    `  facet:              ${rank(styleSelectors.facet)}`,
    ...Object.entries(styleSelectors.nonBuiltinSites)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, sites]) => `    ${name} → ${sites.join(", ")}`),
  );
  return lines.join("\n");
}

/** Roots scanned when none are named on the command line. */
export const DEFAULT_SOURCE_ROOTS = ["examples"];

function main(): void {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const withDocs = argv.includes("--docs");
  const roots = argv.filter((arg) => !arg.startsWith("--"));

  const chosen = roots.length > 0 ? roots : DEFAULT_SOURCE_ROOTS;
  // A root that resolves to nothing — a typo, or an absolute path, which
  // `sourceFilesUnder` joins onto the repo root and finds nowhere — otherwise
  // prints a clean "0 scanned, non-builtin: none" census and exits 0. That is
  // the silent-zero this instrument would be worst at: it reads as evidence
  // that the corpus is clean.
  const empty = chosen.filter((root) => sourceFilesUnder(process.cwd(), root).length === 0);
  if (empty.length > 0) {
    console.error(
      `census: no .krs or .krs.style below ${empty.join(", ")} — ` +
        "roots are repo-relative paths (e.g. `examples`, `packages/vscode-e2e/fixtures`)",
    );
    process.exit(1);
  }

  const census = censusOver(process.cwd(), chosen, withDocs ? DEFAULT_DOC_ROOTS : []);

  if (census.scanned.divergences.length > 0) {
    console.error("census: the walk and the diagnostics disagree — these counts are understated:");
    for (const divergence of census.scanned.divergences) console.error(`  ${divergence}`);
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(census, null, 2));
    return;
  }
  console.log(formatCensus(census));
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /vocabulary\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
