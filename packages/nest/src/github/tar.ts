/**
 * Just enough tar to read a repository archive.
 *
 * The reason this exists is a platform ceiling, not a preference. Fetching a
 * repository file by file costs one subrequest per file, and Workers caps
 * subrequests per invocation (50 on the free plan, 1000 on paid). An 85-file
 * repository blew the free cap partway through and the generation died with
 * `Too many subrequests by single Worker invocation` — the same class of
 * mistake TPL-2288 records, applied to the biggest consumer in the system.
 *
 * `GET /repos/{owner}/{repo}/tarball/{ref}` brings the whole repository in one
 * request. That turns `N + 12` subrequests into about 13 regardless of size.
 *
 * The obvious alternative — splitting the fetch across Workflow steps, which
 * would reset the budget each step — is **not available here.** Step results
 * are checkpointed, so file contents would be persisted to Workflow storage,
 * and ADR-1990 decision 6 says raw source is never stored. The archive stays
 * inside one invocation's memory and never crosses a step boundary.
 *
 * Only the parts of the format a `git archive` tarball actually uses are
 * implemented: ustar headers, the `prefix` field for long paths, GNU `L`
 * long-name entries, and PAX `path=` overrides. Anything else is skipped
 * rather than guessed at.
 */

/** Every tar structure is a multiple of this. */
const BLOCK = 512;

export interface TarEntry {
  path: string;
  size: number;
}

/** What the caller decides about an entry before its bytes are read. */
export type TarEntryDecision = "read" | "skip";

export interface ReadArchiveOptions {
  /** Called before an entry's data is touched. `skip` costs no memory. */
  accept: (entry: TarEntry) => TarEntryDecision;
  /** Stop after this many accepted files. */
  maxFiles: number;
  /** Stop once accepted contents reach this many bytes. */
  maxTotalBytes: number;
}

export interface ReadArchiveResult {
  files: { path: string; content: string }[];
  /** True when a cap stopped the read before the archive ended. */
  truncated: boolean;
}

function readString(block: Uint8Array, start: number, length: number): string {
  const slice = block.subarray(start, start + length);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end === -1 ? slice : slice.subarray(0, end)).trim();
}

/** Sizes are octal text. An unparseable one is treated as zero, not as huge. */
function readOctal(block: Uint8Array, start: number, length: number): number {
  const text = readString(block, start, length).replace(/[^0-7]/g, "");
  if (text.length === 0) return 0;
  const value = Number.parseInt(text, 8);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function isZeroBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

/**
 * The path GitHub puts every file under: `<repo>-<sha>/…`.
 *
 * Stripped so paths match what the rest of the pipeline expects — the same
 * strings `SKIPPED_PATH` matches on and the model is shown.
 */
export function stripArchiveRoot(path: string): string {
  const cut = path.indexOf("/");
  return cut === -1 ? "" : path.slice(cut + 1);
}

/** `path=` out of a PAX header's `<len> key=value\n` records. */
function paxPath(data: Uint8Array): string | undefined {
  const text = new TextDecoder().decode(data);
  const match = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(text);
  return match?.[1];
}

/**
 * Read a gzipped tar stream, keeping only what `accept` asks for.
 *
 * Decompression is the platform's (`DecompressionStream`), so nothing here
 * has to know about gzip. Entries stream past; a skipped one never becomes a
 * string, which is what keeps a large repository inside a Worker's memory.
 */
export async function readGzippedArchive(
  body: ReadableStream<Uint8Array>,
  options: ReadArchiveOptions,
): Promise<ReadArchiveResult> {
  // Cast because the DOM lib types `DecompressionStream` over a generic
  // `BufferSource` while the stream is `Uint8Array`; the runtime pairing is
  // exact, and `packages/nest` deliberately compiles without Workers types.
  const decompressed = body.pipeThrough(
    new DecompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  );
  const reader = decompressed.getReader();
  const files: { path: string; content: string }[] = [];
  let truncated = false;
  let totalBytes = 0;

  // A rolling buffer, because tar structures do not align with stream chunks.
  let buffer = new Uint8Array(0);
  let done = false;

  const pull = async (): Promise<boolean> => {
    const next = await reader.read();
    if (next.done) return false;
    const merged = new Uint8Array(buffer.length + next.value.length);
    merged.set(buffer);
    merged.set(next.value, buffer.length);
    buffer = merged;
    return true;
  };

  /** Ensure at least `n` bytes are buffered, or report the stream ended. */
  const ensure = async (n: number): Promise<boolean> => {
    while (buffer.length < n) {
      if (!(await pull())) return false;
    }
    return true;
  };

  const take = (n: number): Uint8Array => {
    const taken = buffer.subarray(0, n);
    buffer = buffer.subarray(n);
    return taken;
  };

  // Carried from a GNU `L` entry or a PAX header to the entry that follows.
  let pendingLongName: string | undefined;
  let zeroBlocks = 0;

  try {
    while (!done) {
      if (!(await ensure(BLOCK))) break;
      const header = take(BLOCK);

      if (isZeroBlock(header)) {
        // Two in a row end the archive; one alone is padding.
        zeroBlocks += 1;
        if (zeroBlocks >= 2) break;
        continue;
      }
      zeroBlocks = 0;

      const name = readString(header, 0, 100);
      const size = readOctal(header, 124, 12);
      const typeFlag = String.fromCharCode(header[156] ?? 0);
      const prefix = readString(header, 345, 155);
      const padded = Math.ceil(size / BLOCK) * BLOCK;

      const readData = async (): Promise<Uint8Array | undefined> => {
        if (!(await ensure(padded))) return undefined;
        return take(padded).subarray(0, size);
      };

      // Metadata entries name the *next* entry rather than carrying content.
      if (typeFlag === "L") {
        const data = await readData();
        if (data === undefined) break;
        // Trailing NULs trimmed by index rather than by pattern: a control
        // character inside a regex literal reads as a typo to every later
        // reader, and to the linter.
        const decoded = new TextDecoder().decode(data);
        let end = decoded.length;
        while (end > 0 && decoded.charCodeAt(end - 1) === 0) end -= 1;
        pendingLongName = decoded.slice(0, end);
        continue;
      }
      if (typeFlag === "x" || typeFlag === "g") {
        const data = await readData();
        if (data === undefined) break;
        pendingLongName = paxPath(data) ?? pendingLongName;
        continue;
      }

      const full = pendingLongName ?? (prefix.length > 0 ? `${prefix}/${name}` : name);
      pendingLongName = undefined;

      // Regular files only. `0` and NUL both mean one; everything else is a
      // directory, link, device or something this has no use for.
      const isFile = typeFlag === "0" || typeFlag === "\0";
      const path = stripArchiveRoot(full);
      const wanted = isFile && path.length > 0 && options.accept({ path, size }) === "read";

      if (!wanted) {
        if (!(await ensure(padded))) break;
        take(padded);
        continue;
      }

      if (files.length >= options.maxFiles || totalBytes + size > options.maxTotalBytes) {
        // Stop reading rather than skipping ahead: past a cap there is nothing
        // more this run will use, and the rest of the archive is bandwidth.
        truncated = true;
        done = true;
        break;
      }

      const data = await readData();
      if (data === undefined) break;
      files.push({ path, content: new TextDecoder().decode(data) });
      totalBytes += size;
    }
  } finally {
    await reader.cancel().catch(() => {
      // The stream is being abandoned deliberately; a cancel that fails
      // changes nothing about the files already read.
    });
  }

  return { files, truncated };
}
