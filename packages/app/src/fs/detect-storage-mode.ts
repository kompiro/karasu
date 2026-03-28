type StorageMode = "opfs" | "memory";
export type AppMode = StorageMode | "serve";

/** OPFS の利用可否を判定し、ストレージモードを返す。
 *  URLパラメータ `?mode=memory` で強制的にメモリモードに切り替えられる。 */
function detectStorageMode(): StorageMode {
  try {
    if (
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).get("mode") === "memory"
    ) {
      return "memory";
    }
    return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function"
      ? "opfs"
      : "memory";
  } catch {
    return "memory";
  }
}

/**
 * /api/files へのアクセス可否で serve モードを判定する。
 * CLI サーバーが起動している場合は "serve"、そうでなければ OPFS/memory 判定に委譲する。
 */
export async function detectAppMode(): Promise<AppMode> {
  try {
    const res = await fetch("/api/files", {
      signal: AbortSignal.timeout(200),
    });
    if (res.ok) return "serve";
  } catch {
    // fallthrough
  }
  return detectStorageMode();
}
