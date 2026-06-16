// CommonMark-correct fenced-code tracking, shared by the link rewriter and the
// anchor collector so neither mistakes code-block content for prose. A fence
// opens on a line whose first non-space run is >= 3 backticks or tildes, and
// closes only on a later line with the SAME character and a run AT LEAST as long
// (a shorter or different-char fence line inside the block is just content).

interface BodyLine {
  line: string;
  /** false for fence-marker lines and any line inside a fenced code block */
  isProse: boolean;
}

export function* eachLine(body: string): Generator<BodyLine> {
  let fence: { char: string; len: number } | null = null;

  for (const line of body.split("\n")) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      const run = m[1];
      if (fence === null) {
        fence = { char: run[0], len: run.length };
      } else if (run[0] === fence.char && run.length >= fence.len) {
        fence = null;
      }
      // Opening, closing, and shorter-inside-block fence lines are all non-prose.
      yield { line, isProse: false };
      continue;
    }
    yield { line, isProse: fence === null };
  }
}
