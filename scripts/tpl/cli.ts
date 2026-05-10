import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "@kompiro/adr-tools";
import { formatFinding, validateAll } from "./validate.ts";

const cwd = process.cwd();
const tplDir = resolve(cwd, "docs/test-perspectives");
const readmePath = join(tplDir, "README.md");

if (!existsSync(tplDir)) {
  process.stderr.write(`error: ${tplDir} not found\n`);
  process.exit(2);
}

const adrConfig = loadConfig(cwd);
const validTopics = adrConfig.topics;

const packagesRoot = resolve(cwd, "packages");
const validPackages = existsSync(packagesRoot)
  ? readdirSync(packagesRoot).filter((name) => {
      const full = join(packagesRoot, name);
      return statSync(full).isDirectory();
    })
  : [];

const { findings, parsed } = validateAll({
  tplDir,
  validTopics,
  validPackages,
  readmePath,
});

if (findings.length === 0) {
  process.stdout.write(`Validated ${parsed.length} TPL(s).\n`);
  process.exit(0);
}

for (const f of findings) {
  process.stderr.write(`${formatFinding(f)}\n`);
}
process.stderr.write(`\n${findings.length} finding(s) across ${parsed.length} TPL(s).\n`);
process.exit(1);
