// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { TOUR_PROJECT_KEY, readTourProjectId, writeTourProjectId } from "./tour-project.js";

afterEach(() => localStorage.clear());

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("tour project record", () => {
  it("remembers the project the tour opened", () => {
    expect(readTourProjectId()).toBeNull();
    writeTourProjectId("p-42");
    expect(localStorage.getItem(TOUR_PROJECT_KEY)).toBe("p-42");
    expect(readTourProjectId()).toBe("p-42");
  });

  it("reads a storage that throws as no record, and writing to it does not throw", () => {
    expect(readTourProjectId(throwing)).toBeNull();
    expect(() => writeTourProjectId("p-42", throwing)).not.toThrow();
  });
});
