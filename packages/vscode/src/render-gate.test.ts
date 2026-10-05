import { describe, expect, it } from "vitest";
import { gateRender } from "./render-gate.js";

describe("gateRender (#2677: no new diagram while an error stands)", () => {
  it("draws and remembers a compile with no errors", () => {
    expect(gateRender({ key: "a", value: "svg-1", errorCount: 0, lastValid: undefined })).toEqual({
      kind: "draw",
      value: "svg-1",
      remember: { key: "a", value: "svg-1" },
    });
  });

  it("keeps the last valid render while the compile target is unchanged", () => {
    const lastValid = { key: "a", value: "svg-1" };
    expect(gateRender({ key: "a", value: "partial", errorCount: 2, lastValid })).toEqual({
      kind: "keep",
      value: "svg-1",
    });
  });

  it("does not show another target's last render", () => {
    // Switching view type or drilling in changes the key: the old picture would
    // describe something other than what was asked for.
    const lastValid = { key: "a", value: "svg-1" };
    expect(gateRender({ key: "b", value: "partial", errorCount: 1, lastValid })).toEqual({
      kind: "blocked",
      errorCount: 1,
    });
  });

  it("never draws the partial model core recovered", () => {
    const decision = gateRender({ key: "a", value: "partial", errorCount: 1, lastValid: undefined });
    expect(decision.kind).toBe("blocked");
  });
});
