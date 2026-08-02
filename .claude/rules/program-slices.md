---
paths:
  - "docs/design/**/*.md"
---

# 複数スライスに分けた仕事の追跡

**到達状態**: 1 つの仕事を複数 Issue に割ったら、親 Issue に sub-issue が登録され、
親 Issue の body に `## Slice status` 表がある。`pnpm program:slices <親番号>` が
問題を報告しない。

**発火条件**: 編集後の Design Doc に `### スライス` 節がある（= 実装を複数 Issue に
割ると決めた）とき。Issue を割る作業自体はファイル編集を伴わないので `paths:` では
発火しない — Issue を分割起票しようとしたら、その時点で本ファイルを明示的に読む。

## どこに何を置くか

| 何を | どこに | 更新者 |
| --- | --- | --- |
| どのスライスが落ちたか | GitHub sub-issue | GitHub（Issue の open/closed が進捗バーになる） |
| 各スライスでできること / その時点でできないこと | 親 Issue body の `## Slice status` 表 | 人。切ったときに書き、スライスが増減・順序変更したときに直す |
| なぜその切り方にしたか（依存・独立出荷の根拠） | Design Doc の `### スライス` 節 | 人 |

Design Doc に到達点の一覧を置かない。Design Doc は ADR 昇格時に削除されるので、
プログラムが完成した瞬間に一覧が失われる（実例: [#2232](https://github.com/kompiro/karasu/pull/2232) が
`boundary-membership-1n.md` に入れた capability map — [#2237](https://github.com/kompiro/karasu/issues/2237) で親 Issue へ移した）。

## 守ること 2 つ

**完了マークを手で書かない。** `## Slice status` 表に ✅ 列を作らない。完了は
sub-issue の state が唯一の正で、表に持てば二重管理になり必ず drift する
（[TPL-1032](../../docs/test-perspectives/TPL-1032-derived-state-staleness.md)）。
「slice A は終わった」と表に書きたくなったら、代わりにその Issue を close する。

**「その時点でできないこと」列を空にしない。** 途中のスライスは機能が半分だけ効いた
状態で人の目に触れる。仕様として残る制限を書いておかないと、意図した縮退が
「壊れている」と読まれてバグ報告や手戻りになる（実例: boundary slice A —
多重所属ノードが 1 つの枠にしか入らないのは banded layout の仕様）。

## スライスの開発中に見つけたバグ

**そのスライスが作った（または到達可能にした）欠陥なら、独立 Issue にせず親の
sub-issue として登録し、`## Slice status` に 1 行足す。** 判定はこの 1 つで、
「バグか機能か」では分けない。

バグ行の書き方は通常のスライス行と 2 点だけ違う:

- **前提列にはどのスライスが生んだ欠陥かを書く。** 「A」ではなく「A（**A が作った
  欠陥**）」のように、後から読んで原因スライスが辿れるようにする。
- **「できないこと」列は `—` でよい。** バグ修正は仕様として残る制限を作らないことが
  多い。通常のスライス行で空にしてはいけないのは、途中スライスの意図した縮退が
  「壊れている」と読まれるのを防ぐためで、バグ行にはその危険が無い。

実例: [#2221](https://github.com/kompiro/karasu/issues/2221)（cross-file の多重所属が
無診断）は boundary slice A [#2178](https://github.com/kompiro/karasu/issues/2178) の
sub-issue にした。A が merge を和集合にし import された `boundary` を merged model に
届くようにしたことで、cross-file 多重所属が**正常状態になった** — そしてまさにその
状態が報告されていなかった。独立 Issue にすると、この因果が親から見えなくなる。

こうすると分母が動く（#2161 は 4 → 6 になった）。それは正直な動きで、隠すと
「4 スライス中 2 つ終わった」が実態より進んで見える。

## sub-issue の登録

```
gh api repos/kompiro/karasu/issues/<parent>/sub_issues \
  -F sub_issue_id=$(gh api repos/kompiro/karasu/issues/<child> --jq .id)
```

罠が 2 つある。`sub_issue_id` は Issue **番号ではなく** GitHub の内部 id で、
番号を渡すと別の Issue に紐づくか 404 になる。そして `-f` は値を文字列で送るため
`Invalid property /sub_issue_id: ... is not of type 'integer' (HTTP 422)` で落ちる —
**`-F`**（型付き）を使う。

## 検証

```
pnpm program:slices <親番号>
```

sub-issue を持つ親の body に `## Slice status` 節が無い、または節が sub-issue を
取りこぼしていると非ゼロ終了する。引数なしで open な親を全件チェックする。

詳細は `docs/process.md`「複数スライスに分けるときの追跡」。
