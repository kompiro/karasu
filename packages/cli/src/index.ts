#!/usr/bin/env node
import { program } from "commander";
import { serve } from "./serve.js";
import { render } from "./render.js";

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

program
  .command("render <file>")
  .description("Render a .krs file to SVG")
  .option("-o, --output <path>", "Write SVG to file (default: stdout)")
  .option("--view <type>", "Diagram view to render: system | deploy | org (default: all views bundled)")
  .addHelpText(
    "after",
    `
Examples:
  # Pipe to stdout and redirect to file
  $ karasu render index.krs > docs/arch.svg

  # Optimize SVG with svgo via pipe (no temp file needed)
  $ karasu render index.krs | svgo - -o docs/arch.svg

  # Write directly to file
  $ karasu render index.krs --output docs/arch.svg

  # Render a specific view
  $ karasu render index.krs --view deploy --output deploy.svg
  $ karasu render index.krs --view org --output org.svg`,
  )
  .action((file: string, options: { output?: string; view?: string }) => {
    render(file, { output: options.output, view: options.view as "system" | "deploy" | "org" | undefined });
  });

export { program };

/* v8 ignore next 3 */
if (!process.env.VITEST) {
  program.parse();
}
