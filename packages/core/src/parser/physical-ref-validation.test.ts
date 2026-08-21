/**
 * Existence checking for the physical dot-notation references — a usecase's
 * `resource <Infra>.<Leaf>` and an entity's `table <Infra>.<Leaf>` (#2078).
 *
 * The regression these fence is #1991's reverse-engineering run: the merge
 * dropped the `database` block outright, leaving 35 tables' worth of dangling
 * references that compiled and rendered without a word. TPL-907 says every
 * cross-reference form carries resolver-side validation; these two forms were
 * the ones it had never been applied to.
 */
import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { ImportResolver } from "../fs/import-resolver.js";
import { InMemoryFileSystemProvider } from "../fs/in-memory-provider.js";
import type { Diagnostic } from "../types/ast.js";

const PHYSICAL_CODES = new Set(["unresolved-resource-ref", "unresolved-table-ref"]);

function physicalDiagnostics(krs: string): Diagnostic[] {
  return Parser.parse(krs).diagnostics.filter((d) => PHYSICAL_CODES.has(d.code));
}

describe("physical reference existence", () => {
  it("reports a resource whose infra block is not declared at all", () => {
    // The #1991 shape: the whole `database` block went missing in the merge.
    const diags = physicalDiagnostics(`
system Hato {
  service Api {
    domain Goals {
      usecase ListGoals { resource HatoDB.goals { operations read } }
    }
  }
}
`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("unresolved-resource-ref");
    expect(diags[0].severity).toBe("warning");
    expect(diags[0].params).toEqual({ infraId: "HatoDB", subId: "goals", missing: "block" });
  });

  it("distinguishes a declared block missing only the leaf", () => {
    const diags = physicalDiagnostics(`
system Hato {
  database HatoDB {
    table goals
  }
  service Api {
    domain Goals {
      usecase ListProposals { resource HatoDB.goal_proposals { operations read } }
    }
  }
}
`);
    expect(diags).toHaveLength(1);
    // The two halves need different repairs, so the code alone is not enough.
    expect(diags[0].params).toEqual({
      infraId: "HatoDB",
      subId: "goal_proposals",
      missing: "leaf",
    });
  });

  it("reports an entity table mapping that names an undeclared block", () => {
    const diags = physicalDiagnostics(`
system Hato {
  service Api {
    domain Goals {
      entity Goal { table HatoDB.goals }
    }
  }
}
`);
    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe("unresolved-table-ref");
    expect(diags[0].params).toEqual({
      entityId: "Goal",
      infraId: "HatoDB",
      subId: "goals",
      missing: "block",
    });
  });

  it("reports an entity table mapping that names an undeclared leaf", () => {
    const diags = physicalDiagnostics(`
system Hato {
  database HatoDB {
    table goals
  }
  service Api {
    domain Goals {
      entity DailyUsageRow { table HatoDB.daily_usage }
    }
  }
}
`);
    expect(diags).toHaveLength(1);
    expect(diags[0].params).toMatchObject({ entityId: "DailyUsageRow", missing: "leaf" });
  });

  it("stays silent on a fully wired model", () => {
    expect(
      physicalDiagnostics(`
system Hato {
  database HatoDB {
    table goals
  }
  storage Assets {
    bucket avatars
  }
  queue Jobs {
    queue reindex
  }
  service Api {
    domain Goals {
      usecase ListGoals { resource HatoDB.goals { operations read } }
      usecase StoreAvatar { resource Assets.avatars { operations create } }
      usecase Reindex { resource Jobs.reindex { operations create } }
      entity Goal { table HatoDB.goals }
    }
  }
}
`),
    ).toEqual([]);
  });

  it("says nothing about an entity that carries no table mapping", () => {
    // A tableless entity is a supported state (read-model projection, KV-backed
    // aggregate, forward design). `karasu coverage` counts it; this does not.
    expect(
      physicalDiagnostics(`
system Hato {
  database HatoDB {
    table goals
  }
  service Api {
    domain Goals {
      entity Goal
      entity ProjectionOnly {}
    }
  }
}
`),
    ).toEqual([]);
  });

  it("exempts [external] resources and entities", () => {
    expect(
      physicalDiagnostics(`
system Hato {
  service Api {
    domain Billing {
      usecase Charge { resource StripeAPI.charges [external] { operations create } }
      entity Invoice [external] { table StripeAPI.invoices }
    }
  }
}
`),
    ).toEqual([]);
  });

  it("does not decide a document that still has imports to resolve", () => {
    // Shared infra is canonically declared in an imported file (§S4.5), so a
    // per-file verdict would warn on the recommended layout.
    expect(
      physicalDiagnostics(`
import "./infra.krs"
system Hato {
  service Api {
    domain Goals {
      usecase ListGoals { resource HatoDB.goals { operations read } }
    }
  }
}
`),
    ).toEqual([]);
  });

  it("resolves across an import once the project is merged", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/infra.krs",
      `system Hato {
  database HatoDB {
    table goals
  }
}
`,
    );
    await fs.writeFile(
      "/p/index.krs",
      `import "./infra.krs"
system Hato {
  service Api {
    domain Goals {
      usecase ListGoals { resource HatoDB.goals { operations read } }
      entity Goal { table HatoDB.goals }
    }
  }
}
`,
    );
    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    expect(resolved.diagnostics.filter((d) => PHYSICAL_CODES.has(d.code))).toEqual([]);
  });

  it("reports a dangling ref on the merged model, not per file", async () => {
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/infra.krs",
      `system Hato {
  database HatoDB {
    table goals
  }
}
`,
    );
    await fs.writeFile(
      "/p/index.krs",
      `import "./infra.krs"
system Hato {
  service Api {
    domain Usage {
      usecase ReadUsage { resource HatoDB.daily_usage { operations read } }
    }
  }
}
`,
    );
    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    const diags = resolved.diagnostics.filter((d) => PHYSICAL_CODES.has(d.code));
    expect(diags).toHaveLength(1);
    expect(diags[0].params).toMatchObject({ subId: "daily_usage", missing: "leaf" });
  });

  it("treats a same-id infra reopen as the union of its leaves (§S4.5)", async () => {
    // Both files declare `database HatoDB`; each contributes one table. Neither
    // reference is dangling on the merged model.
    const fs = new InMemoryFileSystemProvider();
    await fs.writeFile(
      "/p/other.krs",
      `system Hato {
  database HatoDB {
    table goals
  }
}
`,
    );
    await fs.writeFile(
      "/p/index.krs",
      `import "./other.krs"
system Hato {
  database HatoDB {
    table usage
  }
  service Api {
    domain Goals {
      usecase ListGoals { resource HatoDB.goals { operations read } }
      usecase ReadUsage { resource HatoDB.usage { operations read } }
    }
  }
}
`,
    );
    const resolved = await new ImportResolver(fs).resolve("/p/index.krs");
    expect(resolved.diagnostics.filter((d) => PHYSICAL_CODES.has(d.code))).toEqual([]);
  });
});
