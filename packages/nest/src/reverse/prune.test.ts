/**
 * The cases here are the ones a real run produced, not invented ones.
 *
 * `entity Book { id: UUID, title: String }` was reproduced against the parser
 * and matches the signature a failed generation showed: many
 * `unexpected-token-in-block` errors on one line at scattered columns.
 */
import { compile } from "@karasu-tools/core";
import { describe, expect, it } from "vitest";
import { pruneUnparseableLines } from "./prune.js";

const errorsIn = (krs: string): number =>
  compile(krs, { diagramType: "system" }).diagnostics.filter((d) => d.severity === "error").length;

describe("pruneUnparseableLines", () => {
  it("removes schema fields a model wrote inside an entity", () => {
    const krs = `system Library {
  service Circulation {
    domain Lending {
      entity Book {
        label "Book"
        id: UUID, title: String, author: String
      }
    }
  }
}
`;
    expect(errorsIn(krs)).toBeGreaterThan(0);
    const result = pruneUnparseableLines(krs);
    expect(result.remainingErrors).toBe(0);
    expect(result.removed).toBe(1);
    // What the notation *can* express survives.
    expect(result.krs).toContain('label "Book"');
    expect(result.krs).toContain("entity Book");
  });

  it("removes bare attribute lines, the most natural DDD mistake", () => {
    const krs = `system Library {
  service Circulation {
    domain Lending {
      entity Loan {
        borrowerId String
        dueDate Date
      }
    }
  }
}
`;
    const result = pruneUnparseableLines(krs);
    expect(result.remainingErrors).toBe(0);
    expect(result.removed).toBe(2);
    expect(result.krs).toContain("entity Loan");
  });

  it("leaves a document that already parses exactly as it was", () => {
    const krs = `system Library {
  service Circulation {
    domain Lending {
      entity Loan {}
    }
  }
}
`;
    expect(pruneUnparseableLines(krs)).toEqual({ krs, removed: 0, remainingErrors: 0 });
  });

  it("never deletes a line carrying a brace", () => {
    // Removing nesting turns one bad property into every later block being
    // misparsed -- a far worse document that sometimes still parses.
    const krs = `system Library {
  service Circulation {
    domain Lending {
      entity Book { id: UUID }
    }
  }
}
`;
    const result = pruneUnparseableLines(krs);
    expect(result.krs).toContain("entity Book {");
  });

  it("stops rather than gutting a document that is wrong throughout", () => {
    // A prune that removes most of the file is not a repair, and shipping the
    // remainder would be a confident model of a fraction of the repository.
    const body = Array.from({ length: 40 }, (_, index) => `      field${index} Type`).join("\n");
    const krs = `system Library {
  service Circulation {
    domain Lending {
      entity Book {
${body}
      }
    }
  }
}
`;
    const result = pruneUnparseableLines(krs);
    expect(result.remainingErrors).toBeGreaterThan(0);
    expect(result.krs.split("\n").length).toBeGreaterThan(krs.split("\n").length * 0.7);
  });

  it("clears a stray markdown heading the model left outside the fence", () => {
    const krs = `# Architecture

system Library {
  service Circulation {
    domain Lending {}
  }
}
`;
    const result = pruneUnparseableLines(krs);
    expect(result.remainingErrors).toBe(0);
    expect(result.krs).toContain("system Library");
  });

  it("gives up rather than looping when deleting cannot help", () => {
    // The damage is on lines the guard refuses to touch, so there is no
    // progress to make and the loop has to notice.
    const krs = `system Library {
  service Circulation {
    domain Lending {
`;
    const result = pruneUnparseableLines(krs);
    expect(result.remainingErrors).toBeGreaterThan(0);
    expect(result.removed).toBe(0);
  });

  it("is the same every time, which is the point of doing it this way", () => {
    const krs = `system Library {
  service Circulation {
    domain Lending {
      entity Book {
        id: UUID, title: String
      }
    }
  }
}
`;
    const once = pruneUnparseableLines(krs);
    const twice = pruneUnparseableLines(krs);
    expect(once).toEqual(twice);
    // And running it on its own output changes nothing further.
    expect(pruneUnparseableLines(once.krs).removed).toBe(0);
  });
});
