import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { program } from "./index.js";
import { buildCapabilities } from "./capabilities.js";

// Every command and long flag the CLI accepts is on the CLI page of docs/tools,
// in both locales (TPL-1716). The surface is walked from the real `program`
// through the same builder `karasu capabilities` uses, so a new subcommand or
// flag fails here until both pages mention it.
//
// A command is documented by a row of a table whose first cell starts with the
// command's path (`` `skill install [name]` ``). A command that only groups
// subcommands (`skill`) is covered by its children's rows. A flag is documented
// where its command is: in that row, or in a section whose heading names
// `` `karasu <command>` `` (or a parent command). The options in
// `SHARED_FLAGS` are explained once for every command and must appear on the
// page; a flag added under one of those spellings with another meaning belongs
// in its command's row instead.

const DOCS = ["docs/tools/cli.md", "docs/tools/cli.ja.md"];
const SHARED_FLAGS = ["--output", "--format"];
const repoRoot = resolve(import.meta.dirname, "../../..");

interface Surface {
  path: string;
  flags: string[];
  hasSubcommands: boolean;
}

type CapabilityCommand = ReturnType<typeof buildCapabilities>["commands"][number];

function walk(commands: CapabilityCommand[], prefix = ""): Surface[] {
  return commands.flatMap((c) => [
    {
      path: prefix + c.name,
      flags: c.options.flatMap((o) => (o.long ? [o.long] : [])),
      hasSubcommands: (c.subcommands?.length ?? 0) > 0,
    },
    ...walk(c.subcommands ?? [], `${prefix}${c.name} `),
  ]);
}

/** The first code span of every table row, e.g. `skill install [name]`. */
function rowCells(markdown: string): string[] {
  return markdown.split("\n").flatMap((line) => /^\|\s*`([^`]+)`/.exec(line)?.slice(1, 2) ?? []);
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The table rows and section lines that document the command at `path`. */
function regionOf(markdown: string, path: string): string {
  const lines = markdown.split("\n");
  const words = path.split(" ");
  const prefixes = words.map((_, i) => words.slice(0, i + 1).join(" "));
  const out: string[] = [];
  let fenced = false;
  let sectionLevel: number | null = null;
  for (const line of lines) {
    if (FENCE.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (sectionLevel !== null && level <= sectionLevel) sectionLevel = null;
      if (sectionLevel === null && prefixes.some((p) => heading[2].includes(`\`karasu ${p}\``))) {
        sectionLevel = level;
      }
    }
    const cell = /^\|\s*`([^`]+)`/.exec(line)?.[1];
    if (sectionLevel !== null || cell === path || cell?.startsWith(`${path} `)) out.push(line);
  }
  return out.join("\n");
}

const mentions = (text: string, flag: string) =>
  new RegExp(`(?<![\\w-])${flag}(?![\\w-])`).test(text);

const surface = walk(buildCapabilities(program, "0.0.0", []).commands);

describe("docs/tools/cli covers the CLI surface (TPL-1716)", () => {
  it("walks a non-trivial surface", () => {
    expect(surface.map((s) => s.path)).toEqual(expect.arrayContaining(["render", "skill install"]));
  });

  it.each(DOCS)("%s has a row for every command", (doc) => {
    const text = readFileSync(resolve(repoRoot, doc), "utf8");
    const missing = surface
      .filter((s) => !s.hasSubcommands)
      .filter((s) => !rowCells(text).some((c) => c === s.path || c.startsWith(`${s.path} `)))
      .map((s) => s.path);
    expect(missing).toEqual([]);
  });

  it.each(DOCS)("%s explains every long flag where its command is", (doc) => {
    const text = readFileSync(resolve(repoRoot, doc), "utf8");
    expect(SHARED_FLAGS.filter((flag) => !mentions(text, flag))).toEqual([]);
    const missing = surface.flatMap((s) => {
      const region = regionOf(text, s.path);
      return s.flags
        .filter((flag) => !SHARED_FLAGS.includes(flag) && !mentions(region, flag))
        .map((flag) => `${s.path} ${flag}`);
    });
    expect(missing).toEqual([]);
  });
});
