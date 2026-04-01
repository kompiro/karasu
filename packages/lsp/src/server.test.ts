import { describe, it, expect } from "vitest";
import { Parser } from "@karasu/core";
import { collectNodes, findNodeAtPosition, findRangeOfNode } from "./position-resolver.js";

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
