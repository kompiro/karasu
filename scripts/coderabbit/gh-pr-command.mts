/**
 * Finds every `gh pr ready` / `gh pr create` that a Bash command line would
 * actually run, for the PreToolUse gate in require-review-before-ready.sh
 * (#3342, ADR-3342).
 *
 * A text search over the command is not enough: a heredoc body, a quoted
 * string or a comment can mention `gh pr ready` or `--draft` without running
 * or passing it, and a heredoc can come before the real `gh` command in the
 * same call. This is a small shell tokenizer for that question only. It
 * understands quotes, `$(...)`, backticks, heredocs (the body is skipped and
 * parsing resumes after the terminator), comments, redirections and the list
 * operators. It does not expand anything.
 *
 * Run directly, it reads the command on stdin and prints the result as a JSON
 * array (empty when the command runs neither).
 */

export interface GhPrCommand {
  action: "ready" | "create";
  /** The directory the command runs in, after any leading `cd`. */
  dir: string;
  /** `KARASU_LOCAL_REVIEW_SKIPPED=<reason>` was assigned in front of the command. */
  skipped: boolean;
  /** create: --draft / -d was passed as an argument. */
  draft: boolean;
  /** ready: --undo was passed. */
  undo: boolean;
  /** ready: --repo / -R was passed. */
  repoFlag: boolean;
  /** ready: the literal PR selector, or null for "the current branch's PR". */
  selector: string | null;
}

type Token = { kind: "word"; text: string } | { kind: "sep" } | { kind: "redirect" };

const SKIP_VARIABLE = "KARASU_LOCAL_REVIEW_SKIPPED";

/** Reads a balanced `$(...)` or `(...)` starting at `open`, honoring quotes; returns the index after `)`. */
function skipBalanced(s: string, open: number): number {
  let depth = 0;
  let i = open;
  const pending: { delimiter: string; strip: boolean }[] = [];
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      i = end === -1 ? s.length : end + 1;
      continue;
    }
    if (c === '"') {
      i = skipDoubleQuoted(s, i);
      continue;
    }
    if (c === "<" && s.startsWith("<<", i) && !s.startsWith("<<<", i)) {
      const { delimiter, strip, next } = readHeredocStart(s, i);
      if (delimiter !== "") pending.push({ delimiter, strip });
      i = next;
      continue;
    }
    if (c === "\n" && pending.length > 0) {
      // The bodies of heredocs opened on this line follow it; their text is not code.
      while (pending.length > 0) {
        const { delimiter, strip } = pending.shift() as { delimiter: string; strip: boolean };
        i = skipHeredocBody(s, i, delimiter, strip);
      }
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return s.length;
}

/** Returns the index after the closing `"` of a double-quoted string starting at `open`. */
function skipDoubleQuoted(s: string, open: number): number {
  let i = open + 1;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === '"') return i + 1;
    if (c === "$" && s[i + 1] === "(") {
      i = skipBalanced(s, i + 1);
      continue;
    }
    if (c === "`") {
      const end = s.indexOf("`", i + 1);
      i = end === -1 ? s.length : end + 1;
      continue;
    }
    i++;
  }
  return s.length;
}

/** Parses `<<[-]DELIM` at `at`; returns the delimiter, whether tabs are stripped, and the index after it. */
function readHeredocStart(
  s: string,
  at: number,
): { delimiter: string; strip: boolean; next: number } {
  let i = at + 2;
  const strip = s[i] === "-";
  if (strip) i++;
  while (s[i] === " " || s[i] === "\t") i++;
  let delimiter = "";
  while (i < s.length && !/[\s;&|<>()]/.test(s[i])) {
    const c = s[i];
    if (c === "'" || c === '"') {
      const end = s.indexOf(c, i + 1);
      delimiter += s.slice(i + 1, end === -1 ? s.length : end);
      i = end === -1 ? s.length : end + 1;
    } else if (c === "\\") {
      delimiter += s[i + 1] ?? "";
      i += 2;
    } else {
      delimiter += c;
      i++;
    }
  }
  return { delimiter, strip, next: i };
}

/** Skips the lines of a heredoc body that starts after the next newline at or after `from`. */
function skipHeredocBody(s: string, from: number, delimiter: string, strip: boolean): number {
  let i = s.indexOf("\n", from);
  if (i === -1) return s.length;
  i++;
  while (i < s.length) {
    const end = s.indexOf("\n", i);
    const line = s.slice(i, end === -1 ? s.length : end);
    const candidate = strip ? line.replace(/^\t+/, "") : line;
    i = end === -1 ? s.length : end + 1;
    if (candidate === delimiter) return end === -1 ? s.length : end;
  }
  return s.length;
}

export function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  const pendingHeredocs: { delimiter: string; strip: boolean }[] = [];
  let word = "";
  let inWord = false;
  const endWord = () => {
    if (inWord) tokens.push({ kind: "word", text: word });
    word = "";
    inWord = false;
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\n") {
      endWord();
      tokens.push({ kind: "sep" });
      i++;
      while (pendingHeredocs.length > 0) {
        const { delimiter, strip } = pendingHeredocs.shift() as {
          delimiter: string;
          strip: boolean;
        };
        const end = skipHeredocBody(s, i - 1, delimiter, strip);
        i = end >= s.length ? s.length : end + 1;
      }
      continue;
    }
    if (c === " " || c === "\t") {
      endWord();
      i++;
      continue;
    }
    if (c === "#" && !inWord) {
      const end = s.indexOf("\n", i);
      i = end === -1 ? s.length : end;
      continue;
    }
    if (c === "\\") {
      if (s[i + 1] === "\n") {
        i += 2;
        continue;
      }
      word += s[i + 1] ?? "";
      inWord = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      word += s.slice(i + 1, end === -1 ? s.length : end);
      inWord = true;
      i = end === -1 ? s.length : end + 1;
      continue;
    }
    if (c === '"') {
      const end = skipDoubleQuoted(s, i);
      word += s.slice(i + 1, end - 1);
      inWord = true;
      i = end;
      continue;
    }
    if (c === "$" && s[i + 1] === "(") {
      const end = skipBalanced(s, i + 1);
      word += s.slice(i, end);
      inWord = true;
      i = end;
      continue;
    }
    if (c === "`") {
      const end = s.indexOf("`", i + 1);
      const stop = end === -1 ? s.length : end + 1;
      word += s.slice(i, stop);
      inWord = true;
      i = stop;
      continue;
    }
    if (c === "<" && s.startsWith("<<", i) && !s.startsWith("<<<", i)) {
      endWord();
      const { delimiter, strip, next } = readHeredocStart(s, i);
      if (delimiter !== "") pendingHeredocs.push({ delimiter, strip });
      tokens.push({ kind: "redirect" });
      i = next;
      continue;
    }
    if (c === "<" || c === ">") {
      // A word of digits right before a redirection is its file descriptor.
      if (inWord && /^\d+$/.test(word)) {
        word = "";
        inWord = false;
      }
      endWord();
      i++;
      while (i < s.length && /[<>&|]/.test(s[i]) && !(s[i] === "|" && s[i + 1] === "|")) i++;
      tokens.push({ kind: "redirect" });
      continue;
    }
    if (c === "&" && s[i + 1] === ">") {
      endWord();
      i += 2;
      if (s[i] === ">") i++;
      tokens.push({ kind: "redirect" });
      continue;
    }
    if (c === ";" || c === "&" || c === "|" || c === "(" || c === ")") {
      endWord();
      tokens.push({ kind: "sep" });
      i++;
      continue;
    }
    word += c;
    inWord = true;
    i++;
  }
  endWord();
  return tokens;
}

/** Splits tokens into simple commands, dropping each redirection and its target. */
function simpleCommands(tokens: Token[]): string[][] {
  const commands: string[][] = [];
  let current: string[] = [];
  let skipNext = false;
  for (const token of tokens) {
    if (token.kind === "sep") {
      if (current.length > 0) commands.push(current);
      current = [];
      skipNext = false;
    } else if (token.kind === "redirect") {
      skipNext = true;
    } else if (skipNext) {
      skipNext = false;
    } else {
      current.push(token.text);
    }
  }
  if (current.length > 0) commands.push(current);
  return commands;
}

function resolveDir(base: string, target: string): string {
  if (target.startsWith("/")) return target;
  return `${base.replace(/\/+$/, "")}/${target}`;
}

/**
 * Every `gh pr ready` / `gh pr create` the line would run, in order. All of them
 * matter: an allowed draft `create` must not hide a later `ready` in the same
 * call (`gh pr create --draft ... && gh pr ready 12`).
 */
export function parseGhPrCommands(command: string, cwd: string): GhPrCommand[] {
  const found: GhPrCommand[] = [];
  let dir = cwd;
  for (const words of simpleCommands(tokenize(command))) {
    let skipped = false;
    let rest = words;
    if (rest[0] === "env" || rest[0] === "command") rest = rest.slice(1);
    while (rest.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0])) {
      if (rest[0].startsWith(`${SKIP_VARIABLE}=`)) skipped = true;
      rest = rest.slice(1);
    }
    if (rest[0] === "cd") {
      const target = rest[1];
      if (
        target !== undefined &&
        target !== "-" &&
        !target.startsWith("~") &&
        !target.includes("$")
      ) {
        dir = resolveDir(dir, target);
      }
      continue;
    }
    // gh may be called by path (/usr/bin/gh, ./gh).
    if (rest[0] === undefined || !/(^|\/)gh$/.test(rest[0]) || rest[1] !== "pr") continue;
    const action = rest[2];
    if (action !== "ready" && action !== "create") continue;
    const args = rest.slice(3);
    const positional = args.filter((arg) => !arg.startsWith("-"));
    const literal = positional[0];
    found.push({
      action,
      dir,
      skipped,
      draft: args.some((arg) => arg === "--draft" || arg === "-d" || arg === "--draft=true"),
      undo: args.includes("--undo"),
      repoFlag: args.some((arg) => arg === "-R" || arg === "--repo" || arg.startsWith("--repo=")),
      selector: literal === undefined || /[$`]/.test(literal) ? null : literal,
    });
  }
  return found;
}

if (import.meta.main) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const command = Buffer.concat(chunks).toString("utf8");
  process.stdout.write(
    `${JSON.stringify(parseGhPrCommands(command, process.argv[2] ?? process.cwd()))}\n`,
  );
}
