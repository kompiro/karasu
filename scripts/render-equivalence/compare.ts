// The rule `Render equivalence` judges a refactor by (Issue #3509, #3505
// slice B): two sides are equal when every output they produced is equal.
// Pure, so the rule is tested without running a core.
//
// A difference is a difference in outcome. Two sides that fail the same way
// (an acceptance fence whose `import` cannot resolve on its own) are equal;
// one side failing alone, failing differently, or any output or diagnostic
// line differing is a difference.

/**
 * One output of one side: a view's SVG, a file's formatter output or a
 * sheet's Tidy output. `output` is a digest of the text, `diagnostics` the
 * diagnostics and warnings in the order the core produced them.
 */
export type Outcome =
  | { ok: true; output: string; diagnostics: string[] }
  /** The call threw; `error` is the first line of its message. */
  | { ok: false; error: string };

/** Every outcome of one side, by key (`render <entry> :: <view>`, `format <file>`, ...). */
export type SideOutput = Record<string, Outcome>;

export interface Difference {
  key: string;
  /** What differs, in a phrase: `output`, `diagnostics`, `failed at HEAD: ...`. */
  reason: string;
}

/** First line, trimmed to something a summary row can hold. */
export function firstLine(text: string): string {
  const line = text.split("\n")[0].trim();
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

function diagnosticsReason(base: readonly string[], head: readonly string[]): string {
  const at = base.findIndex((line, i) => head[i] !== line);
  const i = at === -1 ? base.length : at;
  if (i >= head.length) return `diagnostics: HEAD lacks ${firstLine(base[i])}`;
  if (i >= base.length) return `diagnostics: HEAD adds ${firstLine(head[i])}`;
  return `diagnostics: ${firstLine(base[i])} became ${firstLine(head[i])}`;
}

function differ(base: Outcome, head: Outcome): string | null {
  if (!base.ok && !head.ok) {
    return base.error === head.error ? null : `failed differently: ${head.error}`;
  }
  if (!head.ok) return `failed at HEAD: ${head.error}`;
  if (!base.ok) return `failed at the merge base: ${base.error}`;
  if (base.output !== head.output) return "output";
  const same =
    base.diagnostics.length === head.diagnostics.length &&
    base.diagnostics.every((line, i) => head.diagnostics[i] === line);
  return same ? null : diagnosticsReason(base.diagnostics, head.diagnostics);
}

/** The differences between the sides over the union of their keys, sorted by key. */
export function compareOutputs(base: SideOutput, head: SideOutput): Difference[] {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].sort();
  const differences: Difference[] = [];
  for (const key of keys) {
    const before = base[key];
    const after = head[key];
    let reason: string | null;
    if (before === undefined) reason = "only at HEAD";
    else if (after === undefined) reason = "only at the merge base";
    else reason = differ(before, after);
    if (reason !== null) differences.push({ key, reason });
  }
  return differences;
}

/** What `run.ts` writes and `verdict.ts` reads. */
export interface ComparisonResult {
  version: 1;
  baseSha: string;
  headSha: string;
  /** How many keys were compared (the union of both sides). */
  compared: number;
  differences: Difference[];
}

/** Keys either side produced, counted once. */
export function countKeys(base: SideOutput, head: SideOutput): number {
  return new Set([...Object.keys(base), ...Object.keys(head)]).size;
}
