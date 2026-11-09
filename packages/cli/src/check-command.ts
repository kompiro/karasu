import type { Command } from "commander";
import { check } from "./check.js";

/**
 * Options, help and action of `check <file>`, registered in `index.ts` with the
 * other commands. `directoryEntryHelp` is the note every command that takes a
 * `.krs` entry shares.
 */
export function configureCheckCommand(command: Command, directoryEntryHelp: string): void {
  command
    .description(
      "Validate a .krs project (imports included) and write nothing. " +
        "Prints every diagnostic; exits 1 when any is an error.",
    )
    .option(
      "--format <format>",
      "Output format: text (lines on stderr) | json (one document on stdout)",
      "text",
    )
    .addHelpText(
      "after",
      `${directoryEntryHelp}Runs the same compile as \`karasu render\`, so a file that passes \`check\`
renders. Use it after every edit, before \`karasu fmt\`: \`fmt\` refuses a file
with parse errors without saying where they are.

\`lint-style\` checks .krs.style files, not .krs.

Each diagnostic line starts with its severity and ID (\`Warning[KRS041]: ...\`);
look the ID up in the diagnostics catalog. The line is for people: a script or
an agent reads \`--format json\`, whose \`code\` does not depend on the locale.

Examples:
  # Validate a project entry file
  $ karasu check index.krs

  # The same findings as JSON for a script or an agent
  $ karasu check index.krs --format json

  # Edit, then validate before formatting
  $ echo 'service NewService { label "New" }' | karasu insert ECommerce arch.krs
  $ karasu check arch.krs && karasu fmt arch.krs`,
    )
    .action((file: string, options: { format: string }) => check(file, options));
}
