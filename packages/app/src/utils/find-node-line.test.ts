import { describe, it, expect } from "vitest";
import { Parser } from "@karasu-tools/core";
import { findNodeLine } from "./find-node-line.js";

describe("findNodeLine", () => {
  it("returns 0-based line of a top-level system", () => {
    const src = `
system Web {
  service api
}
`.trimStart();
    const krsFile = Parser.parse(src).value;
    expect(findNodeLine(krsFile, "Web")).toBe(0);
  });

  it("finds nested children under a system", () => {
    const src = `system Web {
  service api
}
`;
    const krsFile = Parser.parse(src).value;
    expect(findNodeLine(krsFile, "api")).toBe(1);
  });

  it("finds top-level services declared outside a system", () => {
    const src = `service gateway
system Web {
  service api
}
`;
    const krsFile = Parser.parse(src).value;
    expect(findNodeLine(krsFile, "gateway")).toBe(0);
  });

  it("finds deploy-block nodes", () => {
    const src = `deploy Prod {
  cloud "aws" {
    function lambda
  }
}
`;
    const krsFile = Parser.parse(src).value;
    expect(findNodeLine(krsFile, "Prod")).toBe(0);
  });

  it("finds organization team members", () => {
    const src = `organization Co {
  team platform {
    team oncall
  }
}
`;
    const krsFile = Parser.parse(src).value;
    expect(findNodeLine(krsFile, "platform")).toBe(1);
    expect(findNodeLine(krsFile, "oncall")).toBe(2);
  });

  it("returns null when the id is not present", () => {
    const src = `system Web {
  service api
}
`;
    const krsFile = Parser.parse(src).value;
    expect(findNodeLine(krsFile, "missing")).toBeNull();
  });
});
