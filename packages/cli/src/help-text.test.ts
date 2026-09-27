import { describe, it, expect, vi } from "vitest";
import { Parser } from "@karasu-tools/core";
import { program } from "./index.js";

/**
 * Help-text contracts (AT-0042 §10 / AT-1020 / AT-1025).
 *
 * The Examples sections are registered via commander's `addHelpText("after")`,
 * which `helpInformation()` does not include — so the full help is captured
 * through `outputHelp()` with a stdout spy (no process spawn needed).
 * TPL-1716 (user-facing docs and shipped behavior must not drift):
 * these fences pin the documented svgo pipe / git diff-driver snippets to the
 * shipped `--help` output.
 */

function helpTextOf(commandName: string): string {
  const cmd = program.commands.find((c) => c.name() === commandName);
  if (!cmd) throw new Error(`command not found: ${commandName}`);
  let out = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  try {
    cmd.outputHelp();
  } finally {
    spy.mockRestore();
  }
  return out;
}

describe("karasu render --help (AT-0042 §10)", () => {
  it("render --help lists the svgo pipe, --output and --view examples", () => {
    const help = helpTextOf("render");
    expect(help).toContain("Examples:");
    // stdout pipe usage, including the svgo optimization pipe
    expect(help).toContain("karasu render index.krs > docs/arch.svg");
    expect(help).toContain("| svgo");
    // --output and --view usage
    expect(help).toContain("--output docs/arch.svg");
    expect(help).toContain("--view deploy");
    expect(help).toContain("--view org");
  });
});

describe("karasu diff --help (AT-1020 / AT-1025)", () => {
  it("diff --help documents the git diff-driver snippet (textconv)", () => {
    const help = helpTextOf("diff");
    expect(help).toContain(`[diff "krs"]`);
    expect(help).toContain("textconv = karasu render");
    // external-diff alternative for graphical diffs between revisions
    expect(help).toContain("external diff");
    expect(help).toContain(`karasu diff "$2" "$5"`);
  });

  it("diff --help states bundled all-views output is the default", () => {
    const help = helpTextOf("diff");
    expect(help).toContain("By default emits a bundled SVG");
    expect(help).toContain("Use `--view` to emit a single-view SVG instead.");
  });
});

/**
 * Every `.krs` snippet a `--help` Example pipes into the CLI must parse cleanly
 * (Issue #2910, TPL-2047). An agent driving the CLI learns the syntax from these
 * Examples, and `append` / `insert` / `apply` write whatever they are given with
 * exit 0 — so a snippet that teaches `label: "…"` (a parse error) or a shape the
 * validator warns about is copied into the user's model unnoticed.
 *
 * Two forms carry `.krs`: `$ echo '<krs>' | karasu …` and
 * `$ cat <<'EOF' | karasu …` … `EOF`. Snippets are parsed standalone, which is
 * how `append` receives them and how `insert` validates the block it splices.
 */
function krsSnippetsIn(help: string): string[] {
  const snippets: string[] = [];
  const lines = help.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const echo = /^\$ echo '([^']*)' \| karasu\b/.exec(line);
    if (echo) {
      snippets.push(echo[1]);
      continue;
    }
    if (/^\$ cat <<'EOF' \| karasu\b/.test(line)) {
      const body: string[] = [];
      for (i++; i < lines.length && lines[i].trim() !== "EOF"; i++) body.push(lines[i]);
      snippets.push(body.join("\n"));
    }
  }
  return snippets;
}

describe("--help .krs Examples parse cleanly (#2910)", () => {
  const commands = program.commands.map((c) => c.name());

  // Guards the extractor itself: a regex that silently matched nothing would
  // leave every test below green.
  it.each(["append", "apply", "insert"])("finds the .krs snippets in karasu %s --help", (name) => {
    expect(krsSnippetsIn(helpTextOf(name)).length).toBeGreaterThan(0);
  });

  it.each(commands)("karasu %s --help teaches only .krs that parses without warnings", (name) => {
    for (const snippet of krsSnippetsIn(helpTextOf(name))) {
      const findings = Parser.parse(snippet)
        .diagnostics.filter((d) => d.severity === "error" || d.severity === "warning")
        .map((d) => `${d.severity} ${d.code}`);
      expect({ snippet, findings }).toEqual({ snippet, findings: [] });
    }
  });

  it("rejects the label-colon form this guard was written for", () => {
    const help = "  $ echo 'service X { label: \"X\" }' | karasu append arch.krs";
    const [snippet] = krsSnippetsIn(help);
    expect(Parser.parse(snippet).diagnostics.some((d) => d.severity === "error")).toBe(true);
  });
});
