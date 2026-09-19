# TPL 本文のソースパス照合を `@kompiro/tpl-tools` に明け渡す

- **日付**: 2026-09-19
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2810](https://github.com/kompiro/karasu/issues/2810)（Adopt tpl-tools' body source-path check for docs/test-perspectives）
  - 関連 ADR: [ADR-2648](../adr/2648-record-source-path-guard.md)（本ガードの決定。決定 5 で「TPL 分の上流化は tpl-tools#17 で追う」と書いた）, [ADR-1357](../adr/1357-tpl-tools-extraction.md)（tpl-tools 切り出し）, [ADR-2687](../adr/2687-adr-body-is-immutable.md)（ADR 本文は不変）
  - 上流: [kompiro/tpl-tools#17](https://github.com/kompiro/tpl-tools/issues/17), [#24](https://github.com/kompiro/tpl-tools/issues/24)（`@kompiro/tpl-tools` v0.0.10 で `tpl validate --source-prefix` として出荷）
  - 関連 TPL: [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)（記録は記録より長生きするアドレスを指す — 本文が本ガードのコマンド名と対象ディレクトリを名指ししている）, [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)（gate 側で走らない検証は存在しない検証）, [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)（両側の変更で起動させる）
  - コード: `scripts/lint/record-source-paths.ts`, `.github/workflows/at-check-coverage.yml`, `.github/workflows/ci.yml`, `.github/workflows/tpl-validate.yml`, `lefthook.yml`

## 背景・課題

ADR-2648 は「記録が名指すソースパスは working tree に実在する」を機械で照合するガードを
`scripts/lint/record-source-paths.ts` に置いた。走査対象は `docs/acceptance` /
`docs/test-perspectives` / `docs/design` の 3 ディレクトリである。その決定 5 は、これを
karasu の `scripts/lint/` で育てたうえで **TPL 分は上流に出す**と明記していた
（「TPL 分の上流化は tpl-tools#17 で追う」）。

その上流化が済んだ。`@kompiro/tpl-tools` v0.0.10 が `tpl validate --source-prefix <dir>` を
出荷し、TPL 本文のインラインコードスパンを working tree と照合する。marker の綴りは
`absent-path-next-line` で意図的に同一なので、記録が repo 間を移動しても意味を保つ。

したがって `docs/test-perspectives` は**同じ検査を 2 つの実装が持つ**状態になる。Issue
#2810 が問うているのはここで、放置すると 2 実装が互いに気付かないまま乖離する。

## 現状（インベントリ）

### 2 実装の規則差

両者を同一 corpus に当てて測った。**現行 corpus ではどちらも finding 0 件**
（local: `docs/test-perspectives` 0 件 / tpl-tools: 144 TPL を検証して 0 件）で、corpus に
実在する 5 件の `absent-path-next-line`（うち 2 件は list item 内で字下げ）と、TPL-2254 が
散文中にコードスパンとして書いている marker の綴りについても両者は一致している。

ただし**緑同士の一致は規則の一致を意味しない**。実在の `packages/` / `scripts/` ツリーを
symlink した fixture に、差が出うるケースを書いた TPL 本文を当てて差分を取った。

| ケース | local guard | `tpl validate --source-prefix` |
| --- | --- | --- |
| A. 素の不在パス | 報告 | 報告 |
| B. `packages/e2e/test-results/<absent>.png` | 無視（repo 固有の生成物セグメント） | **報告** |
| C. `packages/core/build/<absent>.ts` | **報告** | 無視（`build` を生成物に含む） |
| D. 改行を跨ぐコードスパン | どちらも無報告 | どちらも無報告 |
| E. **block quote 内の fence** のコードスパン | **報告（false positive）** | 無視 |
| F. **block quote を通した marker** | **報告（false positive）** | 無視 |
| G. 余った marker（次行のパスが全部実在） | 報告 | 報告 |
| H. 理由の無い marker | 報告 | 報告 |

差は双方向にあり、B と C は現行 corpus に実例が無い。**E と F は local 側の読み違い**で、
tpl-tools のほうが Markdown を正しく読む（段落単位で読み、block quote と list item の中の
fence を認識し、宣言を block quote 越しに読む）。

### 強制力の配線

| 検査 | 走る場所 | Required か |
| --- | --- | --- |
| `lint:record-source-paths` | `ci.yml` の `Check`（`test:scripts` の vitest ミラー経由）／`at-check-coverage.yml` の `Check`／lefthook pre-push（glob なし） | **Required**（`Check`） |
| `tpl:validate` | `tpl-validate.yml` の `TPL validate`／lefthook pre-push（glob `{docs/test-perspectives/**,tpl.config.json}`） | **Required でない** |

Required な status check の context は `Check` / `Validate` / `Reference docs` / `Playwright`
の 4 つ。`tpl-validate.yml` の job 名は `TPL validate` で、そのファイル自身が
「Still informative-only — not a required check yet」と書いている。

**Issue #2810 の「narrow」案をそのまま実施すると、TPL 本文のソースパス照合は Required な
`Check` から informative-only な workflow に降格する。** Issue はこの点に触れていない。

さらに `at-check-coverage.yml` は `paths:` が docs 側に限られるため、**コードを消した PR**
（ADR-2648 の発端である #2604 がまさにそれ）を捕まえているのは `ci.yml` の `Check` で走る
vitest ミラーのほうである。narrow するとこの経路も TPL 分を見なくなる。

## 制約・前提

- ADR-2648 の本文は書き換えない（ADR-2687）。本 Design Doc は新しい ADR に昇格し、決定 5
  と決定 6 を上書きする形で記録する
- marker の綴り `absent-path-next-line` は上流と一致しているので、corpus の既存記述は
  どちらの実装でもそのまま通る（実測済み）
- ruleset（Required context の一覧）は触らない。context を増やす変更は merge 順序の制約を
  生むので、既存の Required job にステップを足す形で解く
- `docs/acceptance` と `docs/design` を持つ上流ツールは存在しない。ローカルガードは残る

## 検討した選択肢

### 案1: 両方走らせる（keep both）

`tpl-tools` を bump して `--source-prefix` を足し、`SCANNED_DIRS` は触らない。

**メリット**

- 差分が最小。強制力も現状維持
- B と C の両方が報告される最も厳しい状態になる

**デメリット**

- `docs/test-perspectives` が 2 実装に二重に検査され、上の表のとおり**既に乖離している**。
  Issue が懸念した drift は仮定ではなく実測された事実
- E と F では local の false positive が勝つ。TPL 本文が block quote の中で fence を書くと、
  正しい記述なのに marker でしか回避できない
- ADR-2648 決定 5 が予定した上流化が、永久に「済んでいない」状態で止まる

### 案2: narrow のみ（Issue の記述どおり）

`SCANNED_DIRS` を `docs/acceptance` + `docs/design` に絞り、TPL ディレクトリは
`tpl validate` に任せる。配線は変えない。

**メリット**

- 1 ディレクトリ 1 オーナーになり、E / F の false positive が消える
- ローカル実装が小さくなる

**デメリット**

- **TPL 本文のソースパス照合が Required から外れる**（上記「強制力の配線」）
- コード PR（`ci.yml` の経路）で TPL 分が一切検査されなくなる。ADR-2648 の発端と同じ形の
  変更が、また黙って通る

### 案3: narrow したうえで `tpl:validate` を Required な `Check` に載せる（採用）

案2 に加えて、`tpl:validate` を `ci.yml` と `at-check-coverage.yml` の両 `Check` job から
実行する。これは新しい発明ではなく、**`adr check-assumptions` が既に取っている形**である
（Issue #1480。path-filter された `adr-validate.yml` はコード PR で走らないので、Required な
`Check` にも同じコマンドを置いて穴を塞いだ）。

両 `Check` が `tpl:validate` を持つと `tpl-validate.yml` は完全に冗長になるので削除する。
結果として `tpl validate` は workflow を 1 つ減らしながら Required に昇格する
（ruleset は無変更 — context 名 `Check` は既に Required）。

**メリット**

- 1 ディレクトリ 1 オーナー、かつ強制力は現状以上
- コード PR（`ci.yml`）と docs PR（`at-check-coverage.yml`）の両側で起動する（TPL-1480）
- workflow が 1 つ減り、TPL frontmatter / README index の検証まで Required になる

**デメリット**

- 変更が 3 ファイルの配線に及ぶ
- B（repo 固有の生成物セグメント）が TPL 本文でのみ新たに報告されうる。現行 corpus では
  0 件で、出たら marker で理由付きで宣言できる

## 比較

| 観点 | 案1 keep both | 案2 narrow のみ | 案3 narrow + mirror |
| --- | --- | --- | --- |
| TPL ディレクトリのオーナー | 2 実装 | tpl-tools | tpl-tools |
| 実測済みの乖離 | 残る | 解消 | 解消 |
| E / F の false positive | 残る | 解消 | 解消 |
| コード PR での TPL 検査 | あり（Required） | **無し** | あり（Required） |
| docs PR での TPL 検査 | Required | informative のみ | Required |
| workflow 数 | 変わらず | 変わらず | **1 つ減る** |
| ruleset 変更 | 不要 | 不要 | 不要 |

## 現時点の方針

**案3 を採用する。**

決め手は 2 つ。1 つ目は、Issue が「2 実装が乖離しうる」と書いた懸念が**測ったら既に事実
だった**こと（E / F では local のほうが誤る）。乖離が仮定でない以上、オーナーを 1 つにする
理由は十分にある。2 つ目は、narrow を額面どおり実施すると Required から外れるという、Issue
が見落としていた副作用である。これは `adr check-assumptions` が #1480 で既に解いた形をその
まま当てれば消え、ついでに `tpl-validate.yml` の「not a required check yet」という積み残しも
片付く。

ADR-2648 決定 5 は上流化を予定していたので、本方針は記録済みの決定の**継続**であって反転で
はない。ただし決定 5（走査対象 3 ディレクトリ）と決定 6（配線表）は結果として書き換わるため、
ADR-2687 に従い新しい ADR として起こす。

### 実装の指針

1. `package.json`: `@kompiro/tpl-tools` を `^0.0.10` に bump。`tpl:validate` に
   `--source-prefix packages --source-prefix scripts` を足す
2. `scripts/lint/record-source-paths.ts`: `SCANNED_DIRS` を
   `["docs/acceptance", "docs/design"]` に。ヘッダーコメントと `HOW_TO_FIX` の
   「docs/{acceptance,test-perspectives,design}」表記を更新し、**TPL ディレクトリを外した
   理由（上流が持つ）を `docs/adr/**` を外した理由と同じ場所に書く** — 「見落としだ」と読んで
   後から足されないようにするため
3. `scripts/lint/record-source-paths.test.ts`: 走査ディレクトリの assert を更新し、
   `SCANNED_DIRS` が `docs/test-perspectives` を**含まない**ことを、含まない理由とともに固定する
4. `.github/workflows/ci.yml`: Required な `Check` に `pnpm run tpl:validate` のステップを足す
   （#1480 の `adr check-assumptions` の隣。同じ理由をコメントに書く）
5. `.github/workflows/at-check-coverage.yml`: 同じステップを足し、`paths:` に
   `tpl.config.json` を加える。`docs/test-perspectives/**` が残る理由がガードから
   `tpl:validate` に変わるので、既存コメントを書き直す
6. `.github/workflows/tpl-validate.yml`: 削除（両 `Check` が同じコマンドを持つため冗長）
7. `lefthook.yml`: `tpl-validate` hook から `glob` を外す。理由は `record-source-paths` と
   同一で、TPL のソースパスを腐らせるのは docs を 1 つも触らないコード変更だから
8. `docs/test-perspectives/TPL-2254-…md`: チェックリストと「既知の対処パターン」が
   `pnpm run lint:record-source-paths` と 3 ディレクトリを名指ししている。オーナーが分かれた
   事実に合わせて両コマンドを書き分ける
9. `docs/acceptance/2648-record-source-path-guard.md`: 走査対象が変わる TC を更新する
10. proactive TPL を同 PR で起こす（下記）
11. ADR 昇格: 実装完了後 `docs/adr/2810-tpl-source-path-check-ownership.md` として昇格し、
    本 Design Doc は同じ PR で削除する

### proactive TPL

今回の測定そのものが観点になる。**「緑同士は一致の証明ではない」** — 現行 corpus では両実装
とも 0 件で、差は fixture を組んで初めて見えた。加えて、検査の所有者を移すときは移動先の
**強制力**（Required context か）を確かめる必要がある。後者の原則は TPL-2446（gate 側で
走らない検証は存在しない検証）が既に述べているが、そこでの失敗機構は「対象集合の列挙漏れ」
であって「所有者の移動に伴う降格」ではない。

同 PR で TPL-2810 を起こし、TPL-2446 / TPL-2254 と相互リンクする。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（開発者向けの CI / hook のみ）
- ドキュメント更新: TPL-2254、`docs/acceptance/2648-record-source-path-guard.md`、
  新規 TPL-2810。`docs/process.md` は個別の lint コマンドを列挙していないので変更不要
- テスト・examples への影響: `scripts/lint/record-source-paths.test.ts` のみ
- CI 実行時間: `Check` に `tpl validate`（144 TPL）が 1 ステップ増える。workflow は 1 つ減る

## 未解決の問い / 決めないこと

- **`GENERATED_SEGMENTS` の repo 固有エントリを上流に出すか** — 今回は決めない。B の差
  （`test-results` 等）は現行 corpus で 0 件であり、出たときに marker で宣言すれば足りる。
  実例が複数たまってから上流の Issue にする
- **`docs/acceptance` / `docs/design` も上流ツールに持たせるか** — 持たせない。ADR-2648
  決定 5 の理由（両ツールとも自分の corpus しか持たない）は変わっていない
- **`build` を `GENERATED_SEGMENTS` に足すか**（C の差）— 本 PR のスコープ外。
  `docs/acceptance` / `docs/design` 側の挙動変更になるため、必要なら別 Issue で扱う
