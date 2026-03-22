/**
 * Markdown テキストから SVG 表示用のサマリを生成する。
 */

/**
 * 簡易的な Markdown 記法の除去。
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // headings: # ## ###
      .replace(/^#{1,6}\s+/gm, "")
      // images: ![alt](url)
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // links: [text](url)
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // bold/italic: **text**, __text__, *text*, _text_
      .replace(/(\*{1,2}|_{1,2})(.+?)\1/g, "$2")
      // strikethrough: ~~text~~
      .replace(/~~(.+?)~~/g, "$1")
      // inline code: `code`
      .replace(/`([^`]+)`/g, "$1")
      // list markers: - , * , 1.
      .replace(/^[\s]*[-*]\s+/gm, "")
      .replace(/^[\s]*\d+\.\s+/gm, "")
  );
}

/**
 * description の Markdown 全文から図上に表示するサマリを生成する。
 *
 * 1. 最初の1行のみを取得
 * 2. Markdown 記法を除去してプレーンテキストに
 * 3. maxLength 文字で打ち切り、超過時は "…" を付与
 */
export function summarizeDescription(markdown: string, maxLength = 50): string {
  // 最初の1行を取得
  const firstLine = markdown.split(/\n/)[0] ?? "";
  // Markdown 記法を除去
  const plain = stripMarkdown(firstLine).trim();
  // 文字数制限（Unicode 対応）
  const chars = [...plain];
  if (chars.length <= maxLength) return plain;
  return chars.slice(0, maxLength).join("") + "…";
}
