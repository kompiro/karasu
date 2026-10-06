import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import surface from "./agent-surface.json" with { type: "json" };

const mockCheck = vi.fn<() => void>();
const mockRender = vi.fn<() => void>();
vi.mock("./check.js", () => ({ check: mockCheck }));
vi.mock("./render.js", () => ({ render: mockRender }));

const { program } = await import("./index.js");
const { applyDeprecations, DEPRECATIONS, notice } = await import("./deprecations.js");
const { buildCapabilities, CAPABILITIES_SCHEMA_VERSION } = await import("./capabilities.js");
const { cliPackageVersion } = await import("./version.js");

type Deprecation = import("./deprecations.js").Deprecation;

/**
 * Backward-compatibility guards for the agent-facing CLI surface (Issue #2961).
 * The real table starts empty, so the mechanism is proven with fixture entries;
 * the table checks run over both the real table and the fixtures.
 */

const FIXTURE: Deprecation[] = [
  { kind: "command", name: "validate", replacement: "check", since: "0.7.0", removal: "1.0.0" },
  {
    kind: "command",
    name: "lint",
    replacement: "check",
    since: "0.5.0",
    removal: "1.0.0",
    removed: true,
  },
  {
    kind: "flag",
    command: "render",
    name: "--out",
    replacement: "--output",
    since: "0.7.0",
    removal: "1.0.0",
  },
  {
    kind: "flag",
    command: "render",
    name: "--dark",
    replacement: "--theme",
    since: "0.5.0",
    removal: "1.0.0",
    removed: true,
  },
];

const argv = (...args: string[]) => ["node", "karasu", ...args];

describe("applyDeprecations", () => {
  it("rewrites a deprecated command alias and prints the fixed-format notice", () => {
    const r = applyDeprecations(argv("validate", "index.krs"), FIXTURE);
    expect(r.argv).toEqual(argv("check", "index.krs"));
    expect(r.notices).toEqual([
      "karasu: deprecated: 'validate' -> 'check' (since 0.7.0, removal 1.0.0)\n",
    ]);
    expect(r.error).toBeUndefined();
  });

  it("fails a removed command with the same format naming the replacement", () => {
    const r = applyDeprecations(argv("lint", "index.krs"), FIXTURE);
    expect(r.error).toBe("karasu: removed: 'lint' -> 'check' (since 0.5.0, removal 1.0.0)\n");
  });

  it("rewrites a deprecated flag, including the --flag=value spelling", () => {
    const r = applyDeprecations(argv("render", "a.krs", "--out", "a.svg"), FIXTURE);
    expect(r.argv).toEqual(argv("render", "a.krs", "--output", "a.svg"));
    expect(r.notices).toEqual([
      "karasu: deprecated: 'render --out' -> 'render --output' (since 0.7.0, removal 1.0.0)\n",
    ]);
    const eq = applyDeprecations(argv("render", "a.krs", "--out=a.svg"), FIXTURE);
    expect(eq.argv).toEqual(argv("render", "a.krs", "--output=a.svg"));
  });

  it("fails a removed flag", () => {
    const r = applyDeprecations(argv("render", "a.krs", "--dark"), FIXTURE);
    expect(r.error).toBe(
      "karasu: removed: 'render --dark' -> 'render --theme' (since 0.5.0, removal 1.0.0)\n",
    );
  });

  it("leaves a flag alone on another command and after a `--` terminator", () => {
    expect(applyDeprecations(argv("diff", "a", "b", "--out", "x"), FIXTURE).argv).toEqual(
      argv("diff", "a", "b", "--out", "x"),
    );
    expect(applyDeprecations(argv("render", "--", "--out"), FIXTURE).argv).toEqual(
      argv("render", "--", "--out"),
    );
  });

  it("passes current names and bare `karasu --version` through untouched", () => {
    for (const args of [argv("check", "index.krs"), argv("--version"), argv()]) {
      expect(applyDeprecations(args, FIXTURE)).toEqual({ argv: args, notices: [] });
    }
  });
});

describe("a deprecated alias still runs the replacement", () => {
  afterEach(() => {
    mockCheck.mockReset();
    mockRender.mockReset();
  });

  it("dispatches the aliased command through the real program", async () => {
    const r = applyDeprecations(argv("validate", "index.krs"), FIXTURE);
    await program.parseAsync(r.argv);
    expect(mockCheck).toHaveBeenCalledWith("index.krs");
  });

  it("dispatches the aliased flag through the real program", async () => {
    const r = applyDeprecations(argv("render", "a.krs", "--out", "a.svg"), FIXTURE);
    await program.parseAsync(r.argv);
    expect(mockRender).toHaveBeenCalledWith("a.krs", expect.objectContaining({ output: "a.svg" }));
  });
});

/** Every problem with a table against a program: empty means consistent. */
function tableProblems(table: readonly Deprecation[], cli: Command, version: string): string[] {
  const problems: string[] = [];
  const major = (v: string) => Number(v.split(".")[0]);
  const cmp = (a: string, b: string) => {
    const [x, y] = [a, b].map((v) => v.split(".").map(Number));
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  const find = (name: string) => cli.commands.find((c) => c.name() === name);
  for (const e of table) {
    const id = e.kind === "flag" ? `${e.command} ${e.name}` : e.name;
    if (!/^\d+\.0\.0$/.test(e.removal) || major(e.removal) < 1) {
      problems.push(`${id}: removal ${e.removal} is not a major release >= 1.0.0`);
    }
    if (cmp(e.since, e.removal) >= 0)
      problems.push(`${id}: since ${e.since} is not before removal`);
    if (!e.removed && cmp(version, e.removal) >= 0) {
      problems.push(`${id}: CLI ${version} has reached removal ${e.removal}; mark it removed`);
    }
    if (e.kind === "command") {
      if (find(e.name)) problems.push(`${id}: still a registered command`);
      if (!find(e.replacement))
        problems.push(`${id}: replacement '${e.replacement}' is not a command`);
    } else {
      const cmd = e.command ? find(e.command) : undefined;
      if (!cmd) {
        problems.push(`${id}: command '${e.command}' is not registered`);
        continue;
      }
      const flags = cmd.options.flatMap((o) => [o.long, o.short]);
      if (flags.includes(e.name)) problems.push(`${id}: still a registered flag`);
      if (!flags.includes(e.replacement)) {
        problems.push(`${id}: replacement '${e.replacement}' is not a flag of ${e.command}`);
      }
    }
  }
  return problems;
}

describe("deprecation table", () => {
  it("every entry resolves: an alias maps onto a live name, a tombstone names one", () => {
    expect(tableProblems(DEPRECATIONS, program, cliPackageVersion())).toEqual([]);
  });

  it("the check accepts the fixture and catches a malformed entry", () => {
    expect(tableProblems(FIXTURE, program, "0.7.0")).toEqual([]);
    const bad: Deprecation[] = [
      { kind: "command", name: "render", replacement: "gone", since: "0.7.0", removal: "0.9.0" },
      {
        kind: "flag",
        command: "render",
        name: "--old",
        replacement: "--nope",
        since: "0.7.0",
        removal: "1.0.0",
      },
    ];
    expect(tableProblems(bad, program, "0.7.0")).toEqual([
      "render: removal 0.9.0 is not a major release >= 1.0.0",
      "render: still a registered command",
      "render: replacement 'gone' is not a command",
      "render --old: replacement '--nope' is not a flag of render",
    ]);
    expect(tableProblems(FIXTURE, program, "1.0.0")).toEqual([
      "validate: CLI 1.0.0 has reached removal 1.0.0; mark it removed",
      "render --out: CLI 1.0.0 has reached removal 1.0.0; mark it removed",
    ]);
  });

  it("formats the notice so the pattern docs/tools/cli.md gives agents matches it", () => {
    // TPL-1716: the documented pattern is what agents copy, so pin it to the output.
    for (const doc of ["cli.md", "cli.ja.md"]) {
      const md = readFileSync(new URL(`../../../docs/tools/${doc}`, import.meta.url), "utf8");
      const documented = md.match(/`(\^karasu: .+\$)`/)?.[1];
      expect(documented, `${doc} documents the notice pattern`).toBeDefined();
      const pattern = new RegExp(documented!);
      for (const entry of FIXTURE) {
        const m = notice(entry).trimEnd().match(pattern);
        expect(m?.slice(1)).toEqual([
          entry.removed ? "removed" : "deprecated",
          entry.kind === "flag" ? `${entry.command} ${entry.name}` : entry.name,
          entry.kind === "flag" ? `${entry.command} ${entry.replacement}` : entry.replacement,
          entry.since,
          entry.removal,
        ]);
      }
    }
  });
});

describe("agent-facing surface baseline (agent-surface.json)", () => {
  // Nested commands are recorded by their full path, e.g. `skill install`.
  type Cmd = (typeof program.commands)[number];
  const flatten = (cmds: readonly Cmd[], prefix: string): [string, string[]][] =>
    cmds.flatMap((c) => [
      [
        prefix + c.name(),
        c.options.flatMap((o) => [o.long, o.short].filter((f): f is string => !!f)),
      ] as [string, string[]],
      ...flatten(c.commands, `${prefix}${c.name()} `),
    ]);
  const live = new Map(flatten(program.commands, ""));
  const tabled = (kind: Deprecation["kind"], name: string, command?: string) =>
    DEPRECATIONS.some((e) => e.kind === kind && e.name === name && e.command === command);

  it("no command or flag in the baseline disappears without a deprecation entry", () => {
    const dropped: string[] = [];
    for (const [cmd, flags] of Object.entries(surface.commands)) {
      if (!live.has(cmd)) {
        if (!tabled("command", cmd)) dropped.push(cmd);
        continue;
      }
      for (const flag of flags) {
        if (!live.get(cmd)!.includes(flag) && !tabled("flag", flag, cmd)) {
          dropped.push(`${cmd} ${flag}`);
        }
      }
    }
    // A rename or removal must keep the old name working: add it to
    // DEPRECATIONS in deprecations.ts (see docs/release.md「CLI の後方互換」).
    expect(dropped).toEqual([]);
  });

  it("every live command and flag is recorded in the baseline", () => {
    const missing: string[] = [];
    const recorded = surface.commands as Record<string, string[]>;
    for (const [cmd, flags] of live) {
      if (!recorded[cmd]) missing.push(cmd);
      for (const flag of flags) if (!recorded[cmd]?.includes(flag)) missing.push(`${cmd} ${flag}`);
    }
    // A new name joins the compatibility promise: add it to agent-surface.json.
    expect(missing).toEqual([]);
  });
});

describe("karasu capabilities --json", () => {
  async function run(...args: string[]): Promise<string> {
    let out = "";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out += String(chunk);
      return true;
    });
    try {
      await program.parseAsync(argv("capabilities", ...args));
    } finally {
      spy.mockRestore();
    }
    return out;
  }

  it("reports the version, every registered command with its flags, and the table", async () => {
    const caps = JSON.parse(await run("--json"));
    expect(caps.schemaVersion).toBe(CAPABILITIES_SCHEMA_VERSION);
    expect(caps.name).toBe("karasu");
    expect(caps.version).toBe(cliPackageVersion());
    expect(caps.languageVersion).toMatch(/^\d+\.\d+$/);
    expect(caps.commands.map((c: { name: string }) => c.name).sort()).toEqual(
      program.commands.map((c) => c.name()).sort(),
    );
    const render = caps.commands.find((c: { name: string }) => c.name === "render");
    expect(render.arguments).toEqual(["<file>"]);
    expect(render.options).toContainEqual({
      flags: "-o, --output <path>",
      long: "--output",
      short: "-o",
      takesValue: true,
    });
    expect(render.options).toContainEqual({
      flags: "--include-matrix",
      long: "--include-matrix",
      takesValue: false,
    });
    const fmt = caps.commands.find((c: { name: string }) => c.name === "fmt");
    expect(fmt.arguments).toEqual(["[files...]"]);
    expect(caps.deprecations).toEqual([]);
  });

  it("lists deprecated and removed entries with their replacements", () => {
    const caps = buildCapabilities(program, "0.7.0", FIXTURE);
    expect(caps.deprecations).toEqual([
      {
        kind: "command",
        name: "validate",
        replacement: "check",
        since: "0.7.0",
        removal: "1.0.0",
        status: "deprecated",
      },
      {
        kind: "command",
        name: "lint",
        replacement: "check",
        since: "0.5.0",
        removal: "1.0.0",
        status: "removed",
      },
      {
        kind: "flag",
        name: "--out",
        command: "render",
        replacement: "--output",
        since: "0.7.0",
        removal: "1.0.0",
        status: "deprecated",
      },
      {
        kind: "flag",
        name: "--dark",
        command: "render",
        replacement: "--theme",
        since: "0.5.0",
        removal: "1.0.0",
        status: "removed",
      },
    ]);
  });

  it("prints a plain-text summary without --json", async () => {
    const text = await run();
    expect(text).toContain(`karasu ${cliPackageVersion()}`);
    expect(text).toContain("render <file>");
    expect(text).toContain("(none)");
    expect(text).toContain("skill install [name]  --dir --force");
    expect(text).toContain("skill path [name]");
  });

  it("lists nested commands under subcommands, and omits the field elsewhere", async () => {
    const caps = JSON.parse(await run("--json"));
    const skill = caps.commands.find((c: { name: string }) => c.name === "skill");
    expect(skill.subcommands.map((c: { name: string }) => c.name)).toEqual(["install", "path"]);
    const install = skill.subcommands.find((c: { name: string }) => c.name === "install");
    expect(install.arguments).toEqual(["[name]"]);
    expect(install.options.map((o: { long: string }) => o.long)).toEqual(["--dir", "--force"]);
    const render = caps.commands.find((c: { name: string }) => c.name === "render");
    expect(render).not.toHaveProperty("subcommands");
  });
});
