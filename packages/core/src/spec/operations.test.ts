import { describe, it, expect } from "vitest";
import {
  isRecognizedResourceOperation,
  isWriteOperation,
  type ResourceOperation,
} from "./operations.js";

function bare(...verbs: string[]): ResourceOperation[] {
  return verbs.map((verb) => ({ verb }));
}

describe("isRecognizedResourceOperation", () => {
  it("accepts each of create / read / update / delete", () => {
    for (const verb of ["create", "read", "update", "delete"]) {
      expect(isRecognizedResourceOperation(verb)).toBe(true);
    }
  });

  it("rejects verbs outside the recognized set", () => {
    for (const verb of ["list", "search", "execute", "subscribe", "fetch", ""]) {
      expect(isRecognizedResourceOperation(verb)).toBe(false);
    }
  });
});

describe("isWriteOperation", () => {
  it("returns false when operations is undefined", () => {
    expect(isWriteOperation(undefined)).toBe(false);
  });

  it("returns false for an empty list", () => {
    expect(isWriteOperation([])).toBe(false);
  });

  it("returns false for read-only", () => {
    expect(isWriteOperation(bare("read"))).toBe(false);
  });

  it("returns true when create is present", () => {
    expect(isWriteOperation(bare("create"))).toBe(true);
    expect(isWriteOperation(bare("create", "read"))).toBe(true);
  });

  it("returns true when update is present", () => {
    expect(isWriteOperation(bare("read", "update"))).toBe(true);
  });

  it("returns true when delete is present", () => {
    expect(isWriteOperation(bare("delete"))).toBe(true);
  });

  it("treats bare unrecognized verbs as non-write (conservative)", () => {
    expect(isWriteOperation(bare("list", "search", "execute"))).toBe(false);
  });

  it("classifies write when any of CUD coexists with unknown bare verbs", () => {
    expect(isWriteOperation(bare("list", "create"))).toBe(true);
  });

  it("respects decoration: list:read is not a write", () => {
    expect(isWriteOperation([{ verb: "list", decoratedAs: ["read"] }])).toBe(false);
  });

  it("respects decoration: replace:create,delete is a write", () => {
    expect(isWriteOperation([{ verb: "replace", decoratedAs: ["create", "delete"] }])).toBe(true);
  });

  it("respects decoration even when bare verb is recognized: read:read is read-only", () => {
    expect(isWriteOperation([{ verb: "read", decoratedAs: ["read"] }])).toBe(false);
  });
});
