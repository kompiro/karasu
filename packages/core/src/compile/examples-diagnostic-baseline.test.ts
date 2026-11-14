// Every shipped example, compiled the way a user opens it, draws exactly the
// diagnostics and warnings recorded below, and no others (TPL-2577, TPL-2075).
//
// A change that widens what the language accepts promises that no existing model
// changes verdict. Asserting that one code stays quiet does not keep the
// promise: the change can fire a different code. So this compares the whole
// multiset of (file, code) against a baseline, whatever the code. A new example
// joins the scan the day it is added; one that draws nothing needs no entry.
//
// Each example is resolved through `compileProject`, so a file is read with
// what it imports: a cross-file `system` reopen merges as it does for a user,
// and the verdicts the resolver re-derives on the merged model are counted.
//
// The baseline is an exception table, not a snapshot: every entry says why
// that example is allowed to draw what it draws. A failure here means either
// an example now draws something new (fix the regression, or the example) or
// an example stopped drawing something (shrink its entry).

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import { Parser } from "../parser/parser.js";
import type { KrsEdge, KrsFile, KrsNode } from "../types/ast.js";
import { compileProject, type DiagramType } from "./compile.js";

const EXAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../examples");

// ─── Why each example may draw what it draws ──────────────────────────────

/** An `info` fact the sample shows on purpose; it reports a structure, not a defect. */
const INFO_FACT =
  "info-severity fact the sample shows (shared store, deploy node without realizes / runtime)";
/** A deploy file opened without the logical model its `realizes` points at. */
const DEPLOY_ALONE =
  "deploy file that does not import the logical model it realizes (deploy-only is #766's demo; 06-deploy keeps the two views in separate files)";
/** A tutorial step written before the step that resolves it. */
const TUTORIAL_STEP =
  "tutorial step: bare resources resolve to no store and services to no team until a later step declares entities and the organization";
/** A slice of a multi-file example, opened on its own instead of through its entry. */
const SLICE =
  "slice of a multi-file example opened on its own; its entry imports what the slice references";
/** The sample exists to show this diagnostic. */
const TEACHES = "the sample exists to show this diagnostic";

interface Allowed {
  why: string;
  draws: Record<string, number>;
}

const both = (path: string, allowed: Allowed): [string, Allowed][] => [
  [`en/${path}`, allowed],
  [`ja/${path}`, allowed],
];

const BASELINE: Record<string, Allowed> = Object.fromEntries([
  ...both("deploy-only/index.krs", {
    why: `${DEPLOY_ALONE}; ${INFO_FACT}`,
    draws: { "missing-realizes": 1, "unresolved-realizes": 2 },
  }),
  ...both("deploy-org/index.krs", { why: INFO_FACT, draws: { "missing-realizes": 1 } }),
  ...both("deploy/system.krs", { why: INFO_FACT, draws: { "missing-realizes": 1 } }),
  ...both("payment-platform/system.krs", { why: INFO_FACT, draws: { "missing-realizes": 2 } }),
  ...both("ec-platform/03-domains.krs", {
    why: TUTORIAL_STEP,
    draws: { "unassigned-resource": 12 },
  }),
  ...both("ec-platform/05-multifile/system.krs", {
    why: TUTORIAL_STEP,
    draws: { "unassigned-resource": 5 },
  }),
  ...both("ec-platform/05-multifile/ecommerce.krs", {
    why: `${SLICE}; ${TUTORIAL_STEP}`,
    draws: { "unassigned-resource": 2, "unassigned-service": 1 },
  }),
  ...both("ec-platform/05-multifile/payment.krs", {
    why: `${SLICE}; ${TUTORIAL_STEP}`,
    draws: { "unassigned-resource": 3, "unassigned-service": 1 },
  }),
  ...both("ec-platform/06-deploy/deploy.krs", {
    why: `${DEPLOY_ALONE}; ${INFO_FACT}`,
    draws: { "missing-realizes": 1, "unresolved-realizes": 5 },
  }),
  ...both("ec-platform/06-deploy/ecommerce.krs", {
    why: `${SLICE}; ${TUTORIAL_STEP}`,
    draws: { "unassigned-service": 1 },
  }),
  ...both("ec-platform/06-deploy/payment.krs", {
    why: `${SLICE}; ${TUTORIAL_STEP}`,
    draws: { "unassigned-service": 1 },
  }),
  ...both("ec-platform/07-cross-system/ec-platform.krs", {
    why: SLICE,
    draws: { "cross-system-ref-unresolved": 1 },
  }),
  ...both("ec-platform/07-cross-system/main.krs", {
    why: `${TEACHES}: a cross-system edge into a system not tagged [external]`,
    draws: { "cross-system-ref-implicit-external": 1 },
  }),
  ...both("migration/system.krs", {
    why: `${TEACHES}: a domain owned by two services mid-migration`,
    draws: { "domain-dispersal": 2 },
  }),
  ...both("multi-file-system/editor.krs", { why: SLICE, draws: { "unresolved-edge-endpoint": 1 } }),
  ...both("multi-file-system/index.krs", {
    why: `${TEACHES}: S3, the entry's label wins over each slice's; ${INFO_FACT}`,
    draws: { "shared-infra-fan-in": 1, "system-property-conflict": 2 },
  }),
  ...["service-split", "payroll-split"].flatMap((sample) =>
    ["index.krs", "migrating.krs", "planned.krs"].flatMap((file) =>
      both(`${sample}/${file}`, { why: INFO_FACT, draws: { "shared-infra-fan-in": 1 } }),
    ),
  ),
  [
    "en/feature-samples/boundary-multi-membership.krs",
    {
      why: `${TEACHES}: a node in two boundaries`,
      draws: { "duplicate-boundary-assignment": 1 },
    },
  ],
  [
    "en/feature-samples/parallel-edges.krs",
    { why: `${TEACHES}: parallel edges (ADR-1185)`, draws: { "ambiguous-edge-base": 2 } },
  ],
  ["en/feature-samples/crud-matrix.krs", { why: INFO_FACT, draws: { "shared-infra-fan-in": 1 } }],
  [
    "en/feature-samples/domain-drill.krs",
    { why: TUTORIAL_STEP, draws: { "unassigned-resource": 2 } },
  ],
  [
    "en/feature-samples/external-nodes.krs",
    { why: TUTORIAL_STEP, draws: { "unassigned-resource": 1 } },
  ],
  ["en/feature-samples/legend.krs", { why: INFO_FACT, draws: { "missing-runtime": 2 } }],
]);

// ─── Corpus ───────────────────────────────────────────────────────────────

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const VIEWS: Record<DiagramType, true> = { system: true, deploy: true, org: true };

/** Every diagnostic and warning an entry draws across the views, deduplicated, counted by code. */
async function draws(
  entry: string,
  fs: InMemoryFileSystemProvider,
): Promise<Record<string, number>> {
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  const count = (code: string, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    counts[code] = (counts[code] ?? 0) + 1;
  };
  for (const view of Object.keys(VIEWS) as DiagramType[]) {
    const result = await compileProject(`/${entry}`, fs, { diagramType: view });
    for (const d of result.diagnostics)
      count(d.code, JSON.stringify(["d", d.code, d.params, d.loc]));
    for (const w of result.warnings) count(w.kind, JSON.stringify(["w", w]));
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function containers(file: KrsFile): KrsNode[] {
  return [
    ...file.systems,
    ...file.services,
    ...file.clients,
    ...file.domains,
    ...file.databases,
    ...file.queues,
    ...file.storages,
  ];
}

function edgesOf(nodes: KrsNode[]): KrsEdge[] {
  return nodes.flatMap((n) => [...(n.edges ?? []), ...edgesOf(n.children)]);
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("examples: every shipped .krs draws only its recorded diagnostics (TPL-2577, TPL-2075)", () => {
  const files = walk(EXAMPLES, []).sort();
  const entries = files.filter((f) => f.endsWith(".krs")).map((f) => relative(EXAMPLES, f));
  const parsed = new Map<string, KrsFile>();
  const fs = new InMemoryFileSystemProvider();

  beforeAll(async () => {
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      await fs.writeFile(`/${relative(EXAMPLES, file)}`, content);
      if (file.endsWith(".krs")) parsed.set(relative(EXAMPLES, file), Parser.parse(content).value);
    }
  });

  // The guard is only as wide as the forms the corpus holds. These are the
  // forms the two TPLs are about; if the corpus loses one, the scan above
  // still passes but no longer measures it, so the test says so.
  it("holds both endpoint spellings, an edge across a container, and a cross-file reopen", () => {
    const edges = [...parsed.values()].flatMap((file) => edgesOf(containers(file)));
    // TPL-2577: a bare endpoint and a qualified (dotted) one.
    expect(edges.some((e) => e.toPath === undefined && !e.to.includes("."))).toBe(true);
    expect(edges.some((e) => (e.toPath?.length ?? 0) >= 2)).toBe(true);

    // TPL-2075: an edge that names a node outside the block it is written in.
    // A qualified target always does; so does a bare endpoint that is not a
    // child of the declaring block.
    const crossing = [...parsed.values()].some((file) => {
      const visit = (node: KrsNode): boolean =>
        (node.edges ?? []).some(
          (e) =>
            (e.toPath?.length ?? 0) >= 2 ||
            ![e.from, e.to].every((id) => node.children.some((c) => c.id === id)),
        ) || node.children.some(visit);
      return containers(file).some(visit);
    });
    expect(crossing).toBe(true);

    // TPL-2075: the same `system` id declared in an entry and in a file it
    // imports whole, so the scan runs over a reopen merged across files.
    const reopen = [...parsed.entries()].some(([name, file]) =>
      file.nodeImports
        .filter((i) => i.ids.length === 0 && i.path.endsWith(".krs"))
        .some((i) => {
          const imported = parsed.get(relative(EXAMPLES, resolve(EXAMPLES, dirname(name), i.path)));
          return file.systems.some((s) => imported?.systems.some((t) => t.id === s.id));
        }),
    );
    expect(reopen).toBe(true);
  });

  it("scans a non-trivial number of examples", () => {
    expect(entries.length).toBeGreaterThan(50);
  });

  it("every baseline entry names an example that exists", () => {
    expect(Object.keys(BASELINE).filter((name) => !entries.includes(name))).toEqual([]);
  });

  it.each(entries)("%s", async (entry) => {
    expect(await draws(entry, fs)).toEqual(BASELINE[entry]?.draws ?? {});
  });
});
