/**
 * The parser is checked against bytes, not against a description of bytes.
 *
 * Every fixture here is a real tar built field by field and gzipped with the
 * platform's own `CompressionStream`, so a mistake in the header layout fails
 * here rather than on a live archive. That matters more than usual: this code
 * replaced per-file fetching because of a platform ceiling, and it cannot be
 * exercised against GitHub from the test suite.
 */
import { describe, expect, it } from "vitest";
import { readGzippedArchive, stripArchiveRoot } from "./tar.js";

const BLOCK = 512;
const encoder = new TextEncoder();

function writeString(block: Uint8Array, offset: number, value: string, length: number): void {
  block.set(encoder.encode(value).subarray(0, length), offset);
}

/** One ustar header plus its padded data. */
function entry(
  path: string,
  content: string,
  options: { typeFlag?: string; prefix?: string } = {},
): Uint8Array {
  const data = encoder.encode(content);
  const header = new Uint8Array(BLOCK);
  writeString(header, 0, path, 100);
  writeString(header, 100, "0000644\0", 8); // mode
  writeString(header, 108, "0000000\0", 8); // uid
  writeString(header, 116, "0000000\0", 8); // gid
  writeString(header, 124, `${data.length.toString(8).padStart(11, "0")}\0`, 12);
  writeString(header, 136, "00000000000\0", 12); // mtime
  header[156] = (options.typeFlag ?? "0").charCodeAt(0);
  writeString(header, 257, "ustar\0", 6);
  writeString(header, 263, "00", 2);
  if (options.prefix !== undefined) writeString(header, 345, options.prefix, 155);

  // Checksum: sum of all bytes with the checksum field read as spaces.
  header.fill(32, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  writeString(header, 148, `${sum.toString(8).padStart(6, "0")}\0 `, 8);

  const padded = Math.ceil(data.length / BLOCK) * BLOCK;
  const out = new Uint8Array(BLOCK + padded);
  out.set(header);
  out.set(data, BLOCK);
  return out;
}

function archive(...parts: Uint8Array[]): Uint8Array {
  const end = new Uint8Array(BLOCK * 2); // two zero blocks terminate a tar
  const total = [...parts, end].reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...parts, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Gzip through the same implementation the Worker decompresses with. */
function gzipped(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
}

const readAll = { accept: () => "read" as const, maxFiles: 100, maxTotalBytes: 1_000_000 };

describe("readGzippedArchive", () => {
  it("reads files out of a gzipped tar", async () => {
    const result = await readGzippedArchive(
      gzipped(
        archive(
          entry("library-abc123/src/Book.java", "class Book {}\n"),
          entry("library-abc123/README.md", "# Library\n"),
        ),
      ),
      readAll,
    );

    expect(result.files).toEqual([
      { path: "src/Book.java", content: "class Book {}\n" },
      { path: "README.md", content: "# Library\n" },
    ]);
    expect(result.truncated).toBe(false);
  });

  it("strips GitHub's archive root so paths match the rest of the pipeline", () => {
    // `SKIPPED_PATH` and the model both see repository-relative paths.
    expect(stripArchiveRoot("library-abc123/src/Book.java")).toBe("src/Book.java");
    expect(stripArchiveRoot("noslash")).toBe("");
  });

  it("skips an entry without turning its bytes into a string", async () => {
    // The point of `accept` is memory: a 10 MB binary must not be decoded
    // just to be discarded.
    const seen: string[] = [];
    const result = await readGzippedArchive(
      gzipped(
        archive(entry("r-1/logo.png", "binary"), entry("r-1/src/a.ts", "export const a = 1;\n")),
      ),
      {
        ...readAll,
        accept: ({ path }) => {
          seen.push(path);
          return path.endsWith(".png") ? "skip" : "read";
        },
      },
    );

    expect(seen).toEqual(["logo.png", "src/a.ts"]);
    expect(result.files.map((file) => file.path)).toEqual(["src/a.ts"]);
  });

  it("keeps reading past a skipped entry of awkward length", async () => {
    // A skipped entry has to advance by its *padded* length or every
    // subsequent header lands mid-block and the archive reads as garbage.
    const result = await readGzippedArchive(
      gzipped(
        archive(
          entry("r-1/skip.bin", "x".repeat(1000)),
          entry("r-1/after.ts", "export const after = 1;\n"),
        ),
      ),
      { ...readAll, accept: ({ path }) => (path === "skip.bin" ? "skip" : "read") },
    );
    expect(result.files).toEqual([{ path: "after.ts", content: "export const after = 1;\n" }]);
  });

  it("handles a file whose length is an exact multiple of the block size", async () => {
    const content = "x".repeat(BLOCK);
    const result = await readGzippedArchive(
      gzipped(archive(entry("r-1/exact.txt", content), entry("r-1/next.txt", "next\n"))),
      readAll,
    );
    expect(result.files).toEqual([
      { path: "exact.txt", content },
      { path: "next.txt", content: "next\n" },
    ]);
  });

  it("reassembles a long path from the ustar prefix field", async () => {
    const result = await readGzippedArchive(
      gzipped(
        archive(
          entry("Book.java", "class Book {}\n", { prefix: "r-1/src/main/java/io/example/domain" }),
        ),
      ),
      readAll,
    );
    expect(result.files[0]?.path).toBe("src/main/java/io/example/domain/Book.java");
  });

  it("takes a GNU long name from the entry that precedes the file", async () => {
    const long = `r-1/${"deep/".repeat(30)}Name.java`;
    const result = await readGzippedArchive(
      gzipped(
        archive(
          entry("././@LongLink", `${long}\0`, { typeFlag: "L" }),
          entry("r-1/truncated", "class Deep {}\n"),
        ),
      ),
      readAll,
    );
    expect(result.files[0]?.path).toBe(long.slice("r-1/".length));
  });

  it("takes a PAX path override", async () => {
    const long = "r-1/src/very/long/path/Name.java";
    const record = `${`path=${long}\n`.length + 4} path=${long}\n`;
    const result = await readGzippedArchive(
      gzipped(
        archive(entry("PaxHeader", record, { typeFlag: "x" }), entry("r-1/short", "class X {}\n")),
      ),
      readAll,
    );
    expect(result.files[0]?.path).toBe("src/very/long/path/Name.java");
  });

  it("ignores directories, links and anything that is not a regular file", async () => {
    const result = await readGzippedArchive(
      gzipped(
        archive(
          entry("r-1/src/", "", { typeFlag: "5" }),
          entry("r-1/link", "target", { typeFlag: "2" }),
          entry("r-1/real.ts", "export const real = 1;\n"),
        ),
      ),
      readAll,
    );
    expect(result.files.map((file) => file.path)).toEqual(["real.ts"]);
  });

  it("stops at the file cap and says it stopped", async () => {
    const result = await readGzippedArchive(
      gzipped(archive(entry("r-1/a.ts", "a"), entry("r-1/b.ts", "b"), entry("r-1/c.ts", "c"))),
      { ...readAll, maxFiles: 2 },
    );
    expect(result.files.map((file) => file.path)).toEqual(["a.ts", "b.ts"]);
    expect(result.truncated).toBe(true);
  });

  it("stops at the byte cap, which is what bounds a Worker's memory", async () => {
    const result = await readGzippedArchive(
      gzipped(archive(entry("r-1/a.ts", "x".repeat(600)), entry("r-1/b.ts", "y".repeat(600)))),
      { ...readAll, maxTotalBytes: 1000 },
    );
    expect(result.files.map((file) => file.path)).toEqual(["a.ts"]);
    expect(result.truncated).toBe(true);
  });

  it("survives an archive that ends without its terminator blocks", async () => {
    // A stream cut short must yield what it read rather than hanging or
    // throwing -- a partial reverse is worse than none, but a crash is worse
    // than both.
    const bytes = archive(entry("r-1/a.ts", "export const a = 1;\n"));
    const result = await readGzippedArchive(
      gzipped(bytes.subarray(0, bytes.length - BLOCK * 2)),
      readAll,
    );
    expect(result.files.map((file) => file.path)).toEqual(["a.ts"]);
  });

  it("reads an empty archive as no files rather than an error", async () => {
    const result = await readGzippedArchive(gzipped(archive()), readAll);
    expect(result).toEqual({ files: [], truncated: false });
  });

  it("decodes UTF-8, so a Japanese identifier survives", async () => {
    const content = "// 貸出ドメイン\nclass 貸出 {}\n";
    const result = await readGzippedArchive(
      gzipped(archive(entry("r-1/src/貸出.java", content))),
      readAll,
    );
    expect(result.files[0]).toEqual({ path: "src/貸出.java", content });
  });
});
