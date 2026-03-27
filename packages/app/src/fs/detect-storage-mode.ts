export type StorageMode = "opfs" | "memory";

/** OPFS の利用可否を判定し、ストレージモードを返す。
 *  URLパラメータ `?mode=memory` で強制的にメモリモードに切り替えられる。 */
export function detectStorageMode(): StorageMode {
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
