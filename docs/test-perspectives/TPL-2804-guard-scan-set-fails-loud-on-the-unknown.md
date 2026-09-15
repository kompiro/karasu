---
id: TPL-2804
title: "走査対象を持つガードは、未知の要素が黙って対象外になる側ではなく大声で落ちる側に集合を定義する。除外は全走査の上の deny-list で表し、裏付けのないエントリを finding にする"
status: active
date: 2026-09-14
applicable_to:
  - "ファイル・拡張子・ディレクトリなどの集合を走査して違反を探す drift guard / lint を新設・改修するとき"
  - "走査対象を allow-list（検査する側の列挙）で定義しようとしているとき"
  - "ガードに除外リスト（binary 拡張子、生成物のディレクトリなど）を持たせるとき"
  - "ガードが検出する失敗の症状が「エラー」ではなく「沈黙」（ヒットしない・読まれない・何も起きない）であるとき"
known_consumers:
  - lint-no-nul-bytes
discovered_from:
  - issue: "#2804"
related_to:
  - TPL-1720
  - TPL-2446
  - TPL-2253
  - TPL-2643
topic: build
scope:
  packages: []
---

# TPL-2804: 走査対象を持つガードは、未知の要素が黙って対象外になる側ではなく大声で落ちる側に集合を定義する。除外は全走査の上の deny-list で表し、裏付けのないエントリを finding にする

## 観点

ガードを作るときは「何を検出するか」と同じ重さで、**走査集合の外に未知の要素が来たとき何が起きるか**を決める。

走査集合の定義には 2 つの向きがある。検査する側を列挙する **allow-list** は、列挙に無い要素が来ると
その要素を黙って対象外にする。全体を読んで除外する側だけを列挙する **deny-list** は、列挙に無い要素が
来ると検査対象に入れ、違反していれば落ちる。前者の失敗は沈黙、後者の失敗は false positive で、
後者は 1 行足せば直り、しかも最初のコミットで必ず表に出る。

**ガードが検出しようとしている症状そのものが沈黙である場合、allow-list は致命的になる。** 見逃しの
症状とガード自身の取りこぼしの症状が同じ形をしているため、「ガードが緑」と「対象外で読まれて
いない」を外から区別する手段がない。

deny-list にも固有の腐り方がある。念のためのエントリが検証されないまま溜まると、除外が実質的な
列挙に戻る。したがって除外リストは **claim として扱い**、各エントリが実際に除外を必要とする要素に
裏付けられていることを機械で検査する（裏付けのないエントリを finding にする）。

[TPL-2446](TPL-2446-gate-side-check-runs-over-the-whole-set.md) は「gate 側の検証は対象を列挙せず
全走査で回す」を CI の対象パッケージについて扱う。本観点はその下の層で、**ガード自身の走査集合の
定義**と、全走査に残る唯一の列挙（除外リスト）の維持を扱う。

## 想定される失敗モード

- **新しい種類の要素が、足された日から検査外になる。** テキスト拡張子の allow-list は、新しい拡張子や
  拡張子のないファイル（`Dockerfile` / `LICENSE` / `_redirects`）を名指しできず、それらは緑のまま
  一度も読まれない（[TPL-1720](TPL-1720-validation-target-set-enumerates-all-kinds.md) と同型だが、
  症状が沈黙なので二重に見えない）。
- **沈黙を検出するガードが、沈黙で取りこぼす。** raw NUL byte を含むファイルは `grep` / `rg` から
  binary 扱いされ黙ってスキップされる。
  - 実例: #2216 で 3 ファイル（`warnings.ts` など）、#2793 で `obstacle-index.test.ts` に混入し、
    どちらも別件の grep が空振りしたことで偶然見つかった。
  - 実例: 2026-09-14、ガードを入れる PR の AT レコード（Markdown）を書いた際、U+0000 の escape 表記が
    生のバイトとして書き出され、その行への grep が何も返さなかった。ガードは stage した時点で
    `docs/acceptance/2804-no-nul-bytes-guard.md:29` として報告した。**allow-list を `.ts` 系に
    絞っていれば、この Markdown は対象外だった。**
- **除外リストが列挙に戻る。** 「`.jpg` や `.zip` も念のため」と足したエントリは、その拡張子の
  ファイルが一度も現れなくても残り続け、除外の範囲だけが検証なしに広がる。
- **実データに除外対象が 0 件で、除外分岐がテストされない。** 例: tracked symlink が 0 件の
  リポジトリで symlink の除外を実ツリー相手にテストしても、何も検証していない。

## チェックリスト

走査対象を持つガードを新設・改修するとき:

- [ ] ガードが見逃したときの症状を書き出し、**走査集合の定義がそれと同じ向き（沈黙）に失敗しないか**を確認したか
- [ ] 走査集合を「検査対象の列挙」ではなく「全体から除外を引いたもの」で定義できないか検討したか。全走査のコストは推測でなく**実測**したか
- [ ] 除外リストの各エントリが、実在する要素に裏付けられていることを**機械で検査**しているか（裏付けのないエントリは finding）
- [ ] 除外分岐（symlink、除外拡張子など）を**合成入力**で踏むテストがあるか。実データに該当要素が無くても検証が成立するか

## 既知の対処パターン

- **全走査 + claim に縛った deny-list（#2804）**: `scripts/lint/no-nul-bytes.ts` は `git ls-files -s -z`
  で tracked file を全部読み、NUL を持つファイルを拡張子で仕分ける。`BINARY_EXTENSIONS`（`.png` /
  `.ttf` / `.otf`）以外は `nul-byte-in-text-file`。どのファイルにも裏付けられない除外拡張子は
  `stale-binary-extension` として報告する。全走査は実測で約 20ms（2300 ファイル / 26MB）で、
  「重いから列挙する」理由は無かった。
- **除外分岐を純関数に切り出して合成入力で踏む**: `parseLsFiles(stdout)` が `git ls-files -s -z` の
  出力文字列を受け取るので、mode `120000`（symlink）や、タブを含むパスを合成レコードで検証できる。
  git も一時リポジトリも使わない。
- **gate 側に置く**: 走査集合を正しく定義しても、docs-only PR で走らなければ検証は存在しない
  （[TPL-2446](TPL-2446-gate-side-check-runs-over-the-whole-set.md) /
  [TPL-2643](TPL-2643-skip-reports-success-without-running.md)）。#2804 では Required な `Check` を
  出す `ci.yml` と `ci-skip.yml` の両方で走らせた。
- **一覧でなく検索で閉じる**という同じ発想の除去側の版は
  [TPL-2253](TPL-2253-removal-sweep-needs-a-search-not-a-file-list.md)。

## 関連テスト

- `scripts/lint/no-nul-bytes.test.ts`（`reports a file with no extension, which an allow-list could not have named` / `reports a denied extension that no NUL-carrying file backs` / `drops a symlink, whose content would be read from the link's target`）
