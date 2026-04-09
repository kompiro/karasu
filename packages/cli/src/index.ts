#!/usr/bin/env node
import { program } from "commander";
import { serve } from "./serve.js";
import { render } from "./render.js";
import { translate } from "./translate/index.js";

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
  .option(
    "--view <type>",
    "Diagram view to render: system | deploy | org (default: all views bundled)",
  )
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
    render(file, {
      output: options.output,
      view: options.view as "system" | "deploy" | "org" | undefined,
    });
  });

program
  .command("translate <file>")
  .description("Translate an infra config file (docker-compose, k8s) to a deploy.krs scaffold")
  .requiredOption("--from <format>", "Input format: compose | k8s")
  .option("--map <path>", "Path to karasu.map.yaml (default: same directory as input file)")
  .option("-o, --output <path>", "Write .krs to file (default: stdout)")
  .addHelpText(
    "after",
    `
Examples:
  # Translate docker-compose to deploy.krs
  $ karasu translate --from compose docker-compose.yml > deploy.krs

  # Translate a k8s manifest
  $ karasu translate --from k8s manifests/deployment.yaml > deploy.krs

  # Translate multiple k8s files
  $ for f in manifests/*.yaml; do karasu translate --from k8s "$f"; done > deploy.krs

  # Use a shared karasu.map.yaml
  $ karasu translate --from compose docker-compose.yml --map karasu.map.yaml`,
  )
  .action((file: string, options: { from: string; map?: string; output?: string }) => {
    if (options.from !== "compose" && options.from !== "k8s") {
      process.stderr.write(`Error: --from must be "compose" or "k8s"\n`);
      process.exit(1);
    }
    translate(file, { from: options.from, map: options.map, output: options.output });
  });

export { program };

/* v8 ignore next 3 */
if (!process.env.VITEST) {
  program.parse();
}
