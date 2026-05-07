#!/usr/bin/env node
import { program } from "commander";
import { serve } from "./serve.js";
import { render } from "./render.js";
import { translate } from "./translate/index.js";
import { apply } from "./apply.js";
import { append } from "./append.js";
import { remove } from "./remove.js";
import { insert } from "./insert.js";
import { fmt } from "./fmt.js";
import { diff } from "./diff.js";
import { matrix } from "./matrix.js";

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
  .description("Render a .krs file to SVG or draw.io (mxGraph XML)")
  .option("-o, --output <path>", "Write output to file (default: stdout)")
  .option(
    "--view <type>",
    "Diagram view to render: system | deploy | org (default: all views bundled)",
  )
  .option(
    "--format <format>",
    "Output format: svg | drawio (default: svg). drawio emits one page per view and per system drill-down level.",
    "svg",
  )
  .option(
    "--include-matrix",
    "Also write a CRUD matrix SVG (<output-stem>.matrix.svg) alongside --output. Requires --format svg and --output.",
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
  $ karasu render index.krs --view org --output org.svg

  # Export to draw.io (mxGraph XML) as a layout escape hatch
  $ karasu render index.krs --format drawio --output arch.drawio
  $ karasu render index.krs --format drawio --view system --output system.drawio`,
  )
  .action(
    (
      file: string,
      options: { output?: string; view?: string; format?: string; includeMatrix?: boolean },
    ) => {
      if (options.format && options.format !== "svg" && options.format !== "drawio") {
        process.stderr.write(
          `Error: unknown --format "${options.format}" (expected svg | drawio)\n`,
        );
        process.exit(1);
      }
      render(file, {
        output: options.output,
        view: options.view as "system" | "deploy" | "org" | undefined,
        format: options.format as "svg" | "drawio" | undefined,
        includeMatrix: options.includeMatrix,
      });
    },
  );

program
  .command("translate <file>")
  .description(
    "Translate an infra config or API spec file to a .krs scaffold (deploy, service, or database block)",
  )
  .requiredOption("--from <format>", "Input format: compose | k8s | openapi | db")
  .option("--map <path>", "Path to karasu.map.yaml (default: same directory as input file)")
  .option("--service <name>", "Service name for openapi format (default: derived from info.title)")
  .option("--database <name>", "Database name for db format (default: derived from file name)")
  .option(
    "--granularity <mode>",
    "Emission granularity. openapi: resource | operation (default: resource). db: aggregate | table (default: aggregate).",
  )
  .option(
    "--emit-bindings",
    "Emit usecase → resource bindings (openapi: resource granularity, db: aggregate granularity only)",
  )
  .option(
    "--emit-crud-decoration",
    "Decorate emitted operations with <verb>:<crud> (ADR-20260503-01). Implies --emit-bindings.",
  )
  .option("--system <name>", "Wrap emitted blocks in `system <name> { ... }` (openapi / db only)")
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
  $ karasu translate --from compose docker-compose.yml --map karasu.map.yaml

  # Translate OpenAPI spec — operations grouped per resource (default)
  $ karasu translate --from openapi api.yaml --service ECommerce >> ecommerce.krs

  # Emit one usecase per HTTP operation instead of grouping
  $ karasu translate --from openapi api.yaml --granularity operation >> api.krs

  # Translate DB schema — related tables folded into their aggregate root (default)
  $ karasu translate --from db schema.sql --database OrderDB >> resources.krs

  # Emit one table entry per SQL table instead of folding
  $ karasu translate --from db schema.sql --granularity table >> resources.krs

  # Wrap output in a logical system block (openapi / db only)
  $ karasu translate --from openapi orders.yaml  --system Orders  > out.krs
  $ karasu translate --from openapi billing.yaml --system Billing >> out.krs`,
  )
  .action(
    (
      file: string,
      options: {
        from: string;
        map?: string;
        output?: string;
        service?: string;
        database?: string;
        granularity?: string;
        emitBindings?: boolean;
        emitCrudDecoration?: boolean;
        system?: string;
      },
    ) => {
      if (
        options.from !== "compose" &&
        options.from !== "k8s" &&
        options.from !== "openapi" &&
        options.from !== "db"
      ) {
        process.stderr.write(`Error: --from must be "compose", "k8s", "openapi", or "db"\n`);
        process.exit(1);
      }
      let granularity: "resource" | "operation" | "aggregate" | "table" | undefined;
      if (options.granularity === undefined) {
        granularity = undefined;
      } else if (options.from === "openapi") {
        if (options.granularity === "resource" || options.granularity === "operation") {
          granularity = options.granularity;
        } else {
          process.stderr.write(
            `Error: --granularity for --from openapi must be "resource" or "operation"\n`,
          );
          process.exit(1);
        }
      } else if (options.from === "db") {
        if (options.granularity === "aggregate" || options.granularity === "table") {
          granularity = options.granularity;
        } else {
          process.stderr.write(
            `Error: --granularity for --from db must be "aggregate" or "table"\n`,
          );
          process.exit(1);
        }
      } else {
        process.stderr.write(
          `Error: --granularity is only valid with --from openapi or --from db\n`,
        );
        process.exit(1);
      }
      let emitBindings = options.emitBindings ?? false;
      let emitCrudDecoration = options.emitCrudDecoration ?? false;
      if (emitCrudDecoration) emitBindings = true;
      if (emitBindings || emitCrudDecoration) {
        if (options.from !== "openapi" && options.from !== "db") {
          process.stderr.write(
            `Warning: --emit-bindings / --emit-crud-decoration are only supported with --from openapi or --from db; ignoring.\n`,
          );
          emitBindings = false;
          emitCrudDecoration = false;
        } else if (granularity === "operation" || granularity === "table") {
          process.stderr.write(
            `Warning: --emit-bindings / --emit-crud-decoration are ignored with --granularity ${granularity}.\n`,
          );
          emitBindings = false;
          emitCrudDecoration = false;
        }
      }
      let system: string | undefined = options.system;
      if (system !== undefined) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(system)) {
          process.stderr.write(
            `Error: --system value "${system}" is not a valid identifier (expected [A-Za-z_][A-Za-z0-9_]*)\n`,
          );
          process.exit(1);
        }
      }
      translate(file, {
        from: options.from,
        map: options.map,
        output: options.output,
        service: options.service,
        database: options.database,
        granularity,
        emitBindings,
        emitCrudDecoration,
        system,
      });
    },
  );

program
  .command("append <file>")
  .description(
    "Append piped .krs content from stdin as a new top-level block at the end of a .krs file. " +
      "Creates the file if it does not exist.",
  )
  .addHelpText(
    "after",
    `
Examples:
  # Append a new service block
  $ echo 'service NewService { label: "New Service" }' | karasu append arch.krs

  # Append a multi-line block via HEREDOC
  $ cat <<'EOF' | karasu append arch.krs
  service NewService {
    usecase Foo {}
  }
  EOF

  # Create a new file from a hand-written snippet
  $ echo 'system ECommerce {}' | karasu append arch.krs`,
  )
  .action((file: string) => {
    append(file);
  });

program
  .command("apply <file>")
  .description(
    "Apply piped .krs content from stdin to an existing .krs file. " +
      "Replaces a node if its ID already exists in the file, otherwise appends it.",
  )
  .addHelpText(
    "after",
    `
Examples:
  # Translate and apply to an existing file (replace if node exists, append otherwise)
  $ karasu translate --from compose docker-compose.yml | karasu apply deploy.krs

  # Apply a hand-written snippet
  $ echo 'service NewService { label: "New" }' | karasu apply arch.krs

  # Create a new file from translate output
  $ karasu translate --from k8s manifests/deployment.yaml | karasu apply deploy.krs`,
  )
  .action((file: string) => {
    apply(file);
  });

program
  .command("remove <node-id> <file>")
  .description("Remove a node with the given ID from a .krs file in-place")
  .addHelpText(
    "after",
    `
Examples:
  # Remove the DeployFoo node from deploy.krs
  $ karasu remove DeployFoo deploy.krs

  # Remove a service from arch.krs
  $ karasu remove PaymentService arch.krs`,
  )
  .action((nodeId: string, file: string) => {
    remove(nodeId, file);
  });

program
  .command("insert <parent-id> <file>")
  .description(
    "Insert piped .krs content from stdin as the last child of a node in a .krs file. " +
      "Indentation is applied automatically based on the parent node's depth.",
  )
  .addHelpText(
    "after",
    `
Examples:
  # Add a service as a child of system ECommerce
  $ echo 'service NewService { label: "New" }' | karasu insert ECommerce arch.krs

  # Insert a multi-line block via HEREDOC
  $ cat <<'EOF' | karasu insert ECommerce arch.krs
  service NewService {
    usecase Foo {}
  }
  EOF`,
  )
  .action((parentId: string, file: string) => {
    insert(parentId, file);
  });

program
  .command("diff <before> <after>")
  .description(
    "Render a diff SVG between two .krs entries (added/removed/changed nodes and edges). " +
      "Either argument may be `-` to read that side from stdin.",
  )
  .option("-o, --output <path>", "Write SVG to file (default: stdout)")
  .option("--view <type>", "Diagram view: system | deploy | org (default: bundled all views)")
  .addHelpText(
    "after",
    `
By default emits a bundled SVG containing every applicable view (system /
deploy / org) with CSS-only tab navigation, intended for full-document
review. Use \`--view\` to emit a single-view SVG instead.

Examples:
  # Diff two committed revisions piped from git (bundled all views)
  $ git show HEAD~1:src/system.krs | karasu diff - src/system.krs > diff.svg

  # Diff two files on disk, deploy view only
  $ karasu diff old.krs new.krs --view deploy --output deploy.svg

  # Use as a custom git diff driver (renders the SVG to stdout per file).
  # Add to .gitconfig:
  #   [diff "krs"]
  #     textconv = karasu render
  #     binary  = false
  # Or, for a graphical diff between revisions, configure an external diff
  # script that calls \`karasu diff "$2" "$5"\` (git's external diff slots
  # for the before / after path).`,
  )
  .action((before: string, after: string, options: { output?: string; view?: string }) => {
    const view = options.view;
    if (view !== undefined && view !== "system" && view !== "deploy" && view !== "org") {
      process.stderr.write(`Error: unknown --view "${view}" (expected system | deploy | org)\n`);
      process.exit(1);
    }
    diff(before, after, {
      output: options.output,
      view: view as "system" | "deploy" | "org" | undefined,
    });
  });

program
  .command("fmt [files...]")
  .description("Format .krs files in-place")
  .option("--check", "Exit 1 if any file would be reformatted (no files are changed)")
  .option("--stdin", "Read from stdin, write formatted output to stdout")
  .addHelpText(
    "after",
    `
Examples:
  # Format all .krs files under the current directory
  $ karasu fmt

  # Format specific files
  $ karasu fmt index.krs deploy.krs

  # CI check (exit 1 if any file would change)
  $ karasu fmt --check

  # Pipe via stdin
  $ cat index.krs | karasu fmt --stdin`,
  )
  .action((files: string[], options: { check?: boolean; stdin?: boolean }) => {
    fmt(files, { check: options.check, stdin: options.stdin });
  });

program
  .command("matrix <file>")
  .description("Render a usecase × resource CRUD matrix from a .krs project")
  .option("-o, --output <path>", "Write output to file (default: stdout)")
  .option("--format <format>", "Output format: md | csv | svg (default: md)", "md")
  .option(
    "--service <name>",
    "Restrict rows to usecases inside the named service (repeatable)",
    (value: string, prev: string[] | undefined) => [...(prev ?? []), value],
  )
  .option(
    "--infra <kind>",
    "Restrict columns to the named infra kind: database | queue | storage (repeatable)",
    (value: string, prev: string[] | undefined) => [...(prev ?? []), value],
  )
  .option("--external", "Show only [external] resources")
  .option("--no-external", "Hide [external] resources")
  .option("--writes-only", "Drop read-only cells (and any rows/columns left empty)")
  .option("--omit-empty", "Drop rows/columns with no cells (default: show all)")
  .option("--no-totals", "Hide row/column ΣC/ΣR/ΣU/ΣD totals (default: show)")
  .addHelpText(
    "after",
    `
Examples:
  # Markdown to terminal (default)
  $ karasu matrix index.krs

  # CSV for spreadsheet / CI snapshot
  $ karasu matrix index.krs --format csv -o matrix.csv

  # SVG for documentation
  $ karasu matrix index.krs --format svg -o matrix.svg

  # Filter to one service and database resources only
  $ karasu matrix index.krs --service Catalog --infra database`,
  )
  .action((file: string, options) => {
    matrix(file, {
      output: options.output,
      format: options.format,
      service: options.service,
      infra: options.infra,
      external: options.external === true,
      noExternal: options.external === false,
      writesOnly: options.writesOnly,
      omitEmpty: options.omitEmpty,
      noTotals: options.totals === false,
    });
  });

export { program };

/* v8 ignore next 5 */
if (!process.env.VITEST) {
  program.parseAsync().catch((err: unknown) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
