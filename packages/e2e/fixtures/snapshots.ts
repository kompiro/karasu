import type { OpfsFixture } from "./opfs.js";

/**
 * OPFS history snapshots (Issue #740) as the app stores them:
 *
 *   /projects/<pid>/.snapshots/<relPath>/index.json
 *   /projects/<pid>/.snapshots/<relPath>/<id>.krs
 *
 * Mirrors `SnapshotRecord` / `SnapshotIndex` in
 * `packages/app/src/fs/snapshot-manager.ts`. The e2e package does not import
 * app code, so the shape is restated here; a drift in the on-disk format
 * fails the AT-0060 spec that reads it back.
 */
export type SnapshotTrigger = "auto" | "manual";

export type SnapshotRecord = {
  id: string;
  filePath: string;
  createdAt: string;
  label?: string;
  trigger: SnapshotTrigger;
  sizeBytes: number;
  contentHash: string;
};

type SnapshotIndex = { version: 1; records: SnapshotRecord[] };

export type SnapshotSeed = {
  trigger: SnapshotTrigger;
  /** Content of `<id>.krs`. Default: a one-line placeholder naming the record. */
  content?: string;
  label?: string;
};

/** Seeded records start here, one minute apart — always older than "now". */
const SEED_EPOCH_MS = Date.UTC(2020, 0, 1);

/**
 * Build the `files` entries that materialize `seeds` as snapshots of
 * `relPath`, for merging into an `opfs.seed` project's `files` map (nested
 * paths are created by the fixture). Records are dated in `seeds` order, so
 * `seeds[0]` is the oldest.
 *
 * `contentHash` is a non-hex placeholder: the app's FNV-1a hash is 8 hex
 * digits, so a seeded record can never make a later auto capture look like a
 * duplicate and be skipped.
 */
export function seedSnapshotRecords(
  relPath: string,
  seeds: SnapshotSeed[],
): { files: Record<string, string>; records: SnapshotRecord[] } {
  const dir = `.snapshots/${relPath}`;
  const files: Record<string, string> = {};
  const records = seeds.map((seed, i): SnapshotRecord => {
    const id = `seeded-${seed.trigger}-${i}`;
    const content = seed.content ?? `// ${id}\n`;
    files[`${dir}/${id}.krs`] = content;
    return {
      id,
      filePath: relPath,
      createdAt: new Date(SEED_EPOCH_MS + i * 60_000).toISOString(),
      ...(seed.label === undefined ? {} : { label: seed.label }),
      trigger: seed.trigger,
      sizeBytes: content.length,
      contentHash: `seeded-${i}`,
    };
  });
  const index: SnapshotIndex = { version: 1, records };
  files[`${dir}/index.json`] = JSON.stringify(index, null, 2);
  return { files, records };
}

/** OPFS path of the snapshot directory for `relPath` in project `pid`. */
export function snapshotDir(pid: string, relPath: string): string {
  return `/projects/${pid}/.snapshots/${relPath}`;
}

/**
 * Read the snapshot index of `relPath` in project `pid`. Returns the records
 * in stored order, or `null` when no index exists yet.
 *
 * The app's first write of `index.json` creates the file (empty) before the
 * writable commits its content on `close()`, so a poll can observe `""` in
 * between. That is "not written yet", not a corrupt index.
 */
export async function readSnapshotIndex(
  opfs: OpfsFixture,
  pid: string,
  relPath: string,
): Promise<SnapshotRecord[] | null> {
  const raw = await opfs.read(`${snapshotDir(pid, relPath)}/index.json`);
  if (raw === null || raw === "") return null;
  return (JSON.parse(raw) as SnapshotIndex).records;
}

/** Read the stored content of one snapshot, or `null` when it is gone. */
export function readSnapshotContent(
  opfs: OpfsFixture,
  pid: string,
  relPath: string,
  id: string,
): Promise<string | null> {
  return opfs.read(`${snapshotDir(pid, relPath)}/${id}.krs`);
}
