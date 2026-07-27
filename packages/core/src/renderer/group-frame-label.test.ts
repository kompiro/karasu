import { describe, it, expect } from "vitest";
import { compile, compileSystemDiff, InMemoryFileSystemProvider } from "../index.js";
import { buildDrillDownSvg } from "./drill-down-svg.js";
import { Parser } from "../parser/parser.js";

// Group frames are titled with the group's declared `label`, falling back to
// the group id when none is given (#2133). The container id stays
// `__group_<id>__` on every axis, so collapse keying and permalinks are
// unaffected. Asserted through the surfaces a user reaches (compile() /
// buildDrillDownSvg / compileSystemDiff), not the layout unit alone.

/** The group frame `<g>` for `groupId`, or throws when absent. */
function frameOf(svg: string, groupId: string): string {
  const m = new RegExp(`<g data-container-id="__group_${groupId}__"[^]*?</g>`).exec(svg);
  if (!m) throw new Error(`no frame for ${groupId}`);
  return m[0];
}

function systemSvg(src: string, groupBy: "team" | "boundary"): string {
  const result = compile(src, { diagramType: "system", groupBy });
  if (result.diagramType !== "system") throw new Error("expected system view");
  return result.svg;
}

describe("group frame titles show the declared label (#2133)", () => {
  it("titles a boundary frame with the boundary's label", () => {
    const svg = systemSvg(
      `
system Shop {
  service Billing {}
  service Wallet {}
  Billing -> Wallet
}
boundary payments {
  label "Payments cluster"
  contains Billing
  contains Wallet
}
`,
      "boundary",
    );
    const frame = frameOf(svg, "payments");
    expect(frame).toContain(">Payments cluster</text>");
    expect(frame).not.toContain(">payments</text>");
  });

  it("falls back to the group id for a label-less boundary", () => {
    const svg = systemSvg(
      `
system Shop {
  service Billing {}
  service Wallet {}
  Billing -> Wallet
}
boundary payments {
  contains Billing
  contains Wallet
}
`,
      "boundary",
    );
    expect(frameOf(svg, "payments")).toContain(">payments</text>");
  });

  it("titles a team frame with the team's label", () => {
    const svg = systemSvg(
      `
system Shop {
  service Billing {}
  service Wallet {}
  Billing -> Wallet
}
organization Org {
  team payments {
    label "Payments Team"
    owns Billing
    owns Wallet
  }
}
`,
      "team",
    );
    const frame = frameOf(svg, "payments");
    expect(frame).toContain(">Payments Team</text>");
    expect(frame).not.toContain(">payments</text>");
  });

  it("titles a nested team's frame from its own label", () => {
    const svg = systemSvg(
      `
system Shop {
  service Billing {}
  service Wallet {}
  Billing -> Wallet
}
organization Org {
  team platform {
    label "Platform"
    team payments {
      label "Payments Team"
      owns Billing
      owns Wallet
    }
  }
}
`,
      "team",
    );
    expect(frameOf(svg, "payments")).toContain(">Payments Team</text>");
  });

  it("titles per-system frames of the multi-system root with the label", () => {
    const svg = systemSvg(
      `
system Shop {
  service Billing {}
}
system Warehouse {
  service Stock {}
}
organization Org {
  team ops {
    label "Operations"
    owns Billing
    owns Stock
  }
}
`,
      "team",
    );
    // One frame per system, both titled with the declared label (#1884 keying).
    const frames = svg.match(/<g data-container-id="__group_ops__"[^]*?<\/g>/g) ?? [];
    expect(frames).toHaveLength(2);
    for (const frame of frames) expect(frame).toContain(">Operations</text>");
  });

  it("titles a scoped boundary's drill-level frame with its label", () => {
    const parsed = Parser.parse(`
system Shop {
  service Checkout {
    boundary core {
      label "Core domains"
      contains Cart
      contains Order
    }
    domain Cart {}
    domain Order {}
  }
}
`);
    const { svg } = buildDrillDownSvg(
      parsed.value,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "boundary",
    );
    expect(frameOf(svg, "core")).toContain(">Core domains</text>");
  });

  it("keeps the collapse container id unchanged (label changes the title only)", () => {
    const svg = systemSvg(
      `
system Shop {
  service Billing {}
  service Wallet {}
  Billing -> Wallet
}
boundary payments {
  label "Payments cluster"
  contains Billing
  contains Wallet
}
`,
      "boundary",
    );
    expect(svg).toContain('data-container-id="__group_payments__"');
    expect(svg).not.toContain("__group_Payments cluster__");
  });

  it("backfills a removed-only group's label from the before model in diff view", async () => {
    const before = `
system Shop {
  service Billing {}
  service Wallet {}
  Billing -> Wallet
}
boundary legacy {
  label "Legacy cluster"
  contains Billing
}
boundary core {
  label "Core"
  contains Wallet
}
`;
    // `legacy` and its only member are gone on the after side; the diff view
    // still frames the removed node, and the frame keeps the before label.
    const after = `
system Shop {
  service Wallet {}
}
boundary core {
  label "Core"
  contains Wallet
}
`;
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile("/p/before.krs", before);
    await fs.writeFile("/p/after.krs", after);
    const result = await compileSystemDiff({
      beforeEntryPath: "/p/before.krs",
      afterEntryPath: "/p/after.krs",
      fs,
      groupBy: "boundary",
    });
    expect(frameOf(result.svg, "legacy")).toContain(">Legacy cluster</text>");
  });
});
