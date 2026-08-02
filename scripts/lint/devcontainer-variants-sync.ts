/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The local and cloud dev container configs must stay identical except for the
// differences the cloud variant exists to make (Issue #2252).
//
// They are two files because a cloud host has no developer machine to share
// config from, so the `mounts` block cannot apply there. Everything else — the
// image, the features, the extensions, the forwarded port — describes the same
// project and must not drift. Divergence in a dev container is silent and
// arch-shaped: the delta install was pinned to `arm64` and worked for a year
// because every build happened on arm64, and the first amd64 build would have
// failed at `dpkg -i`.
//
// Two checks:
//   1. every key outside ALLOWED_DIFFERENCES is deep-equal between the two
//   2. the cloud config references no `${localEnv:…}` — the whole point of the
//      variant is that it does not reach for a host that isn't there

export interface Problem {
  kind: "error" | "warning";
  message: string;
}

const LOCAL_PATH = ".devcontainer/devcontainer.json";
const CLOUD_PATH = ".devcontainer/cloud/devcontainer.json";

/**
 * Keys that are expected to differ, with the reason. A key listed here is not
 * compared; a key *not* listed here must match exactly.
 */
const ALLOWED_DIFFERENCES: Record<string, string> = {
  name: "the dropdown at codespace creation has to tell them apart",
  build: "the cloud config sits one directory deeper, so its Dockerfile path is relative",
  mounts: "a cloud host has no developer machine to bind-mount config from",
};

/**
 * Strip whole-line `//` comments. Deliberately not a general JSONC parser: only
 * lines whose first non-whitespace characters are `//` are dropped, so a `//`
 * inside a string value (a URL, say) survives.
 */
export function stripLineComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

export function parseConfig(text: string): Record<string, unknown> {
  return JSON.parse(stripLineComments(text)) as Record<string, unknown>;
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return entries.map(([k, v]) => [k, sortedKeys(v)]);
  }
  return value;
}

/** Key-order-insensitive structural equality. */
export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortedKeys(a)) === JSON.stringify(sortedKeys(b));
}

export function check(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>,
  cloudRaw: string,
): Problem[] {
  const problems: Problem[] = [];

  for (const key of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    if (key in ALLOWED_DIFFERENCES) continue;

    const inLocal = key in local;
    const inCloud = key in cloud;
    if (!inCloud) {
      problems.push({
        kind: "error",
        message: `${CLOUD_PATH} is missing \`${key}\`, which ${LOCAL_PATH} defines. Add it, or record why it differs in ALLOWED_DIFFERENCES.`,
      });
      continue;
    }
    if (!inLocal) {
      problems.push({
        kind: "error",
        message: `${LOCAL_PATH} is missing \`${key}\`, which ${CLOUD_PATH} defines. Add it, or record why it differs in ALLOWED_DIFFERENCES.`,
      });
      continue;
    }
    if (!deepEqual(local[key], cloud[key])) {
      problems.push({
        kind: "error",
        message: `\`${key}\` differs between ${LOCAL_PATH} and ${CLOUD_PATH}. Make them match, or record why it differs in ALLOWED_DIFFERENCES.`,
      });
    }
  }

  if (cloudRaw.includes("${localEnv:")) {
    problems.push({
      kind: "error",
      message: `${CLOUD_PATH} references \`\${localEnv:…}\`. A cloud host has no developer machine, so the value it reaches for does not exist there — that is the reason this variant exists.`,
    });
  }

  return problems;
}

export function formatProblems(problems: Problem[]): string {
  const errors = problems.filter((p) => p.kind === "error");
  const lines: string[] = [];
  if (errors.length > 0) {
    lines.push(`devcontainer-variants-sync: ${errors.length} error(s):`);
    for (const e of errors) lines.push(`  ✗ ${e.message}`);
  }
  return lines.join("\n");
}

function main(): void {
  const root = resolve(process.cwd());
  const localRaw = readFileSync(resolve(root, LOCAL_PATH), "utf8");
  const cloudRaw = readFileSync(resolve(root, CLOUD_PATH), "utf8");
  const problems = check(parseConfig(localRaw), parseConfig(cloudRaw), cloudRaw);

  if (problems.length > 0) {
    console.error(formatProblems(problems));
    process.exit(1);
  }
  console.log(
    `devcontainer-variants-sync: ok (${Object.keys(ALLOWED_DIFFERENCES).length} recorded difference(s))`,
  );
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /devcontainer-variants-sync\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
