/**
 * Node.js path に依存しない純粋なパスユーティリティ。
 * すべてのパスは forward-slash 区切りを前提とする。
 */

/** パスを正規化する（.., ., 二重スラッシュを解決） */
export function normalizePath(p: string): string {
  const isAbsolute = p.startsWith("/");
  const segments = p.split("/").filter((s) => s !== "");
  const result: string[] = [];

  for (const seg of segments) {
    if (seg === ".") {
      continue;
    }
    if (seg === "..") {
      if (result.length > 0 && result[result.length - 1] !== "..") {
        result.pop();
      } else if (!isAbsolute) {
        result.push("..");
      }
    } else {
      result.push(seg);
    }
  }

  const normalized = result.join("/");
  return isAbsolute ? "/" + normalized : normalized || ".";
}

/** base ファイルのディレクトリを基準に relative パスを解決する */
export function resolvePath(base: string, relative: string): string {
  if (relative.startsWith("/")) {
    return normalizePath(relative);
  }
  const baseDir = dirname(base);
  return normalizePath(baseDir + "/" + relative);
}

/** ディレクトリ部分を返す（末尾スラッシュなし） */
export function dirname(p: string): string {
  const lastSlash = p.lastIndexOf("/");
  if (lastSlash === -1) return ".";
  if (lastSlash === 0) return "/";
  return p.slice(0, lastSlash);
}

/** ファイル名部分を返す */
export function basename(p: string): string {
  const lastSlash = p.lastIndexOf("/");
  return lastSlash === -1 ? p : p.slice(lastSlash + 1);
}

/** 拡張子を返す（ドットを含む） */
export function extname(p: string): string {
  const name = basename(p);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return name.slice(dotIndex);
}
