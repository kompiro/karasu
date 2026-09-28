/**
 * The CLI's backward-compatibility table (Issue #2961, design
 * `docs/design/karasu-authoring-skill.md` 論点 5).
 *
 * Agent-facing names — command names and flags — are never dropped outright.
 * A renamed or retired name gets an entry here and keeps working as a hidden
 * alias until `removal`, which must be a major release (never before 1.0.0).
 * Once removed, the entry stays as a permanent tombstone so a caller holding
 * the old name is told what replaced it instead of seeing "unknown command".
 *
 * Everything is generated from this one table: the alias rewrite, the stderr
 * notice, the tombstone failure and the `deprecations` list in
 * `karasu capabilities --json`. The module has no imports so the
 * `skill-cli-refs` lint can load it without the workspace graph.
 */

export interface Deprecation {
  kind: "command" | "flag";
  /** The retired spelling: a command name (`old-cmd`) or a long flag (`--old-flag`). */
  name: string;
  /** For `kind: "flag"`: the (current) command the flag belongs to. */
  command?: string;
  /** What to call instead: a command name, or a long flag of `command`. */
  replacement: string;
  /** The CLI version that deprecated the name. */
  since: string;
  /** The major release that removes the alias (e.g. `1.0.0`). */
  removal: string;
  /** Set once the alias is gone; the entry stays as a tombstone. */
  removed?: boolean;
}

export const DEPRECATIONS: readonly Deprecation[] = [];

/** How the entry reads in a notice: `old-cmd`, or `render --old-flag`. */
export function displayName(entry: Deprecation, spelling: string): string {
  return entry.kind === "flag" ? `${entry.command} ${spelling}` : spelling;
}

/**
 * The fixed-format stderr line. Agents parse it, so it is a contract: do not
 * translate it or change its shape (see docs/tools/cli.md).
 */
export function notice(entry: Deprecation): string {
  const status = entry.removed ? "removed" : "deprecated";
  return (
    `karasu: ${status}: '${displayName(entry, entry.name)}' -> ` +
    `'${displayName(entry, entry.replacement)}' ` +
    `(since ${entry.since}, removal ${entry.removal})\n`
  );
}

export interface ResolvedArgv {
  /** argv with every deprecated alias rewritten to its replacement. */
  argv: string[];
  /** One notice per deprecated alias that was used. */
  notices: string[];
  /** Set when a removed name was used: the tombstone line to print before exiting 1. */
  error?: string;
}

/**
 * Rewrite deprecated aliases in `argv` (the full `process.argv`, node and script
 * included) before commander sees it. The command is the first argument that
 * is not an option; flags are matched only after it and before a `--`
 * terminator, as `--flag` or `--flag=value`.
 */
export function applyDeprecations(
  argv: readonly string[],
  table: readonly Deprecation[],
): ResolvedArgv {
  const out = [...argv];
  const notices: string[] = [];

  const commandIndex = out.findIndex((arg, i) => i >= 2 && !arg.startsWith("-"));
  if (commandIndex === -1) return { argv: out, notices };

  const commandEntry = table.find((e) => e.kind === "command" && e.name === out[commandIndex]);
  if (commandEntry) {
    if (commandEntry.removed) return { argv: out, notices, error: notice(commandEntry) };
    out[commandIndex] = commandEntry.replacement;
    notices.push(notice(commandEntry));
  }
  const command = out[commandIndex];

  const flagEntries = table.filter((e) => e.kind === "flag" && e.command === command);
  for (let i = commandIndex + 1; i < out.length; i++) {
    const arg = out[i];
    if (arg === "--") break;
    const [spelling, ...value] = arg.split("=");
    const entry = flagEntries.find((e) => e.name === spelling);
    if (!entry) continue;
    if (entry.removed) return { argv: out, notices, error: notice(entry) };
    out[i] = [entry.replacement, ...value].join("=");
    if (!notices.includes(notice(entry))) notices.push(notice(entry));
  }

  return { argv: out, notices };
}
