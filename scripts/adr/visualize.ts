/* eslint-disable no-console -- CLI entry point; stdout/stderr reporting is the whole job */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AdrConfigInvalidError, AdrConfigMissingError, loadConfig } from "./config.ts";
import { closure, effectiveSet, loadParsed, scopeSlice } from "./extractor.ts";
import { listTopics, renderMarkdown, renderOverview, renderTopicMarkdown } from "./visualizer.ts";

interface CliArgs {
  mode: "all" | "effective" | "slice" | "closure" | "topic" | "write-all";
  dir: string;
  outDir: string;
  packages: string[];
  concerns: string[];
  adrId: string | null;
  topic: string | null;
}

function parseArgs(argv: string[], defaultDir: string): CliArgs | { error: string } {
  const args = argv.slice(2);
  let mode: CliArgs["mode"] = "all";
  let dir = defaultDir;
  let outDir = defaultDir;
  const packages: string[] = [];
  const concerns: string[] = [];
  let adrId: string | null = null;
  let topic: string | null = null;

  for (const raw of args) {
    if (raw === "--effective") {
      mode = "effective";
    } else if (raw.startsWith("--dir=")) {
      dir = raw.slice("--dir=".length);
    } else if (raw.startsWith("--out-dir=")) {
      outDir = raw.slice("--out-dir=".length);
    } else if (raw.startsWith("--package=")) {
      mode = "slice";
      packages.push(...raw.slice("--package=".length).split(",").filter(Boolean));
    } else if (raw.startsWith("--concern=")) {
      mode = "slice";
      concerns.push(...raw.slice("--concern=".length).split(",").filter(Boolean));
    } else if (raw.startsWith("--closure=")) {
      mode = "closure";
      adrId = raw.slice("--closure=".length);
    } else if (raw.startsWith("--topic=")) {
      mode = "topic";
      topic = raw.slice("--topic=".length);
    } else if (raw === "--write-all") {
      mode = "write-all";
    } else if (raw === "--help" || raw === "-h") {
      return {
        error: `usage: visualize.ts [options]
  (no flags)             — topic-grouped overview to stdout
  --topic=<slug>         — single topic detail (with ghost nodes)
  --effective            — limit to ADRs with status=accepted and no superseded_by
  --package=X --concern=Y — limit to scope slice + transitive depends_on
  --closure=ADR-X        — limit to one ADR and its transitive depends_on
  --write-all            — regenerate docs/adr/graph.md and docs/adr/graph/<topic>.md

Options:
  --dir=<path>           default: docs/adr
  --out-dir=<path>       default: docs/adr (only used by --write-all)`,
      };
    } else {
      return { error: `unknown option: ${raw}` };
    }
  }

  if (mode === "closure" && adrId === null) {
    return { error: "--closure requires an ADR id" };
  }
  if (mode === "topic" && topic === null) {
    return { error: "--topic requires a topic slug" };
  }

  return { mode, dir, outDir, packages, concerns, adrId, topic };
}

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
  const parsed = parseArgs(argv, config.paths.adrDir);
  if ("error" in parsed) {
    console.error(parsed.error);
    return 2;
  }
  const all = loadParsed(parsed.dir, config);
  try {
    if (parsed.mode === "write-all") {
      const { graph, graphByTopic } = config.paths.outputs;
      const topicDir = graphByTopic.endsWith("/") ? graphByTopic.slice(0, -1) : graphByTopic;
      const fullTopicDir = join(parsed.outDir, topicDir);
      mkdirSync(fullTopicDir, { recursive: true });
      writeFileSync(join(parsed.outDir, graph), renderOverview(all));
      const written: string[] = [graph];
      for (const t of listTopics(all)) {
        writeFileSync(join(fullTopicDir, `${t}.md`), renderTopicMarkdown(all, t));
        written.push(`${topicDir}/${t}.md`);
      }
      process.stderr.write(`wrote ${written.length} file(s) under ${parsed.outDir}/\n`);
      for (const w of written) process.stderr.write(`  ${w}\n`);
      return 0;
    }

    if (parsed.mode === "all") {
      process.stdout.write(renderOverview(all));
      return 0;
    }
    if (parsed.mode === "topic") {
      process.stdout.write(renderTopicMarkdown(all, parsed.topic!));
      return 0;
    }

    let subset;
    if (parsed.mode === "effective") {
      subset = effectiveSet(all);
    } else if (parsed.mode === "slice") {
      subset = scopeSlice(all, { packages: parsed.packages, concerns: parsed.concerns });
    } else {
      subset = closure(all, parsed.adrId!);
    }
    process.stdout.write(renderMarkdown(subset));
    return 0;
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv));
}
