---
type: process
---

# AT-3920: 実装・レビュー・検証のセッションが直接やりとりする

- **日付**: 2026-11-28
- **関連 Issue**: [#3920](https://github.com/kompiro/karasu/issues/3920)
- **Related TPLs**: [TPL-3920](../test-perspectives/TPL-3920-session-message-is-a-wake-up-not-a-record.md)
- **対象ファイル**:
  - `scripts/session/name-from-prompt.sh` / `scripts/session/name-from-prompt.test.ts`（名前を付ける hook）
  - `.claude/settings.json`（UserPromptSubmit への登録）
  - `.claude/skills/impl/SKILL.md`・`.claude/skills/local-review/SKILL.md`・`.claude/skills/verify/SKILL.md`（起動スキル）
  - `.claude/skills/pr-verify/SKILL.md`（実装セッションへの差し戻し）
  - `.claude/skills/coderabbit-converge/SKILL.md`（検証セッションに渡す）
  - `docs/process/review.md`（「セッション同士のやりとり」）

> kompiro が起動スキル（`/impl <N>`・`/local-review <N>`・`/verify <N>`）を打つと、hook がセッションに
> `impl-<N>`・`review-<N>`・`verify-<N>` と名前を付ける。実装セッションはローカルレビューを `review-<N>` に、
> 仕上がった PR を `verify-<N>` に頼み、`/pr-verify` の差し戻しは PR のコメントに残ってから `impl-<N>` に届く。
> kompiro は文を運ばない。

## 受け入れ条件

### AC-1: 起動スキルの prompt だけが、その役割の名前になる

- [ ] AT-1: hook は、前後の空白と改行を除いた prompt の全体が `/impl <N>`・`/local-review <N>`・`/verify <N>`（数字の前の
  `#` は可）のときだけ、`impl-<N>`・`review-<N>`・`verify-<N>` を返す。VS Code 拡張が prompt の先頭に付ける
  `<ide_opened_file>…</ide_opened_file>`・`<ide_selection>…</ide_selection>` は除いてから比べる。`/review <N>`、前後に文が
  続く prompt、ほかの prompt には何も返さない。読めない入力でも 0 で終わる

  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `names a session after each start skill`
  >
  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `accepts a # before the number and trims surrounding whitespace and newlines`
  >
  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `drops the editor context the VS Code extension puts in front of the prompt`
  >
  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `sets no name when the editor context is not just in front`
  >
  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `sets no name for any other prompt`
  >
  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `exits 0 silently on input it cannot read`

- [ ] AT-2: 別の役割の名前が付いたセッションの名前は変えない。今の名前は hook の入力の `session_title` から読み、無ければ
  transcript の最後の `custom-title` から読む。同じ役割・自動の名前・名前なし・transcript が無いときは名前を付ける

  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `does not move a session that carries another role's name`
  >
  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `renames a session that has the same role, an automatic name or no name`
  >
  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `reads the last name in the transcript`
  >
  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `reads the current name from session_title before the transcript`
  >
  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `falls back to the transcript when session_title is empty or not a string`
  >
  > ✅ Automated — `scripts/session/name-from-prompt.test.ts` › `name-from-prompt hook (#3920)` › `names the session when the transcript is missing`

## 手動確認

Claude Code のセッション同士のメッセージと、hook が付けた名前が宛先になることは、実際のセッションでしか確かめられない。
次の項目は、この Issue の実装 PR（以下 PR）の worktree をプロジェクトのディレクトリとして VS Code で開き、新しい
セッションを起動スキルから始めて行う（ルートのチェックアウトで開くと、hook と起動スキルの無い `main` の設定を読む）。
`N` は PR の Issue 番号。

順番は、PR を開く前にローカルレビューの項目（M1〜M5）を行い、PR を開いて残りを行う。上限と別ブランチの項目（M11・M12）は、
使い捨ての draft PR（本文に `Refs #N` を書き、`/pr-verify` が `fix` を出すように未解決のスレッドを 1 つ置くか、kompiro が
NO で直す点を挙げる）に対して行い、終わったら閉じる。M12 を先に行い、そのあと `Hand-back` のコメントを 3 件にして
M11 を行う。PR の上の差し戻し（M7〜M10）は、PR の往復の上限を最大 2 件使う。

- [ ] M1: エディタでファイルを開いたまま、新しいセッションの最初の prompt として `/impl <N>`・`/local-review <N>`・
  `/verify <N>` を番号まで打って送ると、それぞれの `ListAgents` の 1 行目とタブの名前が `impl-<N>`・`review-<N>`・
  `verify-<N>` になり、`/local-review` で始まるのが組み込みの `/code-review` ではなくプロジェクトのスキルである。
  候補の一覧から選んで番号なしで送ったとき（`/impl` だけ）は名前が自動のままで、スキルが番号を聞く
- [ ] M2: `impl-<N>` が手順 8 の回を頼むと、待機中の `review-<N>` が指摘を返す。手順 8 を終えて CLI を頼むと、
  `review-<N>` が CLI を当てて返す。このブランチに CLI のレビューがまだ無い状態から始め、`impl-<N>` の `gh pr ready` が
  `review-<N>` の CLI のレビュー（`git.json` の `head` が返されたコミット）で CLI のゲートを通る
- [ ] M3: `impl-<N>` のセッションで `/verify <N>` を打っても、名前は `impl-<N>` のまま変わらない
- [ ] M4: 待機中の `review-<N>` を閉じて `--resume` で開き直しても、名前が `review-<N>` のままで、次の依頼を受けられる
- [ ] M5: `review-<N>` は、ブランチの HEAD が依頼の SHA と違うとき、レビューせずに `impl-<N>` に `declined` を返す
- [ ] M6: `impl-<N>` が PR を渡すと、待機中の `verify-<N>` が `/pr-verify` を始める
- [ ] M7: `fix` の判定で、PR に `Hand-back by /pr-verify` のコメントが付き、`impl-<N>` に URL が届く。コメントの前後で
  `.claude/skills/pr-verify/scripts/gate.sh` の `coderabbit.bodyFindingIds` が変わらない
- [ ] M8: `impl-<N>` が直して返したメッセージで、`verify-<N>` が `/pr-verify` をやり直し、`Hand-back` に挙げた点を確かめる
- [ ] M9: kompiro が `verify-<N>` で `/pr-verify` を直接打っても、差し戻しが `impl-<N>` に届く
- [ ] M10: `from` が規約の相手でないメッセージ（自動の名前のセッションから送る）を、受け手は実行せず kompiro に知らせる
- [ ] M11: 使い捨ての draft PR に `Hand-back` のコメントが 3 件あるとき、`verify-<N>` は送らずに依頼文を kompiro に渡す
- [ ] M12: 差し戻しのコメントが使い捨ての draft PR（`impl-<N>` の作業ブランチでないブランチ）を指すとき、`impl-<N>` は
  直さずに `declined` を返して kompiro に知らせ、`verify-<N>` は `declined` を受けても `/pr-verify` を始めない
- [ ] M13: `review-<N>` が無いとき、`impl-<N>` は今と同じく自分でレビューする。`impl-<N>` が無いとき、差し戻しは今と
  同じく依頼文を kompiro に渡す
