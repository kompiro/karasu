---
id: ADR-2648
title: 記録が名指すソースパスを機械で照合し、不在が正しい場合は宣言させる
status: accepted
date: 2026-08-31
topic: testing
scope:
  packages: []
  concerns: [ci]
related_to: [ADR-706, ADR-2125, ADR-1357, ADR-1077, ADR-2348, ADR-1192]
assumptions:
  - "file: scripts/lint/record-source-paths.ts"
  - "symbol: scripts/lint/record-source-paths.ts :: ABSENT_PATH_MARKER"
  - "grep: package.json :: lint:record-source-paths"
  - "grep: lefthook.yml :: record-source-paths"
  - "grep: .github/workflows/at-check-coverage.yml :: lint:record-source-paths"
---

# ADR-2648: 記録が名指すソースパスを機械で照合し、不在が正しい場合は宣言させる

- **日付**: 2026-08-31
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2648](https://github.com/kompiro/karasu/issues/2648)（Guard records against naming a source path that no longer exists）
  - 実装 PR: [#2652](https://github.com/kompiro/karasu/pull/2652)
  - 発見の経緯: [#2604](https://github.com/kompiro/karasu/pull/2604)（`packages/nest` の半分を削除した PR）
  - 観点: [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)（記録は記録より長生きするアドレスを指す）
  - 上流 follow-up: [kompiro/tpl-tools#17](https://github.com/kompiro/tpl-tools/issues/17)
  - 関連 ADR: [ADR-706](706-rename-preview-column.md)（ADR 本文は当時の記録）, [ADR-2125](2125-retire-adr-id-migration-map.md)（lint のためだけの map を退役）, [ADR-1357](1357-tpl-tools-extraction.md)（tpl-tools 切り出し）, [ADR-2348](2348-at-records-point-at-issues.md)（AT は Issue を指す）

## 背景

記録が、もう存在しないソースファイルを名指ししていても何も落ちなかった。#2604 が
`packages/nest` の約半分を削除したとき、8 件の記録が消えたファイルを指したまま CI は
最後まで全部緑だった。TPL-2254 が URL について言っていることの、ソースパス版である。
URL のリンク切れと違い repo の中で完結しているのに、誰も見ていないぶん質が悪い。

既存のガードはどれも届かない。`at:check-coverage` は `> ✅ Automated —` マーカー内の
unit test パスを解決しない。`adr:check-assumptions` は ADR の frontmatter だけを見る
（本文は設計上スコープ外）。`knip` はコードを見るがプロセを見ない。

実測すると `docs/{acceptance,test-perspectives,design}` に 31 件の不在参照があり、
**うち 7 件は不在であることが正しかった**。履歴（「かつて〜があり削除された」）、例示、
設計ドキュメントがこれから作るファイルの 3 種類である。ここが設計上の分岐点になった。

## 決定

### 1. コードスパンがちょうどソースパスなら実在する、を唯一の判定基準にする

`scripts/lint/record-source-paths.ts` が `docs/acceptance` / `docs/test-perspectives` /
`docs/design` の Markdown を読み、**インラインコードスパンの中身が `packages/…` /
`scripts/…` のパスそのもの**であるものを working tree と照合する。

スパンから部分文字列を切り出さず、スパン全体の一致を求める。これだけで glob
（`at-*.spec.ts`）・プレースホルダ（`<spec path>`）・シェル行（`cp a b`）が外れる。
仮名の deny-list を持たずに済むことがこの形を選んだ理由で、そういう「自分を養うための
維持物」は ADR-2125 が退役させた形である。

YAML frontmatter とコードフェンスは読まない。frontmatter は ADR / TPL のツールが検証
しており、そこに出るのは `packages/foo` のような散文中の仮名である。

ビルド生成物（パスセグメントの `dist` `out` `coverage` 等、および
`THIRD_PARTY_NOTICES.md`）は照合しない。クリーンチェックアウトに無いのが正常であって
参照の腐りではない。`git check-ignore` に委ねない — それは**開発者個人の** global
excludes も読むので（`out/` はそこにしか無い）、CI と手元で答えが変わる。

### 2. `docs/adr/**` は対象外にし、理由を宣言箇所に書く

ADR 本文は当時の実装と決定の記録であり、コードが動いても書き換えない（ADR-706）。
執筆時点で 28 件の不在参照があるが欠陥ではなく、これを落とすガードは 1 週間で
無効化される。除外の理由は ADR-706 の原文ごとスクリプトのヘッダーに書き、
「見落としだ」と読んで後から外されないようにした。

ADR の frontmatter は逆のケースで、`adr:check-assumptions` が既に working tree と
照合している。本文を放置しても失われるものはない。

### 3. 逃がす記法ではなく、主張を宣言する記法を持たせる

不在が正しい 7 件のために、`.claude/rules/krs-fences.md` の ` ```krs invalid ` に倣う。
`invalid` が「いまも parse エラーが出ること」を逆向きに検証しているのと同じで、
これは**検査の停止ではなく主張の宣言**である。

```markdown
<!-- absent-path-next-line: retired test, named as history (#1585) -->
- _（retired）_ かつて `packages/e2e/tests/at-1468-….spec.ts` が …
```

宣言は 3 つの条件に課される。

- **直上の 1 行にだけ効く** — 空行もフェンスも跨がない
- **理由が空なら落ち、かつ抑止もしない** — 無効な宣言に抑止を与えると、理由を書かない
  marker の陰に不在パスが隠れる
- **その行のパスが全部実在するようになったら落ちる**

3 つ目が設計ドキュメントに効く。設計は「これから作るファイル」を名指しするのが仕事
なので、宣言する手段がないと未実装の設計ドキュメントは構造的に必ず赤くなる。逆向き
検査があると、実装された瞬間に marker が余って落ち、
`docs/process.md`「決定が下りたら ADR に昇格させ、設計ドキュメントは削除する」が
まだ済んでいないという通知になる。赤くなる問題が、むしろ欲しかった通知に変わる。

### 4. 記法は失敗出力で教える。`.claude/rules/` に二重に書かない

検査は CI（`ci.yml` の vitest ミラー、`at-check-coverage.yml` のステップ）と
lefthook pre-push で走る。したがって rule ファイルは強制力を足さず、足すのは編集時の
案内だけになる。その案内はガードが失敗時に印字する内容とほぼ同じで、しかも
`docs/acceptance/**` は大半の PR で触るパスなので、常時コンテキストに載る。

**marker を教える場所は失敗出力ただ 1 つ**にする。上の 3 条件も出力に含め、`HOW_TO_FIX`
を export してテストで固定した。実装に条件を足したのにメッセージを更新し忘れる形の
drift はこれで落ちる。

`.claude/rules/krs-fences.md` が rule のまま残るのは、「抜粋にするか、包んで完全に
するか」というガードが印字できない**判断**を教えているからである。判断が無く、
コマンドと記法しか無いものは rule にしない。

### 5. karasu の `scripts/lint/` で育て、上流化は Issue で追う

`@kompiro/adr-tools` / `@kompiro/tpl-tools` には入れない。

- 両ツールとも frontmatter だけを読む設計で、本文は読まない
- 31 件のうち上流の管轄は TPL の 7 件だけで、`docs/acceptance/` の 21 件と
  `docs/design/` の 3 件を持つツールが存在しない
- `docs/design/` を adr-tools に持たせるのは、ADR-1357 が「scope が膨らみ release
  cycle が結合する」として却下した方向にあたる

adr-tools（約 2,580 LOC、ADR-1077）も tpl-tools（約 1,100 LOC、ADR-1357）も karasu の
`scripts/` で育ててから抽出した。同じ道筋を取る。切り出しを安くするため、走査
ディレクトリ・除外セグメント・marker 名は module の定数にし、`check()` は karasu 固有の
知識を持たない純関数にした。TPL 分の上流化は tpl-tools#17 で追う。

### 6. 配線

| 場所 | 何を捕まえるか |
| --- | --- |
| `ci.yml` の `Check`（`test:scripts` 経由の vitest ミラー） | ソースを削除・リネームしたコード PR |
| `at-check-coverage.yml` の `Check` ステップ | docs のみの PR（`ci.yml` は `paths-ignore: docs/**` で skip される） |
| lefthook pre-push（**glob なし**） | push 前のローカル。glob を置かない理由は `adr-check-assumptions` と同じで、参照を腐らせるのは docs を 1 つも触らないコード変更だから |

## 理由

- **判定基準が 1 つに畳めている** — 「コードスパンのパスは実在する。できない理由をその
  行の上に書いた場合を除く」。場面の数え上げをしていないので、書き手が覚えることが少ない
- **宣言が記録として読める** — 「なぜ不在なのか」がその行の隣に残る。抑止コメントは
  情報を消すが、宣言は情報を足す
- **逆向き検査が宣言の寿命を主張の寿命に一致させる** — 宣言が主張より長生きできない
- **維持物を増やしていない** — 許可リストのファイルも、仮名の deny-list も無い
  （ADR-2125）

## 却下した案

- **`docs/design/` を対象から外す**: 設計ドキュメントが「これから作るファイル」を
  名指しするのは正常だから、という理屈は成り立つ。しかし逆向き検査を入れると、その
  正常な状態を宣言でき、かつ実装完了を検出できる。外すより情報が増えるので却下
- **脱出口を作らず 7 件すべて書き換える**: 維持するものはゼロだが、次に履歴を書いた人が
  CI で詰まったとき書き換える以外の逃げ道がない。ガードは 1 週間で無効化される
- **別ファイルの許可リスト**: ADR-2125 が退役させた「lint のためだけに存在する map」に
  なる。宣言を記録本文に置けば、記録と一緒に動き、一緒に消える
- **`git check-ignore` で生成物を判別**: 開発者個人の global excludes を読むため CI と
  手元で答えが変わる。`out/` が実際にその状態だった
- **散文中の裸パスも照合**: コードスパンだけで 31 件すべてが取れており、裸パスまで
  見ると仮名のための deny-list が要る
- **`.claude/rules/record-source-paths.md` を置く**: 実装当初は置いたが、検査が CI と
  pre-push にある以上は強制力を足さず、内容は失敗出力の写しだった。決定 4 のとおり削除
- **上流（adr-tools / tpl-tools）に最初から実装する**: 決定 5 のとおり、管轄が 3
  ディレクトリに揃わず、両ツールの frontmatter 限定という設計線を越える

## 影響

- `docs/{acceptance,test-perspectives,design}` を書くとき、コードスパンのソースパスは
  実在するか、理由付きで宣言されているかのどちらかになる
- 未実装の設計ドキュメントは、実装された時点で CI が落ちて ADR 昇格を促す
- TPL-2254 のチェックリストに強制コマンドが入った
- ソースをリネーム・削除する PR は、記録側の張り替えを同じ PR で求められる
