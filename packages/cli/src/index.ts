#!/usr/bin/env node
import { program } from "commander";
import { serve } from "./serve.js";

program.name("karasu").description("karasu — architecture diagram tool").version("0.0.0");

program
  .command("serve [dir]")
  .description("Serve .krs files from a local directory with live preview")
  .option("-p, --port <number>", "Port to listen on", "3000")
  .action((dir: string | undefined, options: { port: string }) => {
    const targetDir = dir ?? ".";
    const port = parseInt(options.port, 10);
    serve(targetDir, port);
  });

export { program };

/* v8 ignore next 3 */
if (!process.env.VITEST) {
  program.parse();
}
