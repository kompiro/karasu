import type { Command } from "commander";
import { KRS_LANGUAGE_VERSION } from "@karasu-tools/core";
import type { Deprecation } from "./deprecations.js";

/**
 * `karasu capabilities` (Issue #2961): what this CLI accepts, for a skill or
 * script to check before it calls anything. Bump `schemaVersion` when a field
 * changes meaning or goes away; adding a field does not bump it.
 */
export const CAPABILITIES_SCHEMA_VERSION = 1;

interface CapabilityOption {
  /** The option as declared, e.g. `-o, --output <path>`. */
  flags: string;
  long?: string;
  short?: string;
  /** Whether the option takes a value (`<v>` or `[v]`). */
  takesValue: boolean;
}

interface CapabilityCommand {
  name: string;
  /** Positional arguments as written in usage, e.g. `<file>`, `[files...]`. */
  arguments: string[];
  options: CapabilityOption[];
  /** Nested commands, e.g. `install` under `skill`. Present only when there are some. */
  subcommands?: CapabilityCommand[];
}

interface CapabilityDeprecation {
  kind: Deprecation["kind"];
  name: string;
  command?: string;
  replacement: string;
  since: string;
  removal: string;
  status: "deprecated" | "removed";
}

export interface Capabilities {
  schemaVersion: number;
  name: string;
  version: string;
  languageVersion: string;
  commands: CapabilityCommand[];
  deprecations: CapabilityDeprecation[];
}

function argumentUsage(arg: Command["registeredArguments"][number]): string {
  const name = arg.name() + (arg.variadic ? "..." : "");
  return arg.required ? `<${name}>` : `[${name}]`;
}

function describeCommand(cmd: Command): CapabilityCommand {
  return {
    name: cmd.name(),
    arguments: cmd.registeredArguments.map(argumentUsage),
    options: cmd.options.map((opt) => ({
      flags: opt.flags,
      ...(opt.long ? { long: opt.long } : {}),
      ...(opt.short ? { short: opt.short } : {}),
      takesValue: opt.required || opt.optional,
    })),
    ...(cmd.commands.length > 0 ? { subcommands: cmd.commands.map(describeCommand) } : {}),
  };
}

export function buildCapabilities(
  program: Command,
  version: string,
  table: readonly Deprecation[],
): Capabilities {
  return {
    schemaVersion: CAPABILITIES_SCHEMA_VERSION,
    name: program.name(),
    version,
    languageVersion: KRS_LANGUAGE_VERSION,
    commands: program.commands.map(describeCommand),
    deprecations: table.map((e) => ({
      kind: e.kind,
      name: e.name,
      ...(e.command ? { command: e.command } : {}),
      replacement: e.replacement,
      since: e.since,
      removal: e.removal,
      status: e.removed ? "removed" : "deprecated",
    })),
  };
}

/** The plain-text form, for a human running `karasu capabilities` without `--json`. */
export function capabilitiesText(caps: Capabilities): string {
  const lines = [
    `${caps.name} ${caps.version} (.krs language v${caps.languageVersion})`,
    "",
    "Commands:",
  ];
  const list = (cmds: readonly CapabilityCommand[], prefix: string): void => {
    for (const cmd of cmds) {
      const usage = [prefix + cmd.name, ...cmd.arguments].join(" ");
      const flags = cmd.options.map((o) => o.long ?? o.short).join(" ");
      lines.push(`  ${usage}${flags ? `  ${flags}` : ""}`);
      if (cmd.subcommands) list(cmd.subcommands, `${prefix}${cmd.name} `);
    }
  };
  list(caps.commands, "");
  lines.push("", "Deprecated and removed names:");
  if (caps.deprecations.length === 0) {
    lines.push("  (none)");
  }
  for (const d of caps.deprecations) {
    const prefix = d.command ? `${d.command} ` : "";
    lines.push(
      `  ${d.status}: ${prefix}${d.name} -> ${prefix}${d.replacement} (since ${d.since}, removal ${d.removal})`,
    );
  }
  return lines.join("\n") + "\n";
}
