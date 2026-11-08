// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  TOUR_PROGRESS_KEY,
  clearTourProgress,
  readTourProgress,
  writeTourProgress,
} from "./tour-progress.js";

afterEach(() => localStorage.clear());

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const stored = (value: unknown) => localStorage.setItem(TOUR_PROGRESS_KEY, JSON.stringify(value));

describe("tour progress record (#3598)", () => {
  it("writes the project and step with its version and tour, reads them back, and clears them", () => {
    expect(readTourProgress()).toBeNull();
    writeTourProgress({ tour: "service-split", projectId: "p-42", step: 2 });
    expect(JSON.parse(localStorage.getItem(TOUR_PROGRESS_KEY) ?? "")).toEqual({
      v: 1,
      tour: "service-split",
      projectId: "p-42",
      step: 2,
    });
    expect(readTourProgress()).toEqual({ tour: "service-split", projectId: "p-42", step: 2 });

    clearTourProgress();
    expect(localStorage.getItem(TOUR_PROGRESS_KEY)).toBeNull();
    expect(readTourProgress()).toBeNull();
  });

  it.each([
    ["service-split", 4],
    ["understand", 3],
    ["evolve", 3],
  ])("reads back the %s guide up to its last step, %i (#3600)", (tour, step) => {
    stored({ v: 1, tour, projectId: "p", step });
    expect(readTourProgress()).toEqual({ tour, projectId: "p", step });
  });

  it.each([
    ["another version", { v: 2, tour: "service-split", projectId: "p", step: 0 }],
    ["a guide this build does not have", { v: 1, tour: "other", projectId: "p", step: 0 }],
    ["a guide named after a prototype key", { v: 1, tour: "constructor", projectId: "p", step: 0 }],
    ["a step past another guide's last", { v: 1, tour: "understand", projectId: "p", step: 4 }],
    ["no project", { v: 1, tour: "service-split", projectId: "", step: 0 }],
    ["a step past the last", { v: 1, tour: "service-split", projectId: "p", step: 5 }],
    ["a negative step", { v: 1, tour: "service-split", projectId: "p", step: -1 }],
    ["a fractional step", { v: 1, tour: "service-split", projectId: "p", step: 1.5 }],
    ["a step as text", { v: 1, tour: "service-split", projectId: "p", step: "1" }],
    ["an array", [1, "service-split", "p", 0]],
    ["null", null],
  ])("reads %s as no record", (_case, value) => {
    stored(value);
    expect(readTourProgress()).toBeNull();
  });

  it("reads broken JSON as no record", () => {
    localStorage.setItem(TOUR_PROGRESS_KEY, "{not json");
    expect(readTourProgress()).toBeNull();
  });

  it("reads a storage that throws as no record, and writing or clearing it does not throw", () => {
    expect(readTourProgress(throwing)).toBeNull();
    expect(() =>
      writeTourProgress({ tour: "evolve", projectId: "p", step: 0 }, throwing),
    ).not.toThrow();
    expect(() => clearTourProgress(throwing)).not.toThrow();
  });
});
