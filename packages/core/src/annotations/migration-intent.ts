/**
 * Consumer-side interpretation of migration-intent annotation parameters
 * (`@deprecated(until: …)` / `@experimental(until: …)` / `@migration_target(from: …)`).
 *
 * The language layer (parser) stores these verbatim on
 * `BaseNodeFields.annotationParams` (ADR-20260615-04). This module is the
 * consumer that gives the stored `until` value an *effect* — interpreting it
 * by precision so display / filter surfaces can treat a real date as
 * machine-usable while keeping an ambiguous phrase ("sometime next year") as
 * an opaque, display-only string.
 *
 * Per ADR-20260615-04, `until` is recorded **intent**, not a runtime deadline:
 * this module never reads the current date and never decides whether a node is
 * "overdue". It only normalizes the *written* value into a comparable form.
 * See `docs/spec/tags-annotations.md` § Annotation parameters.
 */

/** Precision at which an `until` value was written and can be reasoned about. */
export type UntilPrecision = "date" | "month" | "quarter";

/**
 * A machine-usable `until` value: it parsed as a date / year-month / quarter.
 * `sortKey` is the ISO date at the **lower bound** of the written period
 * (e.g. `2026-Q3` → `2026-07-01`), so values of mixed precision sort and
 * compare lexicographically. It is a normalized comparison key, NOT a claim
 * that the node is removed on that exact day.
 */
export interface MachineUntil {
  kind: "machine";
  precision: UntilPrecision;
  sortKey: string;
  /** The value exactly as written in the source. */
  raw: string;
}

/**
 * An opaque `until` value: it did not parse as a date / year-month / quarter
 * (e.g. `"sometime next year"`). Kept verbatim for display; no error is raised
 * (graceful degradation — ADR-20260615-04).
 */
export interface OpaqueUntil {
  kind: "opaque";
  /** The value exactly as written in the source. */
  raw: string;
}

export type InterpretedUntil = MachineUntil | OpaqueUntil;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const QUARTER_RE = /^(\d{4})-Q([1-4])$/;

/** First month (1-based) of each quarter. */
const QUARTER_START_MONTH: Record<string, number> = { "1": 1, "2": 4, "3": 7, "4": 10 };

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** True only if (year, month 1-12, day) is a real calendar date. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Reject overflow (e.g. 2026-02-30): the Date round-trips to a different day.
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Interpret an `until` value by precision. A value that parses as a date
 * (`YYYY-MM-DD`), year-month (`YYYY-MM`), or quarter (`YYYY-Qn`) is
 * machine-usable; anything else (including out-of-range months/days) is opaque.
 */
export function interpretUntil(value: string): InterpretedUntil {
  const raw = value;
  const trimmed = value.trim();

  const dateMatch = DATE_RE.exec(trimmed);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (isRealDate(year, month, day)) {
      return { kind: "machine", precision: "date", sortKey: `${y}-${m}-${d}`, raw };
    }
    return { kind: "opaque", raw };
  }

  const monthMatch = MONTH_RE.exec(trimmed);
  if (monthMatch) {
    const [, y, m] = monthMatch;
    const month = Number(m);
    if (month >= 1 && month <= 12) {
      return { kind: "machine", precision: "month", sortKey: `${y}-${m}-01`, raw };
    }
    return { kind: "opaque", raw };
  }

  const quarterMatch = QUARTER_RE.exec(trimmed);
  if (quarterMatch) {
    const [, y, q] = quarterMatch;
    const startMonth = QUARTER_START_MONTH[q];
    return { kind: "machine", precision: "quarter", sortKey: `${y}-${pad2(startMonth)}-01`, raw };
  }

  return { kind: "opaque", raw };
}

/**
 * Migration intent extracted from a node's `annotationParams`. `until` comes
 * from `@deprecated` or `@experimental` (whichever carries it; `deprecated`
 * wins if both do); `from` comes from `@migration_target`.
 */
export interface MigrationIntent {
  until?: InterpretedUntil;
  /** Which lifecycle annotation supplied `until`. */
  untilAnnotation?: "deprecated" | "experimental";
  /** Raw `from` reference (a node id) — kept verbatim, not resolved here. */
  from?: string;
}

/**
 * Read migration intent out of stored annotation params. Returns `undefined`
 * when no recognized param is present, so callers can guard cheaply. Mirrors
 * the recognized keys the parser stores (`until` on deprecated/experimental,
 * `from` on migration_target).
 */
export function getMigrationIntent(
  annotationParams: Record<string, Record<string, string>> | undefined,
): MigrationIntent | undefined {
  if (!annotationParams) return undefined;

  const intent: MigrationIntent = {};

  // `deprecated` takes precedence over `experimental` when both carry `until`.
  const deprecatedUntil = annotationParams.deprecated?.until;
  const experimentalUntil = annotationParams.experimental?.until;
  if (deprecatedUntil !== undefined) {
    intent.until = interpretUntil(deprecatedUntil);
    intent.untilAnnotation = "deprecated";
  } else if (experimentalUntil !== undefined) {
    intent.until = interpretUntil(experimentalUntil);
    intent.untilAnnotation = "experimental";
  }

  const from = annotationParams.migration_target?.from;
  if (from !== undefined) {
    intent.from = from;
  }

  if (intent.until === undefined && intent.from === undefined) return undefined;
  return intent;
}
