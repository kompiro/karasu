---
id: TPL-2175
title: "非推奨は移行先が出荷される release で告知する — 移行先の無い deprecation は「唯一動く手段をやめろ」と言っているだけ"
status: active
date: 2026-08-04
applicable_to:
  - "既存の記法・API を deprecated にする診断を追加するとき"
  - "廃止予定の機能に代替を用意するとき（告知と代替の出荷順を決めるとき）"
  - "1 つの誤りが複数のファイル / register に跨って書かれている構文を deprecate するとき"
known_consumers:
  - style-resolver
  - warnings
discovered_from:
  - issue: "#2175"
  - root_cause_file: "packages/core/src/resolver/warnings.ts"
related_to:
  - TPL-1503
  - TPL-1386
  - TPL-2172
topic: core-concepts
scope:
  packages:
    - core
    - i18n
---

# TPL-2175: 非推奨は移行先が出荷される release で告知する

## 観点

karasu は v2.0 で tag / annotation をツール語彙に閉じる（[ADR-2065 系](../design/tags-and-facets.md)）。
その移行は **model 側**（`[pci]` をノードに書く）と **style 側**（`[pci] { … }` を
シートに書く）の 2 面を持つ。#2159 は model 側だけを deprecate し、style 側を
**意図的に据え置いた** — その時点では任意名セレクタが横断的関心事をスタイリングする
唯一の手段であり、警告することは「唯一動くやり方をやめろ」と言うのと同じだったからである。

**告知は移行先の出荷と同じ release に置く。** 早すぎる告知は、行き先の無い警告を
コンソールに積み、ユーザーは (a) 無視する習慣を身につけるか (b) 動いていた機能を
捨てるか、どちらか損な選択をする。遅すぎる告知は、v2.0 で壊れるコードを書き続けさせる。

到達状態: 新しい deprecation 診断を足す PR の diff の中に、その移行先の実装が入っている
（`packages/core/src/parser/style-parser.ts` の `[facets=<id>]` と
`packages/core/src/resolver/warnings.ts` の `detectStyleSelectorsNotBuiltin` が同じ PR
にあるのがこの形）。

**もう 1 つ**: 1 つの誤りが複数の場所に書かれているなら、**すべての場所で警告する**。
`[pci]` を facet へ移す作業は「ノードの tag を消す」「シートのセレクタを書き換える」の
2 編集で、片方しか警告しないと残った方が見つからない。「同じことを 2 回言っている」
ように見えるが、直す場所が 2 つあるので言うことも 2 つある。

## 想定される失敗モード

- **移行先の無い deprecation を出す。** 警告に従うと機能が減る状態を作り、ユーザーに
  警告を無視する習慣を教える。以後その register の警告はすべて効かなくなる。
- **移行先を出したのに告知しない。** 新記法があることに気づかれず、v2.0 の破壊的変更で
  初めて存在を知る。#2175 以前の style 側がこの状態で、`facet` は出荷済みだったのに
  シート側には何のシグナルも無かった。
- **告知を片側だけにする。** 2 箇所直す作業の片方だけ報告し、もう片方が残ったまま
  v2.0 を迎える。
- **移行先の specificity / 優先順位が旧記法と違う。** 書き換えるとカスケードの勝敗が
  変わり、移行が「1 コミットで全部やる」以外に不可能になる。`[facets=pii]` が
  `[pii]` と同じ 10 点なのはこのため — **移行先は旧記法と同じ順位に置く**。
- **告知と同時に旧記法を効かなくする。** v1.x で一致をやめると、既存モデルの見た目が
  黙って変わる。deprecation は「まだ動く」ことと対で成立する。

## チェックリスト

deprecation 診断を追加する PR で確認する:

- [ ] 同じ PR（または既にマージ済みの PR）に**移行先の実装**があるか。無いなら診断は
      まだ早い — Issue に「移行先が出たら告知する」と書いて閉じる。
- [ ] 診断メッセージが**具体的な書き換え手順**を含んでいるか（「非推奨です」だけでは、
      読んだ人が次に何をするか決められない）。
- [ ] 旧記法が **v1.x で引き続き動く**ことを test で固定したか（告知しただけで挙動を
      変えていないか）。
- [ ] 移行先が旧記法と**同じ specificity / 優先順位**を持つか。違うなら、なぜ違って
      よいかを spec に書いたか。
- [ ] その誤りが書かれうる**すべての場所**で警告が出るか（model 側と style 側、複数
      ファイル、複数 register）。片方だけになっていないか。
- [ ] ツール自身が出力するもの（builtin テーマ、注入シート、生成コード）で誤発火しないか。
      ユーザーが直せないものを警告してはならない。
- [ ] spec に **before / after の書き換え例**があるか。診断メッセージは 1〜2 文しか
      持てないので、実際の移行手順は spec 側が持つ。

## 既知の対処パターン

- **告知と移行先を 1 PR に束ねる**: レビュー時に「移行先はどこか」が diff の中で
  答えられる。別 PR に分けると、片方だけマージされた中間状態が生まれる。
- **同点 specificity で移行先を作る**: 書き換えを 1 行ずつ・任意の順序で進められる。
  優先順位が変わる移行先は、実質的に big-bang 移行を強制する。
- **警告の details に手順を置く**: karasu の `FormattedWarning` は `message` +
  `details[]` なので、1 行目に事実、`details` に「declare → 付与 → 書き換え」の
  3 手順を置ける。
- **system sheet を除外する**: `sheets.slice(systemSheetCount)` のように、ユーザーが
  編集できない入力を診断対象から外す。除外の根拠は「編集できるか」であって
  「builtin かどうか」ではない。

## 派生元 spec

- `docs/spec/style.md` / `style.ja.md` §「Facet selectors (`[facets=<id>]`) — experimental」
  の「Migrating an arbitrary-name tag or annotation selector」節
- `docs/spec/tags-annotations.md` / `.ja.md` §「Non-builtin tag names are deprecated (v1.x)」
