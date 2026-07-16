import { describe, it, expect, vi } from "vitest";
import { program } from "./index.js";

/**
 * Help-text contracts (AT-0042 §10 / AT-1020 / AT-1025).
 *
 * The Examples sections are registered via commander's `addHelpText("after")`,
 * which `helpInformation()` does not include — so the full help is captured
 * through `outputHelp()` with a stdout spy (no process spawn needed).
 * TPL-20260623-01 (user-facing docs and shipped behavior must not drift):
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
