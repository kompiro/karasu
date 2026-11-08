// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { TOUR_PROJECT_KEY, readTourProject, writeTourProject } from "./tour-project.js";

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
  it("remembers the guide started last and the project it opened", () => {
    expect(readTourProject()).toBeNull();
    writeTourProject({ tour: "understand", projectId: "p-42" });
    expect(readTourProject()).toEqual({ tour: "understand", projectId: "p-42" });
  });

  it("reads a bare id, written before #3600, as the Design guide's project", () => {
    localStorage.setItem(TOUR_PROJECT_KEY, "p-42");
    expect(readTourProject()).toEqual({ tour: "service-split", projectId: "p-42" });
  });

  it.each([
    ["an empty value", ""],
    ["broken JSON", "{not json"],
    ["a guide this build does not have", '{"tour":"other","projectId":"p"}'],
    ["a guide named after a prototype key", '{"tour":"constructor","projectId":"p"}'],
    ["no project", '{"tour":"evolve","projectId":""}'],
    ["a project of another type", '{"tour":"evolve","projectId":1}'],
  ])("reads %s as no record", (_case, raw) => {
    localStorage.setItem(TOUR_PROJECT_KEY, raw);
    expect(readTourProject()).toBeNull();
  });

  it("reads a storage that throws as no record, and writing to it does not throw", () => {
    expect(readTourProject(throwing)).toBeNull();
    expect(() => writeTourProject({ tour: "evolve", projectId: "p" }, throwing)).not.toThrow();
  });
});
