import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Parser, applyKrsPatch } from "@karasu-tools/core";

/**
 * Apply stdin .krs content to an existing .krs file.
 *
 * For each top-level block in stdin:
 *   - If a node with the same ID already exists in the target file → replace it
 *   - Otherwise → append it at the end of the file
 *
 * If the target file does not exist, it is created with the stdin content.
 */
export async function apply(targetFile: string): Promise<void> {
  const incoming = await readStdin();

  if (!incoming.trim()) {
    process.stderr.write("Error: stdin is empty — pipe translated .krs content to apply\n");
    process.exit(1);
  }

  const targetPath = resolve(targetFile);
  const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf-8") : "";

  const result = applyIncoming(existing, incoming);
  writeFileSync(targetPath, result, "utf-8");
}

/**
 * Apply incoming .krs blocks to an existing source string.
 * Exported for unit testing.
 */
export function applyIncoming(existing: string, incoming: string): string {
  // Parse the incoming content to find all top-level block IDs
  const incomingParsed = Parser.parse(incoming);
  const incomingTopLevel = [
    ...incomingParsed.value.systems,
    ...incomingParsed.value.services,
    ...incomingParsed.value.domains,
    ...incomingParsed.value.deploys,
  ];

  if (incomingTopLevel.length === 0) {
    // No recognizable top-level nodes — append as-is
    const result = applyKrsPatch(existing, "append", undefined, incoming);
    return result.ok ? result.source : existing;
  }

  // Parse existing file to know which IDs are already present
  const existingParsed = Parser.parse(existing);
  const existingIds = new Set([
    ...existingParsed.value.systems.map((n) => n.id),
    ...existingParsed.value.services.map((n) => n.id),
    ...existingParsed.value.domains.map((n) => n.id),
    ...existingParsed.value.deploys.map((d) => d.id),
  ]);

  // Extract individual top-level blocks from incoming source using loc offsets
  // and apply each one independently
  let current = existing;

  for (const node of incomingTopLevel) {
    const blockContent = incoming.slice(node.loc.start.offset, node.loc.end.offset + 1).trim();

    if (existingIds.has(node.id)) {
      // Replace the existing node
      const replaceResult = applyKrsPatch(current, "replace", node.id, blockContent);
      if (replaceResult.ok) {
        current = replaceResult.source;
      } else {
        process.stderr.write(
          `Warning: could not replace node "${node.id}": ${replaceResult.error}\n`,
        );
      }
    } else {
      // Append as a new top-level block
      const appendResult = applyKrsPatch(current, "append", undefined, blockContent);
      if (appendResult.ok) {
        current = appendResult.source;
        // Track the newly added ID so subsequent blocks don't try to append it again
        existingIds.add(node.id);
      }
    }
  }

  return current;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function readStdin(): Promise<string> {
  return new Promise((done) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      done(data);
    });
  });
}
