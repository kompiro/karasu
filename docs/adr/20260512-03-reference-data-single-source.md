---
id: ADR-20260512-03
title: "in-app Reference データを `reference-data.ts` に集約し、docs/spec のテーブルと Reference サンプルを生成する（単一の真実の源）"
status: accepted
date: 2026-05-12
topic: build
depends_on:
  - ADR-20260322-01
related_to:
  - ADR-20260405-05
scope:
  packages:
    - core
  concerns:
    - i18n
assumptions:
  - "grep: packages/core/src/builtins/reference-data.ts :: export const REFERENCE_DATA"
  - "grep: package.json :: \"gen:reference\""
  - "grep: scripts/reference/gen-docs.ts :: gen:reference:"
---

# ADR-20260512-03: in-app Reference データを `reference-data.ts` に集約し、docs/spec のテーブルと Reference サンプルを生成する（単一の真実の源）

- **日付**: 2026-05-12
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1296](https://github.com/kompiro/karasu/issues/1296)（in-app Reference panel を `docs/spec` と同期し続ける）
  - 設計検討・実装トラッキング: [#1328](https://github.com/kompiro/karasu/issues/1328)（旧 `docs/design/reference-from-spec.md` — 本 ADR に集約して削除）
  - 実装 PR: [#1336](https://github.com/kompiro/karasu/pull/1336)（Phase 1: `reference-data.ts` 抽出）、[#1339](https://github.com/kompiro/karasu/pull/1339) / [#1343](https://github.com/kompiro/karasu/pull/1343) / [#1347](https://github.com/kompiro/karasu/pull/1347)（Phase 2: spec-doc テーブル生成）、[#1346](https://github.com/kompiro/karasu/pull/1346)（reference-docs-check 専用 workflow）、[#1348](https://github.com/kompiro/karasu/pull/1348)（Phase 3: Reference サンプルを examples から取得）
  - 前提 ADR: [ADR-20260322-01](20260322-01-builtin-style-and-reference.md)（`getReference()` / `ReferencePanel` の初出、ビルトインスタイルの一元化、reference を JSON 化する案を却下）
  - 関連 ADR: [ADR-20260405-05](20260405-05-database-as-first-class-node.md)（infra-layer ノードのファーストクラス化 — `### Infra layer` テーブルの内容に対応）
  - TPL: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（人間向け spec ドキュメントと in-app reference データの同期）

## 背景

karasu の構文・スタイル仕様は「同じ内容を複数箇所で手書きしている」状態だった。

| 役割 | 場所 |
|---|---|
| 人間向け正典（en / ja） | `docs/spec/{syntax,style,tags-annotations}.md`（および `.ja.md`） |
| in-app Reference データ | `packages/core/src/builtins/reference.ts`（`getReference(locale)` — 構造化配列 + `STRINGS_EN` / `STRINGS_JA`） |
| in-app Reference サンプル | `reference.ts` の `SAMPLE_KRS_JA` / `SAMPLE_KRS_EN`（数百行の inline `.krs`） |

[#1296](https://github.com/kompiro/karasu/issues/1296) で表面化したとおり、新しい style プロパティ / shape / タグ / アノテーション / ノード種別が片方（多くは spec doc）に landed しても、もう一方は更新されず、Reference パネルが静かに古くなる。`#1303` で片方向の subset smoke test（`reference-spec-sync.test.ts`）を入れたが、それは「同期忘れに気づける」状態を担保するだけで、複数箇所を手で揃え続ける構造そのものは残っていた。

選択肢の比較は旧 `docs/design/reference-from-spec.md`（および #1328 のディスカッション）にあるが、要点は: (B) 散文の spec doc を機械可読データとして parse する案は本質的に脆く、spec doc を全面的に表へ寄せると人間向けドキュメントとしての価値を損なう; (C) 機械可読データファイルを正典にし、`reference.ts` も spec doc のテーブルもそこから生成する案が現実的、というもの。案 C を採用した。

## 決定

1. **`packages/core/src/builtins/reference-data.ts` を in-app Reference データの単一の真実の源とする。** ノード種別 / deploy unit 種別 / org 種別 / タグ / アノテーション / style プロパティ / shape を、各 description（および curated 列: annotation の `defaultRendering`、tag の `defaultEffect` / `formFactor`、shape の `typicalUse`、infra ノードの `infraLayerLabel` / `infraIntendedUse`）を `{ en, ja }` で同居させた TypeScript データとして保持する。`getReference(locale)` は `REFERENCE_DATA` を locale 別に `KarasuReference` へマップするだけの薄い adapter になる（公開型・シグネチャは不変、`ReferenceLocale` はクロスパッケージ依存を避けるためのローカル alias のまま）。

2. **`docs/spec/{syntax,style,tags-annotations}.md`（および `.ja.md`）の機械可読なテーブルを `reference-data.ts` から生成する。** `scripts/reference/gen-docs.ts` が各テーブルを `<!-- gen:reference:<id> -->` 〜 `<!-- /gen:reference:<id> -->` マーカー区間に書き込む（`docs/adr/effective.md` の auto-generation と同じ発想、テーブル単位にスコープして散文は手書きのまま）。生成対象: Annotations テーブル、shape テーブル、Tags テーブル、client form-factor テーブル、deploy-unit テーブル、`### Logical structure` ノードテーブル、`### Infra layer` ノードテーブル。`pnpm gen:reference` が書き込み、`pnpm gen:reference --check` が staleness で非ゼロ終了する。

3. **Reference パネルの "Samples" タブの内容は `examples/getting-started/`（`examples.ts` の `GETTING_STARTED_PROJECT` / `GETTING_STARTED_PROJECT_EN`）から取得する。** `reference.ts` の inline `SAMPLE_KRS_*` は削除。`examples/ ↔ examples.ts` の同期は既存の `.claude/rules/examples-sync.md` と `/update-examples` スキルが担保する。

4. **drift 防止の配線**: `pnpm gen:reference --check` を (a) lefthook `pre-push` の `reference-docs-check`（glob: `docs/spec/**` / `reference-data.ts` / `scripts/reference/**`）、(b) `ci.yml` の Check ジョブのステップ、(c) docs-only PR でも走る専用 workflow `reference-docs-check.yml`（+ `reference-docs-check-skip.yml` stub、`adr-validate.yml` を踏襲）で実行する。さらに `scripts/reference/gen-docs.test.ts` がコミット済みドキュメントが in-sync であることを assert する（`test:scripts` に乗る）。

5. **round-trip の担保は `gen:reference --check` に集約する。** `reference-spec-sync.test.ts`（spec doc の keyword ⊆ `getReference()` データ の片方向 subset チェック）は移行期の安全網としてそのまま残す — `--check` が「reference データ → spec doc テーブル」を縛り、spec-sync test が「spec doc 散文の keyword → reference データ」を縛るので、双方向が別々の機構でカバーされる。TPL-20260511-02 は `#1337` で逆方向（parser → spec doc）も含めて改訂済み。

## 理由

- **散文を parse する（案 B）のではなく data から表を生成する（案 C）方が堅牢**。`docs/spec/*.md` は散文・表・コードフェンスが混在する人間向けドキュメントで、全部を data 化すると可読性を損なう。逆向き（data → 表）はマーカー区間の codegen で容易に実現でき、散文はそのまま手書きで残せる。
- **i18n が構造的に安全になる**。description が `reference-data.ts` に `{ en, ja }` で同居するので、`STRINGS_EN` / `STRINGS_JA` の片落ち（一方の locale だけ `undefined` — TPL-20260511-02 の失敗モード）が起こりえない。`.ja.md` のテーブルも同じソースから生成されるので doc ↔ doc の同期問題も消える。
- **データファイルを `.ts` にしたのは ADR-20260322-01 の制約を守るため**。ADR-20260322-01 は reference を JSON 化する案を「`?raw` 等のビルド設定が必要で複雑化する」として却下している。`.ts` データファイルなら型安全（`satisfies ReferenceData`）かつビルド設定不要で、その判断と整合する。codegen はビルド時ではなく `tsx` で走る別スクリプト（`docs/adr/effective.md` の生成と同じ運用）。
- **Reference サンプルを examples から取得することで第三の手書きコピーが消える**。旧 `SAMPLE_KRS_*` は `examples/getting-started/index.krs` の古い派生コピーで、example 側が `operations` / `capability` を獲得した後も追従していなかった。canonical な example を指すことで `examples/ ↔ examples.ts` の単一の同期レジームに一本化される。
- **マーカー区間方式は誤編集リスクを `--check` + lefthook + 専用 workflow + テストで多重に担保する**。マーカーには `DO NOT EDIT — generated from reference-data.ts; run pnpm gen:reference` を明記。

## 却下した案

### 案 B: `docs/spec/*.md` を機械可読データとして parse し `reference.ts` のデータを生成

散文に埋まった情報（`canContain` / `properties` / `defaultBadge` / `operations` の verb 一覧 / edge `direction` の honored values 等）は機械抽出できず、spec doc を「全部表」に作り変える必要があり、人間向けドキュメントの可読性を犠牲にする。i18n も `.ja.md` を「日本語側の正典」に昇格させてセル単位で 1:1 対応させる制約を課すことになり、doc ↔ doc の同期問題に置き換わるだけ。

### 案: 現状維持 + smoke test を厚くする

`reference-spec-sync.test.ts` の抽出カテゴリを増やすだけでも #1296 の drift-prevention は満たせるが、「複数箇所を手で揃える」構造が残り、新カテゴリのたびに smoke test 側も足す必要がある（メタな drift）。drift に気づけても drift 自体は防げない。
