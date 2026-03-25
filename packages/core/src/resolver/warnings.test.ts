import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

describe("invalid-owns warning", () => {
  it("warns when owns references a non-existent ID (no system block)", () => {
    const krs = `
organization Corp {
  team backend {
    owns NonExistentService
  }
}
`;
    const result = compile(krs);
    const w = result.warnings.find((warning) => warning.kind === "invalid-owns");
    expect(w).toBeDefined();
    expect(w?.message).toBe(
      'team "backend" owns "NonExistentService" but no service or domain with that id exists',
    );
  });

  it("does not warn when owns references a valid service ID", () => {
    const krs = `
system MySystem {
  service MyService "My Service" {}
}
organization Corp {
  team backend {
    owns MyService
  }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "invalid-owns")).toHaveLength(0);
  });

  it("warns for each invalid owns reference", () => {
    const krs = `
organization Corp {
  team backend {
    owns ServiceA
    owns ServiceB
  }
}
`;
    const result = compile(krs);
    const ownsWarnings = result.warnings.filter((w) => w.kind === "invalid-owns");
    expect(ownsWarnings).toHaveLength(2);
  });
});
