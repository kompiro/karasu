import { describe, it, expect } from "vitest";
import { compile, compileSystemDiff, InMemoryFileSystemProvider } from "../index.js";
import type { SystemCompileResult } from "../index.js";
import { OWNABLE_LOGICAL_KINDS } from "../types/ast.js";
import { Parser } from "../parser/parser.js";
import { extractView } from "../view/view-extract.js";
import { layout } from "./layout.js";
import { buildTeamLabelIndex } from "./group-labels.js";

/**
 * Issue #2157: the card affordances that surface a *resolved* relation used to
 * gate on an inline `service | domain` check, so a `client` silently lost its
 * owner chip and its deploy button even though `owns` / `realizes` resolved.
 * These tests enumerate the kinds behaviorally, so adding a kind to the spec
 * without lighting up every surface fails here rather than in a bug report.
 */

const system = (body: string): string => `system S {\n${body}\n}`;

/** One minimal model per ownable kind, each declaring a node with id `X`. */
const OWNED_NODE_BY_KIND: Record<string, string> = {
  service: system(`  service X { label "X" }`),
  // Declared directly under the system so the root view draws its card (a
  // domain nested in a service only appears in that service's drill-down).
  domain: system(`  domain X { label "X" }`),
  client: system(`  client X [web] { label "X" }`),
};

function compileSystem(krs: string): SystemCompileResult {
  const result = compile(krs);
  if (result.diagramType !== "system") throw new Error("expected a system compile result");
  return result;
}

describe("owner chip covers every ownable kind (#2157)", () => {
  it("has a model for exactly the kinds in OWNABLE_LOGICAL_KINDS", () => {
    // Drift guard: a kind added to the constant must gain a case below, so the
    // per-kind assertions can never silently stop covering the declared set.
    expect(Object.keys(OWNED_NODE_BY_KIND).sort()).toEqual([...OWNABLE_LOGICAL_KINDS].sort());
  });

  it.each([...OWNABLE_LOGICAL_KINDS])("renders the owner chip on an owned %s", (kind) => {
    const result = compileSystem(
      `${OWNED_NODE_BY_KIND[kind]}\norganization O { team T { label "Team T" owns X } }`,
    );

    expect(result.warnings.filter((w) => w.kind === "invalid-owns")).toHaveLength(0);
    // Button identity is the team id; the chip text is the declared label.
    expect(result.svg).toContain('data-team-button="T"');
    expect(result.svg).toContain("👥Team T");
    expect(result.nodeMetadata.get("X")?.team).toBe("T");
    expect(result.nodeMetadata.get("X")?.teamLabel).toBe("Team T");
  });

  it("draws no chip for a kind outside the ownable set", () => {
    const result = compileSystem(
      `${system(`  user U { label "U" }\n  service X { label "X" }`)}\norganization O { team T { owns X } }`,
    );
    // The service's own chip is present; the user card has no team markers.
    const userCard = result.svg.slice(result.svg.indexOf('data-node-id="U"'));
    expect(userCard.slice(0, userCard.indexOf("</g>"))).not.toContain("data-team-button");
    expect(result.nodeMetadata.get("U")?.team).toBeUndefined();
  });
});

describe("deploy affordance covers every deploy-affordance kind (#2157)", () => {
  const DEPLOYED_NODE_BY_KIND: Record<string, string> = {
    service: system(`  service X { label "X" }`),
    domain: system(`  domain X { label "X" }`),
    client: system(`  client X [web] { label "X" }`),
  };

  it.each(Object.keys(DEPLOYED_NODE_BY_KIND))(
    "renders the deploy button on a realized %s",
    (kind) => {
      const result = compileSystem(
        `${DEPLOYED_NODE_BY_KIND[kind]}\ndeploy "prod" {\n  assets Bundle { realizes X }\n}`,
      );

      expect(result.warnings.filter((w) => w.kind === "unresolved-realizes")).toHaveLength(0);
      expect(result.svg).toContain('data-deploy-button="X"');
      expect(result.nodeMetadata.get("X")?.hasDeployContainer).toBe(true);
    },
  );

  it("leaves an infra block without a deploy button even when a unit realizes it", () => {
    // Deliberate exclusion, not an oversight: infra blocks are valid `realizes`
    // targets (ADR-1632) but render as cylinders / clouds, whose corners the
    // rectangular button geometry does not fit. Widening
    // `DEPLOY_AFFORDANCE_KIND_SET` needs shape-aware placement first.
    const result = compileSystem(
      `${system(`  service Api { label "Api" }`)}
database SharedDb { label "Db" }
deploy "prod" {
  store DbUnit { realizes SharedDb }
  oci ApiBox { realizes Api }
}`,
    );

    expect(result.warnings.filter((w) => w.kind === "unresolved-realizes")).toHaveLength(0);
    expect(result.svg).toContain('data-deploy-button="Api"');
    expect(result.svg).not.toContain('data-deploy-button="SharedDb"');
    expect(result.nodeMetadata.get("SharedDb")?.hasDeployContainer).toBeUndefined();
  });
});

describe("owner chip text (#2157)", () => {
  it("falls back to the team id when the team declares no label", () => {
    const result = compileSystem(
      `${system(`  client X [web] { label "X" }`)}\norganization O { team PlatformTeam { owns X } }`,
    );
    expect(result.svg).toContain('data-team-button="PlatformTeam"');
    expect(result.svg).toContain("👥PlatformTeam");
    expect(result.nodeMetadata.get("X")?.teamLabel).toBeUndefined();
  });

  it("elides a long label but keeps the full id on the button", () => {
    const result = compileSystem(
      `${system(`  client X [web] { label "X" }`)}\norganization O { team T { label "Customer Experience Platform" owns X } }`,
    );
    expect(result.svg).toContain('data-team-button="T"');
    // 15 graphemes, then the ellipsis — the same budget `measureNode` reserves.
    expect(result.svg).toContain("👥Customer Experi…");
  });
});

/** Compiles a before/after pair into the compare (diff) system view. */
async function diffSvg(before: string, after: string): Promise<string> {
  const fs = new InMemoryFileSystemProvider();
  await fs.writeFile("/before.krs", before);
  await fs.writeFile("/after.krs", after);
  const result = await compileSystemDiff({
    beforeEntryPath: "/before.krs",
    afterEntryPath: "/after.krs",
    fs,
  });
  return result.svg;
}

describe("owner chip label in the diff view (#2157)", () => {
  const CLIENT = system(`  client X [web] { label "X" }`);

  it("falls back to the id when a surviving team's label is deleted", async () => {
    // The #1886 stale-state guard applied to the owner-chip label space: the
    // team still exists and still owns X, so a deleted label must fall back to
    // the id rather than resurrect the before-side label.
    const svg = await diffSvg(
      `${CLIENT}\norganization O { team T { label "Old Name" owns X } }`,
      `${CLIENT}\norganization O { team T { owns X } }`,
    );
    expect(svg).not.toContain("Old Name");
    expect(svg).toContain("👥T");
  });

  it("keeps the before label for a team the after model no longer declares", async () => {
    // The node is `removed` along with its team, so its chip should still name
    // the former owner instead of degrading to the bare id.
    const svg = await diffSvg(
      `${CLIENT}\norganization O { team T { label "Old Name" owns X } }`,
      system(`  service Other { label "Other" }`),
    );
    expect(svg).toContain("👥Old Name");
  });
});

/** Lays out the root system view of `krs`, with team labels wired as in compile. */
function layoutRoot(krs: string): ReturnType<typeof layout> {
  const parsed = Parser.parse(krs);
  return layout(extractView(parsed.value.systems, []), {
    ownerIndex: parsed.value.ownerIndex,
    teamLabels: buildTeamLabelIndex(parsed.value),
  });
}

describe("owner chip is measured, not just drawn (#2157)", () => {
  const CLIENT = system(`  client X [web] { label "X" }`);

  it("reserves a meta row on the owned client's card", () => {
    const unowned = layoutRoot(CLIENT).nodes.get("X")!;
    const owned = layoutRoot(`${CLIENT}\norganization O { team T { owns X } }`).nodes.get("X")!;
    expect(owned.height).toBeGreaterThan(unowned.height);
  });

  it("widens the card for a long team label the chip will draw", () => {
    const shortLabel = layoutRoot(
      `${CLIENT}\norganization O { team T { label "T" owns X } }`,
    ).nodes.get("X")!;
    const longLabel = layoutRoot(
      `${CLIENT}\norganization O { team T { label "Customer Experience" owns X } }`,
    ).nodes.get("X")!;
    expect(longLabel.width).toBeGreaterThan(shortLabel.width);
  });
});
