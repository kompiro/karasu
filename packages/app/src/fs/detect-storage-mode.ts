export type StorageMode = "opfs" | "memory";

/** OPFS の利用可否を判定し、ストレージモードを返す */
export function detectStorageMode(): StorageMode {
  try {
    return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function"
      ? "opfs"
      : "memory";
  } catch {
    return "memory";
  }
}
