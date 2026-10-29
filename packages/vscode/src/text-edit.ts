/**
 * The one span to replace that turns `before` into `after` (#3313): the common
 * prefix and suffix are kept, so a preview write that appends a style rule or
 * inserts an `@import` replaces only that much of the editor's buffer, and the
 * cursor and the rest of the undo history are not disturbed by a whole-file
 * replacement. Offsets are UTF-16 code units, as `TextDocument.positionAt` takes.
 */
export interface TextSpanEdit {
  start: number;
  end: number;
  text: string;
}

export function minimalEdit(before: string, after: string): TextSpanEdit | null {
  if (before === after) return null;
  let start = 0;
  const shorter = Math.min(before.length, after.length);
  while (start < shorter && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  // Do not split a surrogate pair: step back onto its first half.
  if (start > 0 && isHighSurrogate(before.charCodeAt(start - 1))) start--;
  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)
  ) {
    endBefore--;
    endAfter--;
  }
  if (endBefore < before.length && isLowSurrogate(before.charCodeAt(endBefore))) {
    endBefore++;
    endAfter++;
  }
  return { start, end: endBefore, text: after.slice(start, endAfter) };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
