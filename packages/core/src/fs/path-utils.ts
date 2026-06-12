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

/**
 * untrusted な相対パスが、ある root 配下への書き込みに安全かを判定する。
 *
 * `normalizePath` は `..` を畳むため、`<root>/<p>` の組み立て前に検証しないと
 * root の外（path traversal / zip-slip）へ書き込める。空文字・絶対パス・
 * バックスラッシュ区切り・`..` セグメントを含むパスを拒否する。
 * `..` セグメントの全面拒否は normalizePath が root を脱出できる経路の
 * 厳密な上位集合なので、これを通れば `normalizePath(root + "/" + p)` は
 * 必ず root 配下に留まる（TPL-20260510-17）。
 *
 * 文字列レベルの検証であり、symlink は解決しない。実 OS パスを扱う場合は
 * resolve + startsWith の境界チェックを併用すること。
 */
export function isSafeRelativePath(p: string): boolean {
  if (p === "" || p.startsWith("/") || p.includes("\\")) return false;
  return !p.split("/").includes("..");
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
