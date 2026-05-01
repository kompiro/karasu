import { describe, it, expect } from "vitest";
import { isRecognizedResourceOperation, isWriteOperation } from "./operations.js";

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
    expect(isWriteOperation(["read"])).toBe(false);
  });

  it("returns true when create is present", () => {
    expect(isWriteOperation(["create"])).toBe(true);
    expect(isWriteOperation(["create", "read"])).toBe(true);
  });

  it("returns true when update is present", () => {
    expect(isWriteOperation(["read", "update"])).toBe(true);
  });

  it("returns true when delete is present", () => {
    expect(isWriteOperation(["delete"])).toBe(true);
  });

  it("treats unrecognized verbs as non-write (conservative)", () => {
    expect(isWriteOperation(["list", "search", "execute"])).toBe(false);
  });

  it("classifies write when any of CUD coexists with unknown verbs", () => {
    expect(isWriteOperation(["list", "create"])).toBe(true);
  });
});
