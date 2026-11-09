// The shapes of `REFERENCE_DATA` (`./reference-data.ts`), kept apart so the
// data module stays within its line budget. They describe the catalog, not
// the public `KarasuReference` type, which `./reference.ts` builds from it.

/** A user-facing string in every supported locale. */
export interface LocalizedString {
  en: string;
  ja: string;
}

interface NodeKindBase {
  kind: string;
  description: LocalizedString;
  canContain: string[];
  properties: string[];
}

/**
 * `layer` picks the spec-doc table a node kind belongs to: the `### Logical
 * structure` table (`logical`), or the `### Infra layer` table, as a top-level
 * infra block (`infra-block`) or a leaf inside one (`infra-leaf`).
 *
 * A discriminated union so every node kind lands in exactly one generated
 * spec table: an infra kind cannot omit its table columns, because
 * `scripts/reference/gen-docs.ts` would otherwise drop it from `syntax.md`
 * without a word (TPL-1296).
 */
type NodeKindData =
  | (NodeKindBase & { layer: "logical" })
  | (NodeKindBase & {
      layer: "infra-block" | "infra-leaf";
      /** "Layer" column of the `### Infra layer` table (e.g. "system-level infra block"). */
      infraLayerLabel: LocalizedString;
      /** "Intended use" column of the `### Infra layer` table. */
      infraIntendedUse: LocalizedString;
    });

interface DeployUnitKindData {
  kind: string;
  description: LocalizedString;
  properties: string[];
}

interface OrgKindData {
  kind: string;
  description: LocalizedString;
  canContain: string[];
  properties: string[];
}

interface TagData {
  name: string;
  appliesTo: string[];
  description: LocalizedString;
  /** "Effect on default rendering" column of the spec-doc Tags table. */
  defaultEffect: LocalizedString;
  /**
   * "Form factor" column of the `client` form-factor table — set only on the
   * seven recognized `client` form-factor tags.
   */
  formFactor?: LocalizedString;
}

/**
 * A badge color per theme. Both palettes live here so every surface that shows
 * a badge — the built-in stylesheet the diagram draws from, and the Reference
 * panel's swatch — resolves the same value for the active theme. A single
 * theme-free `color` used to be the canonical dark value, which is exactly what
 * the panel painted in both themes (#2482).
 *
 * `light` is a darker variant of the same hue: the dark value is chosen to
 * clear AA on the dark canvas and would sit at 2-3:1 on the light one
 * (ADR-1479, TPL-2366).
 */
export interface ThemedBadgeColor {
  dark: string;
  light: string;
}

interface AnnotationData {
  name: string;
  description: LocalizedString;
  /** How the annotation affects default rendering — the "Default rendering" column of the spec-doc table. */
  defaultRendering: LocalizedString;
  defaultBadge: { color: ThemedBadgeColor; icon: string; label: LocalizedString };
}

interface StylePropertyData {
  name: string;
  appliesTo: "node" | "edge" | "both";
  valueType: string;
  keywords?: string[];
  description: LocalizedString;
}

interface ShapeData {
  name: string;
  description: LocalizedString;
  /** Free-text "Typical use" column of the spec-doc shape table (distinct from `defaultFor`, which is a selector). */
  typicalUse: LocalizedString;
  defaultFor?: string;
}

/**
 * A top-level construct that groups or labels *existing* elements rather than
 * declaring one — `boundary` and `facet`. They are neither node kinds nor org
 * kinds, so they get their own catalog (#2316); the Reference panel renders it
 * as its own table. It is deliberately NOT generated into `docs/spec/syntax.md`:
 * `boundary` and `facet` each already own a long hand-written section there, and
 * a generated table beside that prose would make the spec check circular, the
 * failure mode TPL-2158 names. See the note in `reference-spec-sync.test.ts`.
 *
 * `experimental` is carried as data, not implied by membership in this list: a
 * construct promoted through the gate (ADR-1820) flips the flag and keeps its
 * row. Experimental notation is listed here **on purpose** — hiding it would
 * suppress the very real-usage evidence the gate needs (ADR-2316).
 */
interface GroupingConstructData {
  /** The declaration keyword (`boundary` / `facet`). */
  construct: string;
  description: LocalizedString;
  /** Properties the declaration block accepts. */
  properties: string[];
  /** How an element is written into the set — the answer to "and how do I join one?". */
  membership: LocalizedString;
  /** True while backward compatibility is not yet promised (ADR-1820). */
  experimental: boolean;
}

export interface ReferenceData {
  nodeKinds: NodeKindData[];
  deployUnitKinds: DeployUnitKindData[];
  orgKinds: OrgKindData[];
  groupingConstructs: GroupingConstructData[];
  tags: TagData[];
  annotations: AnnotationData[];
  styleProperties: StylePropertyData[];
  shapes: ShapeData[];
}
