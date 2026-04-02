import { describe, it, expect } from "vitest";
import { Parser } from "@karasu/core";
import {
  collectNodes,
  findNodeAtPosition,
  findRangeOfNode,
  collectAllIdentifiers,
  getNodeDescription,
  getWordAtPosition,
} from "./position-resolver.js";
import { buildDocumentSymbols } from "./document-symbols.js";

const KRS_SOURCE = `\
system MySystem {
  service AuthService {
    usecase Login {}
  }
  domain Core {}
}
`;

function parse(src: string) {
  return Parser.parse(src).value;
}

describe("collectNodes", () => {
  it("collects top-level system node", () => {
    const file = parse(KRS_SOURCE);
    const nodes = collectNodes(file);
    expect(nodes.some((n) => n.id === "MySystem")).toBe(true);
  });

  it("collects nested service node", () => {
    const file = parse(KRS_SOURCE);
    const nodes = collectNodes(file);
    expect(nodes.some((n) => n.id === "AuthService")).toBe(true);
  });

  it("collects deeply nested usecase node", () => {
    const file = parse(KRS_SOURCE);
    const nodes = collectNodes(file);
    expect(nodes.some((n) => n.id === "Login")).toBe(true);
  });

  it("collects top-level standalone service", () => {
    const file = parse(KRS_STANDALONE_SERVICE);
    const nodes = collectNodes(file);
    expect(nodes.some((n) => n.id === "StandaloneAuth")).toBe(true);
  });
});

describe("findNodeAtPosition", () => {
  it("returns null when position is outside all nodes", () => {
    const file = parse(KRS_SOURCE);
    // Line 0, character 0 is before the first token in some parsers — but let's
    // use an obviously out-of-range line
    const result = findNodeAtPosition(file, { line: 99, character: 0 });
    expect(result).toBeNull();
  });

  it("returns innermost node when cursor is inside a nested node", () => {
    // Line 2 (0-based) = "  service AuthService {" in KRS_SOURCE
    // The service block starts at line 2 (0-based), so cursor at line 2, char 10
    const file = parse(KRS_SOURCE);
    // "  service AuthService {" is line index 1 (0-based)
    const result = findNodeAtPosition(file, { line: 1, character: 10 });
    expect(result).toBe("AuthService");
  });

  it("returns outer node when cursor is in outer scope", () => {
    const file = parse(KRS_SOURCE);
    // "system MySystem {" is line index 0 (0-based), char 7 = 'M'
    const result = findNodeAtPosition(file, { line: 0, character: 7 });
    expect(result).toBe("MySystem");
  });

  it("returns innermost node for deeply nested usecase", () => {
    const file = parse(KRS_SOURCE);
    // "    usecase Login {}" is line index 2 (0-based)
    const result = findNodeAtPosition(file, { line: 2, character: 12 });
    expect(result).toBe("Login");
  });
});

describe("findRangeOfNode", () => {
  it("returns null for unknown node ID", () => {
    const file = parse(KRS_SOURCE);
    expect(findRangeOfNode(file, "NonExistent")).toBeNull();
  });

  it("returns range for a known node ID", () => {
    const file = parse(KRS_SOURCE);
    const range = findRangeOfNode(file, "MySystem");
    expect(range).not.toBeNull();
    expect(range!.start.line).toBeGreaterThanOrEqual(0);
    expect(range!.end.line).toBeGreaterThanOrEqual(range!.start.line);
  });

  it("range start is 0-based", () => {
    const file = parse(KRS_SOURCE);
    const range = findRangeOfNode(file, "MySystem");
    // "system MySystem {" is line 0 (0-based) in KRS_SOURCE
    expect(range!.start.line).toBe(0);
  });

  it("nested node range is within parent range", () => {
    const file = parse(KRS_SOURCE);
    const systemRange = findRangeOfNode(file, "MySystem")!;
    const serviceRange = findRangeOfNode(file, "AuthService")!;
    expect(serviceRange.start.line).toBeGreaterThanOrEqual(systemRange.start.line);
    expect(serviceRange.end.line).toBeLessThanOrEqual(systemRange.end.line);
  });
});

// ─── Phase 5 tests ────────────────────────────────────────────────────────────

const KRS_WITH_DESCRIPTION = `\
system Platform {
  description "Top-level platform"
  service Auth {
    description "Authentication service"
    domain Login {
      description "Login domain"
    }
  }
}
`;

const KRS_STANDALONE_SERVICE = `\
service StandaloneAuth {
  label "Auth"
}
`;

describe("collectAllIdentifiers", () => {
  it("collects all IDs from a system hierarchy", () => {
    const file = parse(KRS_SOURCE);
    const ids = collectAllIdentifiers(file);
    expect(ids).toContain("MySystem");
    expect(ids).toContain("AuthService");
    expect(ids).toContain("Login");
    expect(ids).toContain("Core");
  });

  it("collects top-level standalone services", () => {
    const file = parse(KRS_STANDALONE_SERVICE);
    const ids = collectAllIdentifiers(file);
    expect(ids).toContain("StandaloneAuth");
  });
});

describe("getNodeDescription", () => {
  it("returns description for a system node", () => {
    const file = parse(KRS_WITH_DESCRIPTION);
    expect(getNodeDescription(file, "Platform")).toBe("Top-level platform");
  });

  it("returns description for a nested service node", () => {
    const file = parse(KRS_WITH_DESCRIPTION);
    expect(getNodeDescription(file, "Auth")).toBe("Authentication service");
  });

  it("returns description for a deeply nested domain node", () => {
    const file = parse(KRS_WITH_DESCRIPTION);
    expect(getNodeDescription(file, "Login")).toBe("Login domain");
  });

  it("returns null for a node without description", () => {
    const file = parse(KRS_SOURCE);
    expect(getNodeDescription(file, "MySystem")).toBeNull();
  });

  it("returns null for an unknown node ID", () => {
    const file = parse(KRS_SOURCE);
    expect(getNodeDescription(file, "NonExistent")).toBeNull();
  });
});

describe("getWordAtPosition", () => {
  const text = "system MySystem {\n  service Auth {}\n}";

  it("extracts identifier at cursor position", () => {
    // "system" is at line 0, char 0-5
    expect(getWordAtPosition(text, { line: 0, character: 2 })).toBe("system");
  });

  it("extracts identifier in the middle of a word", () => {
    // "MySystem" starts at char 7 on line 0
    expect(getWordAtPosition(text, { line: 0, character: 9 })).toBe("MySystem");
  });

  it("returns null when cursor is on a non-word character", () => {
    // char 6 is the space between "system" and "MySystem"
    expect(getWordAtPosition(text, { line: 0, character: 6 })).toBeNull();
  });

  it("returns null for out-of-bounds line", () => {
    expect(getWordAtPosition(text, { line: 99, character: 0 })).toBeNull();
  });
});

describe("buildDocumentSymbols", () => {
  it("returns a symbol for each top-level system", () => {
    const file = parse(KRS_SOURCE);
    const symbols = buildDocumentSymbols(file);
    expect(symbols.some((s) => s.name === "MySystem")).toBe(true);
  });

  it("returns nested children for service inside system", () => {
    const file = parse(KRS_SOURCE);
    const systemSymbol = buildDocumentSymbols(file).find((s) => s.name === "MySystem");
    expect(systemSymbol).toBeDefined();
    expect(systemSymbol!.children?.some((c) => c.name === "AuthService")).toBe(true);
  });

  it("uses label as symbol name when label is set", () => {
    const src = `system Plat { label "My Platform" }`;
    const file = parse(src);
    const symbols = buildDocumentSymbols(file);
    expect(symbols.some((s) => s.name === "My Platform")).toBe(true);
  });

  it("returns a symbol for a standalone service", () => {
    const file = parse(KRS_STANDALONE_SERVICE);
    const symbols = buildDocumentSymbols(file);
    expect(symbols.some((s) => s.name === "Auth" || s.name === "StandaloneAuth")).toBe(true);
  });
});
