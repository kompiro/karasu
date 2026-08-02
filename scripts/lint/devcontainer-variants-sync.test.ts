import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { check, deepEqual, parseConfig, stripLineComments } from "./devcontainer-variants-sync.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

describe("stripLineComments", () => {
  it("drops whole-line comments", () => {
    expect(stripLineComments('// note\n{"a": 1}')).toBe('{"a": 1}');
  });

  it("drops an indented comment too", () => {
    expect(JSON.parse(stripLineComments('{\n  // why\n  "a": 1\n}'))).toEqual({ a: 1 });
  });

  it("keeps a `//` that lives inside a string value", () => {
    const text = '{"url": "https://example.com/x"}';
    expect(JSON.parse(stripLineComments(text))).toEqual({ url: "https://example.com/x" });
  });
});

describe("deepEqual", () => {
  it("ignores key order", () => {
    expect(deepEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  it("does not ignore array order — extension order is meaningful", () => {
    expect(deepEqual(["a", "b"], ["b", "a"])).toBe(false);
  });
});

describe("check", () => {
  const base = { features: { git: {} }, remoteUser: "node" };

  it("passes when only the recorded differences differ", () => {
    const local = { ...base, name: "karasu", mounts: ["x"], build: { dockerfile: "Dockerfile" } };
    const cloud = { ...base, name: "karasu (cloud)", build: { dockerfile: "../Dockerfile" } };
    expect(check(local, cloud, JSON.stringify(cloud))).toEqual([]);
  });

  it("flags a key added to the local config only — the expected drift direction", () => {
    const local = { ...base, forwardPorts: [5173] };
    const problems = check(local, base, "{}");
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("cloud/devcontainer.json is missing `forwardPorts`");
  });

  it("flags a value that drifted apart", () => {
    const problems = check(base, { ...base, remoteUser: "root" }, "{}");
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("`remoteUser` differs");
  });

  it("flags a localEnv reference in the cloud config — the variant's whole purpose", () => {
    const problems = check(base, base, '{"mounts":["source=${localEnv:HOME}/.claude"]}');
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("localEnv");
  });
});

describe("the committed configs", () => {
  const localRaw = readFileSync(join(REPO_ROOT, ".devcontainer/devcontainer.json"), "utf8");
  const cloudRaw = readFileSync(join(REPO_ROOT, ".devcontainer/cloud/devcontainer.json"), "utf8");

  it("are in sync", () => {
    expect(check(parseConfig(localRaw), parseConfig(cloudRaw), cloudRaw)).toEqual([]);
  });

  it("keeps the cloud variant free of host references", () => {
    expect(cloudRaw).not.toContain("${localEnv:");
  });

  it("points the cloud build at the shared Dockerfile rather than a copy", () => {
    const cloud = parseConfig(cloudRaw) as { build: { dockerfile: string; context: string } };
    expect(cloud.build.dockerfile).toBe("../Dockerfile");
    expect(cloud.build.context).toBe("..");
  });
});

describe("the Dockerfile", () => {
  const dockerfile = readFileSync(join(REPO_ROOT, ".devcontainer/Dockerfile"), "utf8");

  it("derives every downloaded artefact's architecture instead of hardcoding one", () => {
    // The delta install was pinned to `arm64`, which only ever built on arm64
    // and would fail at `dpkg -i` on a Codespaces/Devin amd64 host (#2252).
    const downloadLines = dockerfile.split("\n").filter((l) => l.includes("releases/download/"));
    expect(downloadLines.length).toBeGreaterThan(0);
    // Asserting on the filtered list rather than per line, so a failure names
    // the offending download instead of just saying "did not match".
    const hardcoded = downloadLines
      .map((l) => l.trim())
      .filter((l) => /_(arm64|amd64|x64|aarch64|x86_64)[._]/.test(l));
    expect(hardcoded).toEqual([]);
  });
});
