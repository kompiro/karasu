import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

/**
 * Three-face cross-binding integration test.
 *
 * Per-face / per-relation tests already cover each face and each cross-face
 * relation in isolation (parser, extractor, renderer, warnings). What no
 * existing test asserts is that a *single* `.krs` artifact containing all
 * three faces — logical (`system`), physical (`deploy`), organization —
 * resolves both cross-face relations (`realizes` and `owns`) and produces
 * the expected rendering on every face. A future change to one face's
 * resolution that inadvertently breaks another face's cross-binding would
 * pass every per-face test and only fail here.
 *
 * Operationalizes TPL-20260510-22 checklist item 4 (the testable one).
 * See GC22-1 (Issue #1262).
 */

const THREE_FACE_FIXTURE = `
system ECPlatform {
  service ECommerce {
    label "EC"
    domain Order {}
  }
  service Inventory {
    label "Inv"
  }
}

deploy Production {
  oci "ec-app" { realizes = "ECommerce"; runtime = "node:20"; }
  oci "inv-app" { realizes = "Inventory"; runtime = "node:20"; }
}

organization EcOrg {
  team EcTeam "EC Team" {
    owns ECommerce
    owns Order
  }
  team InfraTeam "Infra Team" {
    owns Inventory
  }
}
`;

// Same fixture but with the `realizes` binding to ECommerce dropped — used
// to demonstrate that the deploy-side assertion is anchored to the binding.
const FIXTURE_MISSING_REALIZES = `
system ECPlatform {
  service ECommerce {
    label "EC"
    domain Order {}
  }
  service Inventory {
    label "Inv"
  }
}

deploy Production {
  oci "inv-app" { realizes = "Inventory"; runtime = "node:20"; }
}

organization EcOrg {
  team EcTeam "EC Team" {
    owns ECommerce
    owns Order
  }
  team InfraTeam "Infra Team" {
    owns Inventory
  }
}
`;

// Same fixture but with the `owns ECommerce` binding dropped — used to
// demonstrate that the org-side / system-side assertion is anchored to it.
const FIXTURE_MISSING_OWNS = `
system ECPlatform {
  service ECommerce {
    label "EC"
    domain Order {}
  }
  service Inventory {
    label "Inv"
  }
}

deploy Production {
  oci "ec-app" { realizes = "ECommerce"; runtime = "node:20"; }
  oci "inv-app" { realizes = "Inventory"; runtime = "node:20"; }
}

organization EcOrg {
  team EcTeam "EC Team" {
    owns Order
  }
  team InfraTeam "Infra Team" {
    owns Inventory
  }
}
`;

describe("three-face cross-binding integration (TPL-22 item 4 / GC22-1)", () => {
  it("resolves both cross-face relations and renders every face when all three faces are present in one artifact", () => {
    const systemResult = compile(THREE_FACE_FIXTURE, { diagramType: "system" });
    const deployResult = compile(THREE_FACE_FIXTURE, { diagramType: "deploy" });
    const orgResult = compile(THREE_FACE_FIXTURE, { diagramType: "org" });

    // ── Cross-face binding resolution (warning channel) ──────────────────
    // `realizes` and `owns` are the only two cross-face bindings; both
    // produce a typed warning when unresolved. Asserting their absence
    // across every diagramType ensures the warnings channel does not
    // silently swap faces (e.g. system compile dropping deploy warnings).
    for (const r of [systemResult, deployResult, orgResult]) {
      expect(r.warnings.filter((w) => w.kind === "unresolved-realizes")).toHaveLength(0);
      expect(r.warnings.filter((w) => w.kind === "invalid-owns")).toHaveLength(0);
    }

    // ── System view: team-attribution markers from `owns` ────────────────
    // Each owned service should carry its owning team's button + label on
    // the system-view render. This is the visual evidence that the
    // `owns` binding crossed the logical/org face boundary.
    expect(systemResult.svg).toContain('data-team-button="EcTeam"');
    expect(systemResult.svg).toContain("👥EcTeam");
    expect(systemResult.svg).toContain('data-team-button="InfraTeam"');
    expect(systemResult.svg).toContain("👥InfraTeam");

    // ── Deploy view: realizes-grouped containers ─────────────────────────
    // The deploy renderer groups units into `data-container-id="<service>"`
    // blocks keyed by the resolved `realizes` target. Both services must
    // appear as resolved containers (NOT in the Unclassified bucket).
    expect(deployResult.svg).toContain('data-container-id="ECommerce"');
    expect(deployResult.svg).toContain('data-container-id="Inventory"');
    expect(deployResult.svg).not.toContain("Unclassified");

    // ── Org view: owned services rendered under their owning team ────────
    expect(orgResult.svg).toContain('data-owned-service-button="ECommerce"');
    expect(orgResult.svg).toContain('data-owned-service-button="Order"');
    expect(orgResult.svg).toContain('data-owned-service-button="Inventory"');
  });

  // The two regression rehearsals below intentionally remove one cross-face
  // binding at a time and assert that a specific named marker disappears.
  // They are the "drop one realizes / drop one owns → a specific assertion
  // fails" rehearsal mandated by the Acceptance section of #1262.

  it("regression rehearsal: dropping one `realizes` makes the deploy-side container assertion fail", () => {
    const deployResult = compile(FIXTURE_MISSING_REALIZES, { diagramType: "deploy" });
    // ECommerce no longer has a realizing deploy unit → no container for it.
    expect(deployResult.svg).not.toContain('data-container-id="ECommerce"');
    // The surviving binding still renders, proving the assertion is anchored
    // to the specific cross-face binding and not the entire face.
    expect(deployResult.svg).toContain('data-container-id="Inventory"');
  });

  it("regression rehearsal: dropping one `owns` makes the org-view marker disappear", () => {
    const orgResult = compile(FIXTURE_MISSING_OWNS, { diagramType: "org" });
    expect(orgResult.svg).not.toContain('data-owned-service-button="ECommerce"');
    // The surviving owns bindings still render.
    expect(orgResult.svg).toContain('data-owned-service-button="Order"');
    expect(orgResult.svg).toContain('data-owned-service-button="Inventory"');

    // And the corresponding team-attribution marker for ECommerce
    // disappears from the system view too — confirming that `owns`
    // resolution feeds both the logical and the org face from the same
    // shared state (the point of TPL-22 item 4).
    const systemResult = compile(FIXTURE_MISSING_OWNS, { diagramType: "system" });
    // ec-team is still present (it owns Order), but ECommerce no longer
    // carries ec-team's attribution. We detect that by counting
    // `data-team-button="EcTeam"` occurrences: the all-bindings fixture
    // attributes ec-team to both ECommerce and Order (2 buttons), while
    // the missing-owns fixture attributes it to Order only (1 button).
    const allBindings = compile(THREE_FACE_FIXTURE, { diagramType: "system" });
    const countAll = (allBindings.svg.match(/data-team-button="EcTeam"/g) ?? []).length;
    const countMissing = (systemResult.svg.match(/data-team-button="EcTeam"/g) ?? []).length;
    expect(countMissing).toBeLessThan(countAll);
  });
});
