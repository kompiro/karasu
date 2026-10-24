import { describe, expect, it } from "vitest";
import { parseGhPrCommands } from "./gh-pr-command.mts";

const CWD = "/work";
const all = (command: string) => parseGhPrCommands(command, CWD);
/** The first gh pr command the line runs, or undefined. */
const parse = (command: string) => all(command)[0];

describe("parseGhPrCommands", () => {
  it("reads a plain ready with its selector", () => {
    expect(parse("gh pr ready 12")).toEqual({
      action: "ready",
      dir: CWD,
      skipped: false,
      draft: false,
      undo: false,
      repoFlag: false,
      selector: "12",
    });
  });

  it("finds the gh command after a heredoc that writes the PR body", () => {
    const command =
      "cat > body.md <<'EOF'\ngh pr ready 99\nEOF\ngh pr create --title x --body-file body.md";
    expect(parse(command)).toMatchObject({ action: "create", draft: false });
  });

  it("finds a ready that follows a heredoc, not the one quoted in its body", () => {
    const command = "cat > n.md <<EOF\ngh pr ready 99\nEOF\ngh pr ready 12";
    expect(parse(command)).toMatchObject({ action: "ready", selector: "12" });
  });

  it("strips leading tabs from the terminator of <<-", () => {
    const command = "cat <<-EOF\n\tgh pr ready 99\n\tEOF\ngh pr ready 12";
    expect(parse(command)).toMatchObject({ selector: "12" });
  });

  it("sees --draft after a $(cat <<'EOF' ...) body, even when the body has parens", () => {
    const command = `gh pr create --title x --body "$(cat <<'EOF'\nSummary (with a paren)\nEOF\n)" --draft`;
    expect(parse(command)).toMatchObject({ action: "create", draft: true });
  });

  it.each([
    ['gh pr create --title x --body "Please use --draft next time"', "inside a quoted body"],
    ["gh pr create --title x # --draft", "in a comment"],
    ["gh pr create --title x --body-file - <<'EOF'\n--draft\nEOF", "in a heredoc body"],
  ])("does not take --draft %s (%s) as the flag", (command) => {
    expect(parse(command)).toMatchObject({ action: "create", draft: false });
  });

  it("accepts -d as the draft flag", () => {
    expect(parse("gh pr create -d --fill")).toMatchObject({ draft: true });
  });

  it.each([
    ['grep -rn "gh pr ready" docs/process.md', "a quoted mention"],
    ["echo 'gh pr ready 12'", "a single-quoted mention"],
    ["git status # then gh pr ready 12", "a comment"],
    ["gh pr view 12 --json isDraft", "another subcommand"],
    ["gh issue create --title 'gh pr create'", "another gh command"],
  ])("finds nothing in %s (%s)", (command) => {
    expect(all(command)).toEqual([]);
  });

  it("follows a leading cd, absolute or relative", () => {
    expect(parse("cd /repo/wt && gh pr ready 1")?.dir).toBe("/repo/wt");
    expect(parse("cd sub && gh pr ready 1")?.dir).toBe("/work/sub");
  });

  it("keeps the session directory for a cd it cannot resolve", () => {
    expect(parse("cd ~/x && gh pr ready 1")?.dir).toBe(CWD);
    expect(parse('cd "$W" && gh pr ready 1')?.dir).toBe(CWD);
  });

  it("does not split a redirection like 2>&1 into two commands", () => {
    expect(parse("gh pr ready 12 2>&1 | tail -3")).toMatchObject({
      action: "ready",
      selector: "12",
    });
  });

  it("records the deliberate skip only when it prefixes the gh command", () => {
    expect(parse("KARASU_LOCAL_REVIEW_SKIPPED=cli-down gh pr ready 12")?.skipped).toBe(true);
    expect(parse("KARASU_LOCAL_REVIEW_SKIPPED=x true; gh pr ready 12")?.skipped).toBe(false);
  });

  it("treats a variable or command substitution selector as the current branch's PR", () => {
    expect(parse('gh pr ready "$PR"')?.selector).toBeNull();
    expect(parse("gh pr ready $(gh pr view --json number -q .number)")?.selector).toBeNull();
  });

  it("reports --undo and --repo / -R", () => {
    expect(parse("gh pr ready 12 --undo")?.undo).toBe(true);
    expect(parse("gh pr ready 12 --repo o/r")?.repoFlag).toBe(true);
    expect(parse("gh pr ready -R o/r 12")?.repoFlag).toBe(true);
  });

  it("returns every gh pr command, so an allowed draft create does not hide a later ready", () => {
    const found = all("gh pr create --draft --body-file b.md && gh pr ready 12");
    expect(found.map((c) => [c.action, c.draft, c.selector])).toEqual([
      ["create", true, "b.md"],
      ["ready", false, "12"],
    ]);
  });

  it.each([
    ["gh pr  ready 12", "doubled spaces"],
    ["gh\tpr\tready 12", "tabs"],
    ["gh pr \\\n  ready 12", "a line continuation"],
    ['gh pr "ready" 12', "a quoted subcommand"],
    ["/usr/bin/gh pr ready 12", "gh called by path"],
  ])("recognizes the ready written with %s", (command) => {
    expect(parse(command)).toMatchObject({ action: "ready", selector: "12" });
  });

  it.each([
    ["FOO=1 env gh pr ready 12", "a wrapper after an assignment"],
    ["if true; then gh pr ready 12; fi", "then"],
    ["for n in 1; do gh pr ready 12; done", "do"],
    ["while false; do :; done; until true; do :; done; gh pr ready 12", "after loops"],
    ["{ gh pr ready 12; }", "a brace group"],
    ["! gh pr ready 12", "negation"],
    ["time gh pr ready 12", "time"],
    ["timeout 30 gh pr ready 12", "timeout with a duration"],
    ["nice -n 5 command gh pr ready 12", "nested wrappers with options"],
  ])("finds the ready behind %s (%s)", (command) => {
    expect(all(command).filter((c) => c.action === "ready")).toMatchObject([{ selector: "12" }]);
  });

  it.each([
    "KARASU_LOCAL_REVIEW_SKIPPED= gh pr ready 12",
    'KARASU_LOCAL_REVIEW_SKIPPED="  " gh pr ready 12',
  ])("does not count a skip without a reason: %s", (command) => {
    expect(parse(command)?.skipped).toBe(false);
  });

  it("counts the skip after keywords and wrappers too", () => {
    expect(
      parse("if true; then KARASU_LOCAL_REVIEW_SKIPPED=cli-down env gh pr ready 12; fi")?.skipped,
    ).toBe(true);
  });
});
