/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { validateDirectory } from "./validator.ts";

const dir = process.argv[2] ?? "docs/adr";
const { errors, warnings, parsed, skipped } = validateDirectory(dir);

if (warnings.length > 0) {
  console.warn(`${warnings.length} warning(s):`);
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
}
if (errors.length > 0) {
  console.error(`${errors.length} error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
}
console.log(
  `Validated ${parsed.length} ADR(s); skipped ${skipped.length} file(s) without frontmatter.`,
);
process.exit(errors.length > 0 ? 1 : 0);
