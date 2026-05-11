/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface Finding {
  file: string;
  line: number;
  text: string;
}

const FORBIDDEN_PATTERN = /\bpage\s*\.\s*goto\s*\(/;

const DEFAULT_ROOTS = ["packages/e2e/tests", "packages/vscode-e2e/tests"];

const MESSAGE = [
  "Direct `page.goto(...)` calls are forbidden in E2E test files.",
  "Boot through the opfs fixture instead — see packages/e2e/fixtures/README.md.",
  "If a new top-level navigation helper is genuinely needed, add it to a fixture",
  "(packages/e2e/fixtures/) so every test goes through the wipe()/seed() lifecycle.",
].join("\n");

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out = out.concat(walk(full));
    } else if (st.isFile() && /\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

export function scanFile(absPath: string, repoRoot: string): Finding[] {
  const content = readFileSync(absPath, "utf8");
  const findings: Finding[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FORBIDDEN_PATTERN.test(line)) {
      findings.push({
        file: relative(repoRoot, absPath),
        line: i + 1,
        text: line.trim(),
      });
    }
  }
  return findings;
}

export function scan(repoRoot: string, roots: string[] = DEFAULT_ROOTS): Finding[] {
  const findings: Finding[] = [];
  for (const root of roots) {
    const abs = resolve(repoRoot, root);
    for (const file of walk(abs)) {
      findings.push(...scanFile(file, repoRoot));
    }
  }
  return findings;
}

export function formatFindings(findings: Finding[]): string {
  const lines: string[] = [];
  lines.push(`Found ${findings.length} forbidden \`page.goto(\` call(s):`);
  lines.push("");
  for (const f of findings) {
    lines.push(`  ${f.file}:${f.line}`);
    lines.push(`    ${f.text}`);
  }
  lines.push("");
  lines.push(MESSAGE);
  return lines.join("\n");
}

function main(): void {
  const repoRoot = resolve(process.cwd());
  const findings = scan(repoRoot);
  if (findings.length > 0) {
    console.error(formatFindings(findings));
    process.exit(1);
  }
  console.log("no-direct-page-goto: ok (0 findings)");
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /no-direct-page-goto\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
