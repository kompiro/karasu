/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { fileURLToPath } from "node:url";
import { AdrConfigInvalidError, AdrConfigMissingError, loadConfig } from "./config.ts";
import { validateDirectory } from "./validator.ts";

function main(argv: string[]): number {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof AdrConfigMissingError || e instanceof AdrConfigInvalidError) {
      console.error(e.message);
      return 1;
    }
    throw e;
  }
  const dir = argv[2] ?? config.paths.adrDir;
  const { errors, warnings, parsed } = validateDirectory(dir, config);

  if (warnings.length > 0) {
    console.warn(`${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(`  ⚠ ${w}`);
  }
  if (errors.length > 0) {
    console.error(`${errors.length} error(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
  }
  console.log(`Validated ${parsed.length} ADR(s).`);
  return errors.length > 0 ? 1 : 0;
}

// Only run as CLI when invoked directly (tsx / node), not when imported.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv));
}
