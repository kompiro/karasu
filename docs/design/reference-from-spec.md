# in-app Reference データを `docs/spec/*` から導出する（単一の真実の源）

- **日付**: 2026-05-11
- **Issue**: #1328（親 #1296 の Goal #3）
- **ステータス**: 検討中
- **関連**:
  - 親 Issue: [#1296](https://github.com/kompiro/karasu/issues/1296) — in-app Reference panel を `docs/spec` と同期し続ける
  - 関連 Issue: [#8](https://github.com/kompiro/karasu/issues/8)（structured reference の初出）、[#741](https://github.com/kompiro/karasu/issues/741)（locale 付き `getReference`）、[#1234](https://github.com/kompiro/karasu/issues/1234)（syntax.md の `krs` fence を parser に通す smoke test）、[#1303](https://github.com/kompiro/karasu/issues/1303)（`reference-spec-sync.test.ts` 追加・`styleProperties` ギャップ解消）
  - 関連 ADR: [ADR-20260322-01](../adr/20260322-01-builtin-style-and-reference.md)（ビルトインスタイルの一元化と構造化リファレンス — `getReference()` / `ReferencePanel` の初出。JSON 形式で定義する案を一度却下している）
  - 関連 TPL: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（人間向け spec ドキュメントと in-app reference データは片方向 smoke test で同期を縛る）
  - コード:
    `packages/core/src/builtins/reference.ts`、
    `packages/core/src/builtins/reference-spec-sync.test.ts`、
    `packages/core/src/builtins/default-style.ts`、
    `packages/app/src/components/ReferencePanel.tsx`、
    `docs/spec/syntax.md` / `style.md` / `tags-annotations.md`（および `.ja.md` 版）

## 背景・課題

karasu の仕様は「同じ内容を 2 箇所以上で手書きしている」状態にある。

| 役割 | 場所 | 形式 |
|---|---|---|
| 人間向け正典（英語） | `docs/spec/{syntax,style,tags-annotations}.md` | 散文 + 表 + コードフェンス |
| 人間向け正典（日本語） | `docs/spec/{syntax,style,tags-annotations}.ja.md` | 同上（英語版を翻訳した別ファイル） |
| in-app Reference データ | `packages/core/src/builtins/reference.ts`（`getReference(locale)`） | 構造化配列 + `STRINGS_EN` / `STRINGS_JA` の i18n 文字列 |
| in-app Reference UI（プロセ） | `packages/app/src/components/ReferencePanel.tsx` | ハードコードした `<pre>` コードスニペット |

#1296 で表面化したとおり、新しい style プロパティ / shape / タグ / アノテーション / ノード種別が片方（多くは spec doc）に landed しても、もう一方は更新されず Reference パネルが静かに古くなる。#1303 で `reference-spec-sync.test.ts` を入れて「spec doc が記述する keyword は reference データに必ず存在する」という**片方向の subset チェック**を固定したが、これは「同期忘れに気づける」状態を担保するだけで、依然として 2 箇所を手で揃え続ける構造そのものは残っている。

本ドキュメントは #1296 Goal #3 ——「spec docs を `reference.ts` が生成/導出される single source of truth にできないか」—— を探索し、やる / 部分的にやる / 見送る を判断するための材料を整理する。

## 制約・前提

1. **`packages/core` はクロスパッケージ依存を持たない**。`ReferenceLocale = "en" | "ja"` をローカル alias にしている（app の `Locale` 型に依存しない）のもこのため。生成スクリプトを足すとしても `packages/core` のビルド・テストが他パッケージや外部ファイルに依存しすぎないようにしたい。
2. **`getReference()` はランタイム関数**。app（ブラウザ）バンドルに乗る。`docs/spec/*.md` を実行時に `fs.readFileSync` で読むのは不可（Node 専用 API + バンドルに巨大 markdown が乗る）。「導出」するなら**ビルド時 codegen でコミット済み生成物を作る**か、`?raw` 等で markdown を import してパース、のどちらか。ADR-20260322-01 はビルトインスタイルについて `?raw` import のビルド設定を避ける判断をしている（同じ判断軸が効く）。
3. **i18n が必須**。`getReference("en")` と `getReference("ja")` の両方が解決しないといけない（TPL-20260511-02 の失敗モード「片言語だけ `undefined`」）。英語の spec doc だけからは日本語 description は導出できない。`docs/spec/*.ja.md` も同じ構造を保っていれば日本語側の正典になりうるが、現状 `.ja.md` は英語版を見ながら手で訳した別ファイルで、表のセル単位で機械的に対応づく保証はない。
4. **`reference.ts` の構造化配列は spec doc の散文には存在しない情報を含む**。たとえば `NodeKindInfo.canContain`（`system` が含められる子ノード種別の配列）、`NodeKindInfo.properties`（`label` / `description` / `link` …）、`AnnotationInfo.defaultBadge`（色 / アイコン / ラベル）。これらは syntax.md にも散文では出てくるが、機械的に拾える表の形にはなっていない箇所が多い。
5. **spec doc は散文・表・コードフェンスが混在する人間向けドキュメント**。`docs/spec/syntax.md` は 856 行・40 以上の見出しがあり、ノード種別の一覧は `### Logical structure` 配下の表、`operations` プロパティや verb-decoration 構文は散文 + `krs` フェンス、というように「機械可読な表」と「読ませる散文」が入り混じる。全部を data 化しようとすると spec doc 側を data ファイル化することになり、人間向けドキュメントとしての読みやすさを損なう。
6. **`reference.ts` には `sampleKrs`（数百行のサンプル `.krs` 全文を `SAMPLE_KRS_EN` / `SAMPLE_KRS_JA` として inline 保持）と `builtinStyleSource`（`default-style.ts` の `BUILTIN_STYLE_SOURCE` を再 export）も含まれる**。`builtinStyleSource` はすでに `default-style.ts` という単一定義から導出されている。`sampleKrs` は `examples/` のサンプルと役割が重複している可能性があり、別途整理の余地がある（本 issue のスコープ外だが言及する）。
7. **`reference-spec-sync.test.ts` は片方向（spec → reference）に意図的に絞っている**。「reference にあるが doc にない」を厳密に双方向チェックすると、doc が追いついていない過渡期に test がミュートされる、というのが TPL-20260511-02 の学習。single source 化が完了すれば双方向ギャップ自体が消えるが、移行が完了するまでは片方向のままにする。

## 検討した選択肢

### 案 A: 現状維持 + smoke test を厚くする

`docs/spec/*` と `reference.ts` の二重管理は残したまま、`reference-spec-sync.test.ts` の抽出カテゴリを増やす（現状: style プロパティ / shape / 著者 tag / annotation / logical node kind。追加候補: deploy unit kind の表、org kind の表、`operations` の verb 一覧、`edge#<id>` selector、infra-layer node kind と system-assigned tag）。あわせて #1296 の sub-issue #1326（Syntax タブの散文監査）/ #1327（doc 側ギャップ埋め）で「spec doc 側」を充実させる。

- **メリット**: 追加コストが最小。`reference.ts` がランタイムで完結する現状を崩さない。ADR-20260322-01 の「TS 定数で型安全・テストしやすい」方針と整合。
- **デメリット**: 「2 箇所を手で揃える」構造は残る。新カテゴリが増えるたびに smoke test 側も足す必要がある（メタな drift）。i18n 文字列の片落ちは smoke test では拾いきれない（`locale-coverage.test.tsx` が別途カバー）。
- **#1296 Goal #3 への回答**: 「single source 化は見送り。drift は smoke test で気づける状態を維持する」。

### 案 B: `docs/spec/*.md` を正典に、`reference.ts` のデータを **codegen で生成**

`docs/spec/{syntax,style,tags-annotations}.md`（+ `.ja.md`）の機械可読な表・フェンスをパースし、`reference.ts` の構造化配列と `STRINGS_*` を生成するスクリプト（`packages/core/scripts/gen-reference.ts` 等）を用意。生成物はコミットし、CI で「生成し直して diff が出たら fail」する（`pnpm gen:reference --check`）。`docs:gen` 系のチェックは karasu に前例がある（`docs/adr/effective.md` が auto-generated）。

- **メリット**: spec doc が正典になり、spec doc を直せば reference も追従する（少なくとも表で表現できる範囲は）。
- **デメリット**:
  - 案 5 で挙げた「散文に埋まった情報」（`canContain` / `properties` / `defaultBadge` / `operations` の verb 一覧 / edge `direction` の honored values …）は機械抽出できない。spec doc 側を「全部表」に作り変える必要があり、人間向けドキュメントの可読性を犠牲にする。
  - i18n: `.ja.md` を「日本語側の正典」に昇格させ、英語版と表のセル単位で 1:1 対応する制約を課す必要がある。`.ja.md` は現状その制約を満たしていないので、まず `.ja.md` を再構成する作業が前段に要る。さらに「英語の表に行を足したら `.ja.md` の同じ表にも足す」という別の drift が生まれ、結局 doc ↔ doc の同期問題に置き換わる。
  - markdown を「データソース」として扱う以上、表の列順・コードスパンの書式・見出し階層に**暗黙のフォーマット契約**が生まれる。spec doc を編集するときにこの契約を壊しやすく、`reference-spec-sync.test.ts` 程度の緩い smoke test では検知できない（parser エラーで気づく形になる）。
- **#1296 Goal #3 への回答**: 「spec doc を正典に。ただし大幅な doc 再構成が前提」。

### 案 C: 構造化データを正典に、**`reference.ts` も `docs/spec/*` の表も両方そこから生成**

`packages/core/src/builtins/reference-data.{ts,yaml,json}` のような**機械可読データファイルを single source of truth** にする。`getReference()` はそれを読んで（あるいはそのまま）構造化配列を組み立て、`docs/spec/*.md` の**表だけ**を `<!-- gen:node-kinds -->` 〜 `<!-- /gen -->` のようなマーカー区間に codegen で差し込む（`.ja.md` の表も同じデータの `ja` フィールドから生成）。表の周囲の散文は手書きのまま。`docs/adr/effective.md` の生成と同じ発想。

- **メリット**:
  - 「散文を data に変換する」（案 B、本質的に困難）ではなく「data から表を生成する」（容易）方向なので実装が現実的。
  - i18n が data ファイルに `{ en, ja }` で同居するので片落ちが構造的に起きない。`.ja.md` の表も同じソースから生成されるので doc ↔ doc の同期問題も消える。
  - `canContain` / `properties` / `defaultBadge` 等の「散文に埋まる情報」も data ファイルにフィールドとして持てる（spec doc には散文として残してよい / 表に出してもよい、を選べる）。
  - `reference.ts` は薄い adapter になり、`ReferenceLocale` のローカル alias 制約（制約 1）も維持できる。
- **デメリット**:
  - ADR-20260322-01 は「JSON 形式で定義」案を一度却下している（理由の詳細はその ADR 参照）。`.ts` データファイルにすれば「TS で型安全」は保てるが、`.ts` を「データ」として扱い codegen の入力にするのは少し変則的。YAML/JSON にするとビルド設定（`?raw` or JSON import）が増える ——制約 2 で避けたい論点に触れる。
  - spec doc の「生成区間」と「手書き区間」が混在し、生成区間を誤って手編集する事故が起きうる（`docs/adr/effective.md` は「ファイル全体が生成物」なので事故りにくいが、`docs/spec/*.md` は部分生成になる）。マーカーの外を編集する規律 + CI チェックで担保する。
  - `ReferencePanel.tsx` のハードコード `<pre>` スニペット（散文側の Syntax タブ）はこの仕組みの外。#1326 で手当てするか、`docs/spec/syntax.md` の `krs` フェンスを app バンドルに取り込んで表示する別案が要る。
- **#1296 Goal #3 への回答**: 「single source は spec doc ではなく構造化データファイル。`reference.ts` と spec doc の表をそこから生成」。

### 案 D: ハイブリッド — 当面は案 A、`reference.ts` だけ「データ部」を分離しておく

いま `reference.ts` の中で「構造化配列」と「i18n 文字列辞書」と「`getReference()` の組み立てロジック」が 1 ファイル（951 行）に同居している。これを `reference-data.ts`（純データ、codegen の将来の出力先候補）と `reference.ts`（`getReference()` の組み立て）に分割しておくだけして、codegen 化は将来 Goal #3 の優先度が上がったときに案 C へ移行する。`reference-spec-sync.test.ts` の拡充（案 A の一部）も同時にやる。

- **メリット**: 低リスク。将来の案 C への移行コストを下げる準備だけ済ませる。
- **デメリット**: 「やる」とも「やらない」とも言い切らず先送りするだけ。#1328 の deliverable（判断を記録する）としては中途半端。

## 比較

| | 二重管理の解消 | 実装コスト | i18n の安全性 | spec doc の可読性への影響 | ランタイム制約（制約 1・2）への影響 |
|---|---|---|---|---|---|
| A 現状維持 + smoke test 拡充 | ✗（残る） | 小 | 変わらず（別 test 頼み） | なし | なし |
| B spec doc → reference codegen | △（表の範囲のみ） | 大（doc 全面再構成 + `.ja.md` 正典化） | △（doc ↔ doc 同期に置換） | 大（全部表に寄せる） | `?raw` import 等が必要になりうる |
| C データファイル正典 → 両方生成 | ○ | 中 | ○（data に `{en,ja}` 同居） | 小（表区間のみ生成） | データを `.ts` に保てば影響小、YAML/JSON だと増 |
| D 当面 A + データ部分離 | ✗（残る、準備のみ） | 小 | 変わらず | なし | なし |

## 方針（レビュー反映済み）

レビューでの確認を経て、以下を採る。

- **案 B（spec doc を機械可読データとして parse）は採らない**。「散文から構造を抽出する」方向は本質的に脆く、spec doc を全面的に表へ寄せると人間向けドキュメントとしての価値を損なう。i18n も doc ↔ doc 同期問題に置き換わるだけ。
- **案 C を採用する** —— `packages/core/src/builtins/` 配下に**機械可読な TypeScript データファイル**（仮称 `reference-data.ts`）を置き、それを single source of truth とする。`getReference(locale)` はそれを読んで `KarasuReference` を組み立てる薄い adapter になる。`docs/spec/{syntax,style,tags-annotations}.md`（および `.ja.md`）の**表だけ**を `<!-- gen:… -->` 〜 `<!-- /gen:… -->` のマーカー区間に codegen で差し込む（`docs/adr/effective.md` の auto-generation と同じ発想）。データファイルを `.ts` にするのは ADR-20260322-01 の「TS 定数で型安全・ビルド設定不要」方針との整合のため（`?raw` / JSON import を増やさない）。
- **データファイルの i18n** は各エントリに `{ en, ja }`（あるいは `description: { en, ja }`）を同居させる。これにより `STRINGS_EN` / `STRINGS_JA` の片落ち（TPL-20260511-02 の失敗モード）が構造的に起きなくなり、`.ja.md` の表も同じソースから生成されるので doc ↔ doc 同期問題も消える。
- **`sampleKrs` は `examples/` に寄せる** —— `reference.ts` に inline している `SAMPLE_KRS_EN` / `SAMPLE_KRS_JA`（数百行）は `examples/` のチュートリアル用サンプルと役割が重複している。本作業のスコープに含め、`examples/` の `.krs` を single source とし、`getReference()` の `sampleKrs` はそれを取り込む形にする（取り込み手段はビルド時 codegen か `examples.ts` 経由か、実装 issue で詰める）。`update-examples` skill との関係（`examples.ts` 同期）も実装時に確認する。
- **散文側の Syntax タブ（`ReferencePanel.tsx` のハードコード `<pre>` スニペット）も射程に入れる** —— 当面は #1326 で手当てするが、本 design doc では「`docs/spec/syntax.md` の `krs` フェンスを app バンドルに取り込んで Syntax タブに表示する」方向（#1234 の「syntax.md の `krs` フェンスを parser に通す」smoke test の発想を、表示にも延長する）を将来設計として記す。これにより散文側のコード例も spec doc が正典になる。
- **誤編集防止** —— `docs/spec/*.md` は「生成区間」と「手書き区間」が混在することになるため、(1) `pnpm gen:reference --check`（または既存の `docs:gen` 系チェック）を lefthook / CI に組み込み、生成し直して diff が出たら fail、(2) マーカーコメントに「DO NOT EDIT — generated from `reference-data.ts`」を明記、で担保する。
- **smoke test は移行完了まで残す** —— `reference-spec-sync.test.ts` の片方向 subset チェックは案 C 完成後は冗長になるが、移行中の安全網として残し、移行完了後に「生成物 ↔ ソースの round-trip テスト」へ置き換える（あるいは `gen --check` がその役割を吸収する）。TPL-20260511-02 もこの移行を反映して更新する。
- **新 ADR 化** —— 実装 PR がマージされたら本 design doc を ADR に昇格させる。ADR-20260322-01 を supersede はしない（ビルトインスタイルの一元化という別判断なので）が、背景に「ADR-20260322-01 では reference を JSON 化する案を却下した。本 ADR はその制約（`.ts` で型安全・ビルド設定を増やさない）を守ったまま reference データを single source 化するもの」と明記する。

### 実装の段取り（実装 issue で詰める）

1. `reference-data.ts` を新設し、現在 `reference.ts` の構造化配列 + `STRINGS_*` に散らばっている情報を `{ en, ja }` 同居のデータとして集約。`getReference()` をその adapter に書き換える（`KarasuReference` の公開型・`getReference(locale)` シグネチャは変えない）。
2. codegen スクリプト（`scripts/gen-reference-docs.ts` 等）を追加し、`docs/spec/{syntax,style,tags-annotations}.md` / `.ja.md` の対象テーブルを `<!-- gen:… -->` マーカー区間で生成。`--check` モードを CI / lefthook に組み込む。
3. `sampleKrs` を `examples/` の `.krs` から取り込む形に変更（`update-examples` skill / `examples.ts` との整合を確認）。
4. `reference-spec-sync.test.ts` を round-trip テスト寄りに更新、TPL-20260511-02 を移行後の状態に合わせて改訂。
5. 散文側 Syntax タブ（`ReferencePanel.tsx` の `<pre>`）は #1326 のスコープ。本 design doc の「将来設計」に従い、可能なら同 PR で `docs/spec/syntax.md` の `krs` フェンス取り込みに着手する。
6. AT は `docs/acceptance/` に「`docs/spec/style.md` の Property list 表に行を足す → `pnpm gen:reference --check` が fail することを確認 → 生成し直すと通る」を追加（人間確認が要るのは「生成された Reference パネルの表示が崩れていないか」程度）。
7. design doc を ADR に昇格（cleanup フェーズ）。

> 上記は実装 issue（#1328 から派生して切る）で計画として詳細化する。本 design doc の役割は「案 C を採る」という判断と論拠の記録までで、ここで完了とする。
