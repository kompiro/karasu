import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { NpmPackage, PackageJson } from "./release-state.mts";
import {
  classifyStage,
  firstGroup,
  isPrerelease,
  listTarballs,
  manifestProblems,
  matchTarballs,
  MAX_TARBALL_BYTES,
  planProblems,
  preTagOf,
  readPlan,
  stageArgs,
  stageGroups,
  tagFor,
  tarballManifest,
  type PlannedRelease,
  type Tarball,
} from "./stage.mts";

// Fences stage.mts (#3240). The pack job packs the first group of the plan;
// the stage job, which holds the OIDC token and runs no dependency code,
// trusts only the tarball files and decides again what to stage, in which
// group and under which tag.

const release = (name: string, version: string, tag = "latest"): PlannedRelease => ({
  name,
  version,
  tag,
  tarball: { path: `packages/${name}-${version}.tgz`, integrity: "sha256-x" },
});

const pkg = (name: string, version: string, workspaceDependencies: string[] = []): NpmPackage => ({
  name,
  dir: `packages/${name}`,
  version,
  workspaceDependencies,
});

describe("readPlan", () => {
  it("keeps the publish releases, group by group, and drops empty groups", () => {
    const plan = readPlan(
      JSON.stringify({
        version: 1,
        plan: [
          [{ kind: "publish", ...release("karasu-skills", "0.3.0"), access: "public" }],
          [{ kind: "tag-only", name: "karasu-vscode", version: "0.5.0" }],
          [{ kind: "publish", ...release("karasu", "0.11.0") }],
        ],
      }),
    );
    expect(plan.map((group) => group.map((r) => r.name))).toEqual([["karasu-skills"], ["karasu"]]);
  });

  it("refuses a plan format it does not know", () => {
    expect(() => readPlan(JSON.stringify({ version: 2, plan: [] }))).toThrow(/unsupported/);
  });
});

describe("planProblems", () => {
  const npmNames = ["karasu", "@karasu-tools/core", "karasu-skills"];

  it("accepts a plan of bumped released packages", () => {
    expect(
      planProblems([[release("karasu-skills", "0.3.0")], [release("karasu", "0.11.0")]], {
        npmNames,
        bumped: [
          { name: "karasu-skills", version: "0.3.0" },
          { name: "karasu", version: "0.11.0" },
        ],
      }),
    ).toEqual([]);
  });

  it("stops on a package RELEASED_PACKAGES does not list", () => {
    expect(
      planProblems([[release("@karasu-tools/new", "0.1.0")]], { npmNames, bumped: null }),
    ).toEqual([expect.stringMatching(/not in RELEASED_PACKAGES/)]);
  });

  it("stops on an unpublished version this release did not bump", () => {
    expect(
      planProblems([[release("@karasu-tools/core", "0.5.0")], [release("karasu", "0.11.0")]], {
        npmNames,
        bumped: [{ name: "karasu", version: "0.11.0" }],
      }),
    ).toEqual([expect.stringMatching(/core@0\.5\.0 .*did not bump it.*patch changeset/)]);
  });

  it("leaves the tag to the stage job, so a prerelease packs", () => {
    expect(
      planProblems([[release("karasu", "0.11.0-next.0")]], { npmNames, bumped: null }),
    ).toEqual([]);
  });
});

describe("tagFor", () => {
  it("stages a release under latest", () => {
    expect(tagFor("0.11.0", { preTag: null, override: null })).toEqual({ tag: "latest" });
  });

  it("takes a prerelease's tag from changesets' pre mode", () => {
    expect(tagFor("0.11.0-next.0", { preTag: "next", override: null })).toEqual({ tag: "next" });
  });

  it("stops on a prerelease without pre.json", () => {
    expect(tagFor("0.11.0-next.0", { preTag: null, override: null })).toEqual({
      problem: expect.stringMatching(/no \.changeset\/pre\.json/),
    });
  });

  it("lets --tag replace the tag, but never puts a prerelease under latest", () => {
    expect(tagFor("0.11.0-rehearsal.0", { preTag: null, override: "rehearsal" })).toEqual({
      tag: "rehearsal",
    });
    expect(tagFor("0.11.0-rehearsal.0", { preTag: null, override: "latest" })).toEqual({
      problem: expect.stringMatching(/prerelease.*latest/),
    });
  });
});

describe("isPrerelease and preTagOf", () => {
  it("reads a prerelease from the part before build metadata", () => {
    expect(isPrerelease("0.11.0-next.0")).toBe(true);
    expect(isPrerelease("0.11.0+build-1")).toBe(false);
    expect(isPrerelease("0.11.0-next.0+build")).toBe(true);
  });

  it("takes the tag only from pre.json in pre mode", () => {
    expect(preTagOf(null)).toBeNull();
    expect(preTagOf(JSON.stringify({ mode: "pre", tag: "next" }))).toBe("next");
    expect(preTagOf(JSON.stringify({ mode: "exit", tag: "next" }))).toBeNull();
  });
});

describe("stageGroups", () => {
  const skills = pkg("karasu-skills", "0.3.0");
  const core = pkg("@karasu-tools/core", "0.5.0");
  const karasu = pkg("karasu", "0.11.0", ["karasu-skills"]);
  const all = [karasu, core, skills];

  it("never stages a version the release commit did not bump", () => {
    // core@0.5.0 is not on npm (an abandoned release), but this commit did not bump it.
    const { candidates } = stageGroups(all, [skills], () => false);
    expect(candidates).toEqual([skills]);
  });

  it("never stages a version already on npm", () => {
    const onNpm = (name: string) => name === "@karasu-tools/core";
    const { candidates, first, later } = stageGroups(all, all, onNpm);
    expect(candidates.map((p) => p.name)).toEqual(["karasu", "karasu-skills"]);
    expect(first).toEqual([skills]);
    expect(later).toEqual([karasu]);
  });
});

describe("firstGroup", () => {
  const skills = pkg("karasu-skills", "0.3.0");
  const core = pkg("@karasu-tools/core", "0.5.0");
  const karasu = pkg("karasu", "0.11.0", ["karasu-skills"]);
  const all = [karasu, core, skills];

  it("holds back a package whose exactly pinned dependency is not on npm (TPL-3240)", () => {
    const { first, later } = firstGroup(all, all, () => false);
    expect(first.map((p) => p.name)).toEqual(["@karasu-tools/core", "karasu-skills"]);
    expect(later.map((p) => p.name)).toEqual(["karasu"]);
  });

  it("stages the dependent once its dependency is on npm", () => {
    const onNpm = (name: string, version: string) =>
      name === "karasu-skills" && version === "0.3.0";
    expect(firstGroup([karasu], all, onNpm).first).toEqual([karasu]);
  });

  it("checks the dependency's version at the release commit, not any version", () => {
    const onNpm = (name: string, version: string) =>
      name === "karasu-skills" && version === "0.2.1";
    expect(firstGroup([karasu], all, onNpm).first).toEqual([]);
  });

  it("holds back a package that needs a workspace package npm never gets", () => {
    const odd = pkg("karasu", "0.11.0", ["@karasu-tools/i18n"]);
    expect(firstGroup([odd], [odd], () => true).later).toEqual([odd]);
  });
});

const atCommit = (name: string, version: string, publishConfig?: Record<string, unknown>) =>
  ({ name, version, publishConfig }) as PackageJson;

describe("manifestProblems", () => {
  const commit = atCommit("karasu", "0.11.0", { access: "public", provenance: true });

  it("accepts the release commit's name, version and publishConfig in any key order", () => {
    expect(
      manifestProblems(
        "karasu.tgz",
        {
          name: "karasu",
          version: "0.11.0",
          publishConfig: { provenance: true, access: "public" },
        },
        commit,
      ),
    ).toEqual([]);
  });

  it("stops on another name or version", () => {
    expect(manifestProblems("karasu.tgz", { ...commit, version: "0.11.1" }, commit)).toEqual([
      expect.stringMatching(/holds karasu@0\.11\.1, not karasu@0\.11\.0/),
    ]);
  });

  it("stops on publishConfig keys npm would apply as settings", () => {
    const tarball = {
      ...commit,
      publishConfig: { access: "public", provenance: true, registry: "https://evil.example/" },
    };
    expect(manifestProblems("karasu.tgz", tarball, commit)).toEqual([
      expect.stringMatching(/keys npm would apply as settings: registry/),
      expect.stringMatching(/another publishConfig/),
    ]);
  });

  it("stops on a publishConfig that differs from the release commit's", () => {
    expect(
      manifestProblems("karasu.tgz", { ...commit, publishConfig: { access: "public" } }, commit),
    ).toEqual([expect.stringMatching(/another publishConfig/)]);
  });

  it("stops on a publishConfig that is not an object", () => {
    expect(
      manifestProblems("karasu.tgz", { ...commit, publishConfig: "x" as never }, commit),
    ).toEqual([expect.stringMatching(/not an object/)]);
  });
});

describe("matchTarballs", () => {
  const skills = pkg("karasu-skills", "0.3.0");
  const core = pkg("@karasu-tools/core", "0.5.0");
  const commits: Record<string, PackageJson> = {
    "karasu-skills": atCommit("karasu-skills", "0.3.0", { access: "public" }),
    "@karasu-tools/core": atCommit("@karasu-tools/core", "0.5.0", { access: "public" }),
  };
  const tarball = (name: string, version: string): Tarball => ({
    file: `${name}.tgz`,
    manifest: { name, version, publishConfig: { access: "public" } },
  });
  const read = (p: NpmPackage) => commits[p.name];

  it("pairs each package of the first group with its tarball", () => {
    const { staging, problems } = matchTarballs(
      [tarball("karasu-skills", "0.3.0"), tarball("@karasu-tools/core", "0.5.0")],
      [skills, core],
      read,
    );
    expect(problems).toEqual([]);
    expect(staging.map((entry) => entry.pkg.name)).toEqual(["karasu-skills", "@karasu-tools/core"]);
  });

  it("stops on a tarball of a package this commit does not stage now", () => {
    const { staging, problems } = matchTarballs(
      [tarball("karasu-skills", "0.3.0"), tarball("karasu", "0.11.0")],
      [skills],
      read,
    );
    expect(staging).toEqual([]);
    expect(problems).toEqual([
      expect.stringMatching(/karasu@0\.11\.0, which this commit does not stage now/),
    ]);
  });

  it("stops on two tarballs of one package", () => {
    const { problems } = matchTarballs(
      [tarball("karasu-skills", "0.3.0"), { ...tarball("karasu-skills", "0.3.0"), file: "b.tgz" }],
      [skills],
      read,
    );
    expect(problems).toEqual([expect.stringMatching(/More than one tarball/)]);
  });

  it("stops when a package of the first group has no tarball", () => {
    const { staging, problems } = matchTarballs(
      [tarball("karasu-skills", "0.3.0")],
      [skills, core],
      read,
    );
    expect(staging).toEqual([]);
    expect(problems).toEqual([expect.stringMatching(/No tarball of @karasu-tools\/core@0\.5\.0/)]);
  });

  it("stops on a tarball whose version differs from the release commit", () => {
    const { problems } = matchTarballs([tarball("karasu-skills", "0.3.1")], [skills], read);
    expect(problems).toEqual([expect.stringMatching(/not karasu-skills@0\.3\.0/)]);
  });
});

/** A gzipped ustar archive of `package/<path>` files, as pnpm packs one. */
function tgz(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [path, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(`package/${path}`, 0, 100, "latin1");
    header.write("0000644\0", 100);
    header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124);
    header.write("0", 156);
    header.write("ustar\0", 257);
    header.write("00", 263);
    header.fill(0x20, 148, 156);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

describe("tarballManifest", () => {
  it("reads package/package.json without npm", () => {
    const manifest = { name: "karasu", version: "0.11.0", publishConfig: { access: "public" } };
    expect(tarballManifest(tgz({ "package.json": JSON.stringify(manifest), "a.js": "1" }))).toEqual(
      manifest,
    );
  });

  it("fails on a tarball without package.json", () => {
    expect(() => tarballManifest(tgz({ "a.js": "1" }))).toThrow(/no package\/package\.json/);
  });

  it("fails on an entry outside the package", () => {
    const blocks = tgz({ "../escape": "x" });
    expect(() => tarballManifest(blocks)).toThrow(/outside the package/);
  });
});

describe("listTarballs", () => {
  const dir = () => mkdtempSync(join(tmpdir(), "stage-test-"));

  it("lists the tarballs of the artifact", () => {
    const at = dir();
    writeFileSync(join(at, "karasu-0.11.0.tgz"), "x");
    writeFileSync(join(at, "karasu-tools-core-0.5.0.tgz"), "x");
    expect(listTarballs(at)).toEqual({
      files: [join(at, "karasu-0.11.0.tgz"), join(at, "karasu-tools-core-0.5.0.tgz")],
      problems: [],
    });
  });

  it("finds nothing when the pack job uploaded nothing", () => {
    expect(listTarballs(join(dir(), "missing"))).toEqual({ files: [], problems: [] });
  });

  it("stops on anything but a tarball file directly in the artifact", () => {
    const at = dir();
    mkdirSync(join(at, "nested.tgz"));
    writeFileSync(join(at, "publish-plan.json"), "{}");
    writeFileSync(join(at, "real.tgz"), "x");
    symlinkSync(join(at, "real.tgz"), join(at, "link.tgz"));
    expect(listTarballs(at).problems).toEqual([
      expect.stringMatching(/"link\.tgz"/),
      expect.stringMatching(/"nested\.tgz"/),
      expect.stringMatching(/"publish-plan\.json"/),
    ]);
  });

  it("stops on a tarball past the size bound", () => {
    const at = dir();
    writeFileSync(join(at, "big.tgz"), "");
    truncateSync(join(at, "big.tgz"), MAX_TARBALL_BYTES + 1);
    expect(listTarballs(at)).toEqual({
      files: [],
      problems: [expect.stringMatching(/big\.tgz is larger than/)],
    });
  });
});

describe("stageArgs", () => {
  it("leaves latest to npm so its own checks run, and passes any other tag", () => {
    const base = [
      "stage",
      "publish",
      "a.tgz",
      "--json",
      "--ignore-scripts",
      "--registry",
      "https://registry.npmjs.org/",
    ];
    expect(stageArgs("a.tgz", "latest", { inActions: true })).toEqual(base);
    expect(stageArgs("a.tgz", "rehearsal", { inActions: true })).toEqual([
      ...base,
      "--tag",
      "rehearsal",
    ]);
  });

  it("turns provenance off outside GitHub Actions", () => {
    expect(stageArgs("a.tgz", "latest", { inActions: false })).toContain("--provenance=false");
  });
});

describe("classifyStage", () => {
  it("reads the stage id and integrity npm prints", () => {
    const stdout = JSON.stringify({ karasu: { stageId: "1f0e", integrity: "sha512-abc" } });
    expect(classifyStage({ status: 0, stdout, stderr: "" }, "karasu", "1.0.0")).toEqual({
      kind: "staged",
      stageId: "1f0e",
      integrity: "sha512-abc",
    });
  });

  it("fails on output without a stage id", () => {
    expect(classifyStage({ status: 0, stdout: "{}", stderr: "" }, "karasu", "1.0.0").kind).toBe(
      "failed",
    );
  });

  const rehearsal = [
    "npm notice Staging to https://registry.npmjs.org/ with tag rehearsal and public access",
    "npm error code E409",
    'npm error 409 Conflict - POST https://registry.npmjs.org/-/stage/package/@karasu-tools%2fcore - Cannot stage previously published version "0.4.2-rehearsal.0".',
  ].join("\n");

  it("skips a version npm already holds, as the rehearsal saw it", () => {
    expect(
      classifyStage(
        { status: 1, stdout: "", stderr: rehearsal },
        "@karasu-tools/core",
        "0.4.2-rehearsal.0",
      ),
    ).toEqual({ kind: "already-staged" });
  });

  it("does not skip the answer for another version", () => {
    expect(
      classifyStage({ status: 1, stdout: "", stderr: rehearsal }, "@karasu-tools/core", "0.4.2")
        .kind,
    ).toBe("failed");
  });

  it("does not skip another 409", () => {
    const stderr = "npm error code E409\nnpm error 409 Conflict - something else";
    expect(classifyStage({ status: 1, stdout: "", stderr }, "karasu", "1.0.0").kind).toBe("failed");
  });

  it("does not read the answer out of the file list npm prints", () => {
    const stderr = [
      "npm notice 1.2kB E409.txt",
      'npm notice 1.2kB npm error 409 Conflict - x - Cannot stage previously published version "1.0.0"',
      "npm error code E403",
      "npm error 403 Forbidden",
    ].join("\n");
    expect(classifyStage({ status: 1, stdout: "", stderr }, "karasu", "1.0.0").kind).toBe("failed");
  });

  it("treats an unknown rejection as a failure (TPL-2804)", () => {
    expect(
      classifyStage({ status: 1, stdout: "", stderr: "npm error code E500" }, "karasu", "1.0.0"),
    ).toEqual({
      kind: "failed",
      message: "npm error code E500",
    });
  });
});
