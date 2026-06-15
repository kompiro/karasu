import { BUILTIN_STYLE_SOURCE } from "./default-style.js";
import { REFERENCE_DATA } from "./reference-data.js";
import {
  GETTING_STARTED_PROJECT,
  GETTING_STARTED_PROJECT_EN,
  DEPLOY_ONLY_PROJECT,
  ORG_ONLY_PROJECT,
  type ExampleProject,
} from "./examples.js";

export interface NodeKindInfo {
  kind: string;
  description: string;
  canContain: string[];
  properties: string[];
}

export interface TagInfo {
  name: string;
  appliesTo: string[];
  description: string;
}

export interface AnnotationInfo {
  name: string;
  description: string;
  defaultBadge: { color: string; icon: string; label: string };
}

export interface StylePropertyInfo {
  name: string;
  appliesTo: "node" | "edge" | "both";
  valueType: string;
  keywords?: string[];
  description: string;
}

export interface ShapeInfo {
  name: string;
  description: string;
  defaultFor?: string;
}

export interface DeployUnitKindInfo {
  kind: string;
  description: string;
  properties: string[];
}

export interface OrgKindInfo {
  kind: string;
  description: string;
  canContain: string[];
  properties: string[];
}

/** A diagram family the per-view reference content is keyed on. */
export type ReferenceView = "system" | "deploy" | "org";

/**
 * One section of the Syntax tab: a literal `.krs` snippet (`code`), or a marker
 * (`kindTable`) that the per-view kind table is rendered in its place.
 */
export interface SyntaxSection {
  heading: string;
  code?: string;
  kindTable?: true;
}

/** One row of the Styles tab's selector-specificity reference. */
export interface SelectorSpecificityRow {
  /** Localized label for the selector form (e.g. "Kind + tag"). */
  selector: string;
  /** A concrete example selector (e.g. `service[external]`). */
  example: string;
  /** Specificity score per `computeSpecificity`. */
  score: number;
}

export interface KarasuReference {
  nodeKinds: NodeKindInfo[];
  deployUnitKinds: DeployUnitKindInfo[];
  orgKinds: OrgKindInfo[];
  tags: TagInfo[];
  annotations: AnnotationInfo[];
  styleProperties: StylePropertyInfo[];
  shapes: ShapeInfo[];
  /** Per-view Syntax-tab snippets (locale-independent; the panel is English). */
  syntaxSnippets: Record<ReferenceView, SyntaxSection[]>;
  /** Per-view `.krs.style` selector examples for the Styles tab. */
  styleSelectorExamples: Record<ReferenceView, string>;
  /** Selector-specificity rows for the Styles tab (`selector` follows `locale`). */
  selectorSpecificity: SelectorSpecificityRow[];
  builtinStyleSource: string;
  /** The canonical all-views Getting Started sample (also seeds Memory mode). */
  sampleKrs: string;
  /**
   * Per-view starter samples for the reference's Samples tab: `system` is the
   * all-views Getting Started, `deploy` / `org` are the minimal single-block
   * examples. Sourced from `examples/` so they can't drift (#1548).
   */
  samplesByView: SamplesByView;
}

export interface SamplesByView {
  system: string;
  deploy: string;
  org: string;
}

/**
 * Locale accepted by `getReference`. Kept as a local alias so the core
 * package has no cross-package dependency on the app-layer `Locale` type.
 */
export type ReferenceLocale = "en" | "ja";

// The Reference panel's "Samples" tab shows the canonical Getting Started
// example. Sourcing it from examples.ts (same content as
// examples/getting-started/index.krs, governed by .claude/rules/examples-sync.md)
// keeps it from drifting — see docs/adr/20260512-03-reference-data-single-source.md, Issue #1335.
function indexKrs(project: ExampleProject): string {
  const file = project.files.find((f) => f.path === "index.krs");
  if (!file) throw new Error(`example project "${project.name}" has no index.krs`);
  return file.content;
}

const _cache = new Map<ReferenceLocale, KarasuReference>();

export function getReference(locale: ReferenceLocale = "en"): KarasuReference {
  const cached = _cache.get(locale);
  if (cached) return cached;

  const data = REFERENCE_DATA;
  const ref: KarasuReference = {
    nodeKinds: data.nodeKinds.map((k) => ({
      kind: k.kind,
      description: k.description[locale],
      canContain: k.canContain,
      properties: k.properties,
    })),
    deployUnitKinds: data.deployUnitKinds.map((k) => ({
      kind: k.kind,
      description: k.description[locale],
      properties: k.properties,
    })),
    orgKinds: data.orgKinds.map((k) => ({
      kind: k.kind,
      description: k.description[locale],
      canContain: k.canContain,
      properties: k.properties,
    })),
    tags: data.tags.map((t) => ({
      name: t.name,
      appliesTo: t.appliesTo,
      description: t.description[locale],
    })),
    annotations: data.annotations.map((a) => ({
      name: a.name,
      description: a.description[locale],
      defaultBadge: {
        color: a.defaultBadge.color,
        icon: a.defaultBadge.icon,
        label: a.defaultBadge.label[locale],
      },
    })),
    styleProperties: data.styleProperties.map((p) => ({
      name: p.name,
      appliesTo: p.appliesTo,
      valueType: p.valueType,
      ...(p.keywords ? { keywords: p.keywords } : {}),
      description: p.description[locale],
    })),
    shapes: data.shapes.map((sh) => ({
      name: sh.name,
      description: sh.description[locale],
      ...(sh.defaultFor !== undefined ? { defaultFor: sh.defaultFor } : {}),
    })),
    // Snippets are locale-independent literals — passed through unchanged.
    syntaxSnippets: data.syntaxSnippets,
    styleSelectorExamples: data.styleSelectorExamples,
    selectorSpecificity: data.selectorSpecificity.map((s) => ({
      selector: s.selector[locale],
      example: s.example,
      score: s.score,
    })),
    builtinStyleSource: BUILTIN_STYLE_SOURCE,
    sampleKrs: indexKrs(locale === "ja" ? GETTING_STARTED_PROJECT : GETTING_STARTED_PROJECT_EN),
    samplesByView: {
      system: indexKrs(locale === "ja" ? GETTING_STARTED_PROJECT : GETTING_STARTED_PROJECT_EN),
      deploy: indexKrs(DEPLOY_ONLY_PROJECT),
      org: indexKrs(ORG_ONLY_PROJECT),
    },
  };

  _cache.set(locale, ref);
  return ref;
}
