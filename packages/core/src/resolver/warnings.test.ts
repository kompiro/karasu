import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

describe("deprecated-team-property warning", () => {
  it("warns when service has explicit team property covered by owns", () => {
    const krs = `
system MySystem {
  service MyService {
    team "backend"
  }
}
organization Corp {
  team backend {
    owns MyService
  }
}
`;
    const result = compile(krs);
    const w = result.warnings.find((w) => w.kind === "deprecated-team-property");
    expect(w).toBeDefined();
    expect(w?.message).toContain("MyService");
    expect(w?.message).toContain("owns");
  });

  it("does not warn when service has team property but no owns coverage", () => {
    const krs = `
system MySystem {
  service MyService {
    team "backend"
  }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "deprecated-team-property")).toHaveLength(0);
  });

  it("does not warn when service has no team property but owns coverage exists", () => {
    const krs = `
system MySystem {
  service MyService {}
}
organization Corp {
  team backend {
    owns MyService
  }
}
`;
    const result = compile(krs);
    expect(result.warnings.filter((w) => w.kind === "deprecated-team-property")).toHaveLength(0);
  });
});

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
