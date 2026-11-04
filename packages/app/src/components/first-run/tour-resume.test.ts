import { describe, expect, it } from "vitest";
import type { Project } from "@karasu-tools/core";
import { parseHash } from "../../hooks/history-hash.js";
import { decideTourResume, tourStepHash } from "./tour-resume.js";

const stamp = { createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z" };
const project = (id: string): Project => ({
  id,
  name: id,
  rootPath: `/projects/${id}`,
  ...stamp,
});
const projects = [project("gs"), project("tour")];
const record = { projectId: "tour", step: 2 };
const resumed = { kind: "resume", projectId: "tour", root: "/projects/tour", step: 2 };

function decide(
  url: string,
  {
    lastProjectId = "tour",
    rec = record,
  }: { lastProjectId?: string | null; rec?: typeof record | null } = {},
) {
  const { pathname, search, hash } = new URL(url, "https://karasu.test");
  return decideTourResume({
    entry: { pathname, search, hash },
    record: rec,
    projects,
    lastProjectId,
  });
}

describe("decideTourResume (#3598)", () => {
  it("resumes on the tour project's path, whatever hash the app wrote there", () => {
    expect(decide("/projects/tour")).toEqual(resumed);
    expect(
      decide("/projects/tour#krs-system-CommerceApp?file=%2Fprojects%2Ftour%2Findex.krs"),
    ).toEqual(resumed);
    // The path decides, not the last project.
    expect(decide("/projects/tour#krs-org-root", { lastProjectId: "gs" })).toEqual(resumed);
  });

  it("resumes on a bare URL when the last project is the tour's", () => {
    expect(decide("/")).toEqual(resumed);
  });

  it("keeps the record on a bare URL when the last project is another", () => {
    expect(decide("/", { lastProjectId: "gs" })).toEqual({ kind: "keep" });
    expect(decide("/", { lastProjectId: null })).toEqual({ kind: "keep" });
  });

  it.each([
    ["a gallery example", "/?example=service-split&lang=en"],
    ["a gallery example on the tour's path", "/projects/tour?example=service-split"],
    ["a ?krs= permalink", "/?krs=abc"],
    ["a share link", "/#s=abc"],
    ["a share link on the tour's path", "/projects/tour#s=abc"],
    ["someone's permalink without a path", "/#krs-system-CommerceApp"],
    ["another project's path", "/projects/gs"],
    ["a path to a project that is not here", "/projects/gone"],
  ])("keeps the record and does not resume on %s", (_case, url) => {
    expect(decide(url)).toEqual({ kind: "keep" });
  });

  it("discards a record that is missing or unreadable, or whose project is gone", () => {
    expect(decide("/projects/tour", { rec: null })).toEqual({ kind: "discard" });
    expect(decide("/projects/gone", { rec: { projectId: "gone", step: 0 } })).toEqual({
      kind: "discard",
    });
    expect(decide("/?example=x", { rec: { projectId: "gone", step: 0 } })).toEqual({
      kind: "discard",
    });
  });
});

describe("tourStepHash (#3598)", () => {
  it("opens a step on its scene's file and view, undrilled", () => {
    expect(parseHash(tourStepHash("/projects/tour", 1))).toMatchObject({
      activeView: "org",
      nodeId: null,
      highlightNodeId: null,
      filePath: "/projects/tour/index.krs",
    });
    expect(parseHash(tourStepHash("/projects/tour", 2))).toMatchObject({
      activeView: "system",
      nodeId: null,
      filePath: "/projects/tour/planned.krs",
    });
  });
});
