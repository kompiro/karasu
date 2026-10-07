---
id: ADR-2677
title: "言語 v2.0 を実施する: tag / annotation 語彙を閉じ、facet と boundary を core にし、受理しない構文を error と定義する"
status: accepted
date: 2026-10-07
topic: core-concepts
depends_on:
  - ADR-1314
  - ADR-1820
  - ADR-2065
  - ADR-2124
related_to:
  - ADR-2165
  - ADR-2208
  - ADR-2501
  - ADR-2522
  - ADR-2172
  - ADR-1974
  - ADR-2036
  - ADR-2161
  - ADR-2234
  - ADR-2173
  - ADR-2174
  - ADR-837
scope:
  packages: [core, i18n, lsp, cli, app, vscode]
assumptions:
  - "grep: packages/core/src/language-version.ts :: KRS_LANGUAGE_VERSION = \"2.0\""
  - "symbol: packages/core/src/builtins/tool-vocabulary.ts :: selectorUsesToolVocabularyOnly"
  - "symbol: packages/core/src/builtins/tool-vocabulary.ts :: nearestToolAnnotation"
  - "symbol: packages/core/src/style/cascade.ts :: flattenSheetsInCascadeOrder"
  - "symbol: packages/vscode/src/render-gate.ts :: gateRender"
  - "file: packages/core/src/builtins/tool-vocabulary.test.ts"
  - "file: docs/acceptance/2677-language-v2.md"
---

# ADR-2677: 言語 v2.0 を実施する: tag / annotation 語彙を閉じ、facet と boundary を core にし、受理しない構文を error と定義する

- **日付**: 2026-10-07
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2677](https://github.com/kompiro/karasu/issues/2677)（語彙の閉鎖 + `facet` の core 昇格）、[#2678](https://github.com/kompiro/karasu/issues/2678)（`boundary` の core 昇格）、[#2924](https://github.com/kompiro/karasu/issues/2924)（`node-not-in-context` の error 化）
  - 設計 PR [#2925](https://github.com/kompiro/karasu/pull/2925)、実装 PR [#3071](https://github.com/kompiro/karasu/pull/3071)
  - [ADR-2065](2065-tags-and-facets.md): v2.0 の到達点（register の確定・閉鎖・facet と boundary を主軸に）。本 ADR はその実施
  - [ADR-1314](1314-krs-spec-v1-freeze.md): 言語版のセマンティクス（追加は minor、破壊は major）。本 ADR はそれを初めて行使する
  - [ADR-1820](1820-notation-promotion-gate.md): promotion gate。本 ADR がトリガー (i) で発火させた
  - [ADR-2165](2165-logical-containment-rules.md): containment 規則。v1.x の warning と、v2.0 での error 化の予約
  - [ADR-2208](2208-positional-label-error-promotion.md) / [ADR-2501](2501-errored-edge-declaration-renders-nowhere.md): warn-don't-error は未解決参照についての方針であり、error のある間は図を描かない

## 背景

ADR-2065 は v2.0 の到達点を決めたが、実施そのものは範囲外とし、「実施時には ADR-1314 との関係を新 ADR で明示する」と残した。v1.x で出せるスライスは facet / boundary の両 Epic とも全消化しており、残りは言語の major 1 回だけだった。

実施を止めていたのは ADR-1820 の既定「証拠が無ければ experimental 据え置き」である。ところが facet の promotion trigger が求める証拠は来ないことが実測で確定していた。第三者の `.krs` は公開コードに実在せず（ADR-2522 決定 3）、builtin 追加要望・混乱 Issue・excludes の要望も 2026-09 時点でゼロだった。証拠待ちを続けると v2.0 は永久に来ない。

オーナーは v1.x の experimental 分を出し切るリリース（0.7.0、2026-09-27）の後、boundary と facet を言語 v2.0 で採用すると判断した。あわせて、ADR-2165 が v2.0 に予約していた `node-not-in-context` の error 化と、`annotation-possible-typo` の error 化も v2.0 に取り込むと決めた。

## 決定

**`.krs language v2.0` を 1 本の実装 PR で実施する。tag / annotation の語彙をツール語彙に閉じ、`facet` と `boundary` を core に昇格し、2 つの診断を error にし、error を「受理しない構文（またはプロジェクト単位の不備）で、error のある間はどの surface も新しい図を出さない」と定義する。**

### 決定事項

1. **言語版**: `KRS_LANGUAGE_VERSION = "2.0"`。リリースの changeset / CHANGELOG に `.krs language v1.0 → v2.0` を明記する（ADR-2124）。パッケージ版は言語版と独立に semver で決め、本 ADR では決めない（パッケージどうしの版を揃える案は #2936 で検討して取り下げた）。
2. **gate の発火**: ADR-1820 のトリガー (i)「その notation に触れるリリースの直前」で、オーナー判断により昇格を決めた。ADR-1820 の既定は否定しない。既定が守るのは「昇格先も形も未定のものを硬直化させない」ことで、本件は昇格先が ADR-2065 で確定済みであり、残る不確実性は形の妥当性だけだった。
3. **core 昇格**: `facet`（ADR-2173 / 2174 + edge facets #2544）と `boundary`（ADR-1974 / 2036 / 2161 / 2234）を、現行 spec の形のまま後方互換を約束する core にする。Reference データの experimental フラグは両方とも外し、experimental バッジの機構は将来の notation のために残す。
4. **語彙の閉鎖**: ツール語彙 = builtin タグ表 + system-assigned タグ + builtin annotation 表（`builtins/tool-vocabulary.ts` が唯一の定義）。非 builtin の tag / annotation は受理し、効果を持たず、`tag-not-builtin` / `annotation-not-builtin` で警告する（TPL-1503 状態 (2)。parse error にはしない）。
5. **任意名セレクタの無効化**: ツール語彙の外の tag / annotation を名指すセレクタのルールは、**ルール全体が何にも一致しない**。項だけを無視すると `service[pci]` が全 service に広がるので採らない。判定は `flattenSheetsInCascadeOrder` の 1 箇所で行い、ノード・エッジ・deploy・org・annotation バッジ・legend の swatch が同じ規則に従う。`legend-ref-unresolved` と `style-conflict` の索引も同じ判定を使う。`style-*-selector-not-builtin` は warning のまま、「このルールは適用されない」と伝える唯一の手がかりにする。
6. **system-assigned タグの補完**: system シートが狙うタグはすべてツール語彙に入っていなければならない。`delivers`（`delivers` プロパティから導出した edge に付く）が漏れていたので追加した。既定テーマ・アイコンテーマの全ルール、ソースが付与するタグ、infra サブ kind からの推論タグがツール語彙に収まることをテストで固定する。
7. **`node-not-in-context` を error に**: `canContain` に無い入れ子は拒否し、そのノードを subtree ごとモデルから除く。ブロックは閉じ括弧まで読むので後続はパースされ、除いたノードへの参照は §S6 の warning になる。唯一の発火元を失った `unassigned-usecase` は廃止した。`translate --from openapi` と `--from db --emit-bindings` は usecase を仮置きの domain に包んで出力する。
8. **`annotation-possible-typo` を error に**: builtin annotation 名との距離が予算内（builtin 名 4 文字以下は 1 編集、それより長ければ 2 編集。隣接 2 文字の入れ替えは 1 編集）の非 builtin 名は綴り誤りとして拒否し、annotation をモデルに入れない。parser の診断として出し、stylesheet による抑制は撤去し、`annotation-not-builtin` とは排他にする。`@news` のように `@new` に近い短い名前も error になることは受け入れ、メッセージに候補名を必ず含める。
9. **error の定義**: error は、モデルを書かれたとおりには受理できないことを表す。言語が拒否する構文（parser が該当構文をモデルから除く）か、import 先の欠落・id の重複のようなプロジェクト単位の不備である。原因によらず、error が 1 件でもある間は **どの surface も新しい図を出さない**。app と VS Code のプレビューは同じ対象の直前の有効な図を出し続け、`karasu render` / `subtree` は何も書かずに exit 1、share・serve・nest の描画エンドポイントは 422 を返す。VS Code のプレビューだけが部分モデルを描いていたので、`render-gate.ts` で揃えた（古い描画結果が新しい結果を上書きしないよう、シーケンス番号で捨てる）。
10. **warn-don't-error の範囲**: warn-don't-error は未解決の参照（spec §S6）についての方針であり、構文の書き方を受理するかは別の問題である（ADR-2208 / ADR-2501 の読み）。roadmap と `docs/concepts.md` の記述をこの範囲に絞った。
11. **concepts の改訂**: `docs/concepts.md` の「the tag system itself stays open」を閉鎖原則で置き換えた。ツールが語彙の宇宙を所有するもの（アーキタイプ・lifecycle）は閉じ、世界が所有するもの（client `capability`）は open のまま（ADR-837）。
12. **ADR-1314 との関係**: ADR-1314 は supersede しない。ADR-1314 が定めた言語版セマンティクスを初めて行使する major であり、v1.0 の凍結スコープのうち v2.0 で終了・変更したのは次の 3 点に限る。
    - open な tag set / annotation set
    - 任意名セレクタの照合
    - 診断 register の 2 点の格上げ（`node-not-in-context` warning → error、`annotation-possible-typo` info → error）

## 理由

- **半分だけの v2.0 をリリースさせない**: 言語版は 1 つの定数で表明する。挙動が変わる部分（閉鎖・セレクタ無効化・2 つの error 化）が言語版の更新より先に main に入ると、月次トレインが「言語 v1.0 のまま破壊的変更を含む」リリースを出しうる。act ごとに別 PR にする案（#2926 / ADR-2678 案）もあったが、boundary の昇格は #3071 に畳み込み、ADR-2678 は作らずに本 ADR に記録を一本化した。
- **判定を 1 箇所に置く**: ルールを集める入口で絞れば、照合関数ごとに条件を足すより漏れが出ない。legend と診断の索引が cascade と食い違うと「あちらでは効かないのにこちらでは効く」ルールが生まれる（TPL-2234）。
- **綴り誤りと未知の語は性質が違う**: `@depracated` の著者は builtin の効果を意図していて、残すと効果が黙って消える。`@team_alpha` の著者は効果が無いことを知って書ける。前者を error、後者を warning にする非対称を明示的に採る。
- **error の定義は既存挙動の明文化**: app・CLI・serve・share・nest・docs-site はすでに error のある間は描かなかった。定義に格上げすることで VS Code だけの例外を消し、「error を直さないと図が変わらない」が全 surface で一貫する。

## 却下した案

- **証拠が来るまで据え置く**（ADR-1820 の既定どおり）: 証拠源が実在しないので終わりが無い。ADR-2065 の決定が恒久的に未実施のまま、v1.x の警告文（「v2.0 では…」）が約束を果たさない。
- **containment の error 化を見送り、次の major へ回す**: 設計時の推奨案だった。warn-don't-error と衝突すると見ていたが、warn-don't-error の対象は未解決参照であり（ADR-2208 / ADR-2501）、containment 違反は構文の受理形の問題なので衝突しない。オーナー判断で v2.0 に取り込んだ。
- **`annotation-possible-typo` を `annotation-not-builtin` に統合する**: v1.x の spec が予告していた案。綴り誤りは builtin の効果を黙って失わせるので、warning への統合ではなく error にした。
- **error の構文だけ除いて残りを描く（部分描画）**: error があるのに一見正常な図が出る。parser の回復は一様でなく（`infra-not-in-context` はキーワードしか消費せず後続が崩れる）、著者が書いていない構造を描きうる。既存 error の回復の不統一は別 Issue（#3072）で扱う。
- **セレクタの非 builtin 項だけを無視する**: ルールが広く当たりすぎる。
- **act ごとの 3 PR + 言語版更新 PR**: PR は小さくなるが、途中で月次トレインが走らないよう挙動の変わる PR をまとめてマージする運用が要る。
- **パッケージ 3 つを同じ版で上げる（changesets の `fixed`、#2936）**: 1.0.0 に上げるとき core の TS API まで同時に約束することになり、semver を正直に保てない。リリースのタイミングはトレインで揃え、版は独立に保つ。

## 影響

- **error になるモデル**: `node-not-in-context`（v1.x で warning 済み）か builtin annotation 名の綴り誤りを含むモデルは、v2.0 で図が描かれなくなる。移行は v1.x のうちにこの 2 つの診断を 0 にしてから上げる。`karasu fmt` は error のある source を拒否するので、手で直す。
- **見た目が変わるモデル**: 任意名 tag / annotation セレクタでスタイルを当てていたモデルだけ。v1.x から出ている `style-*-selector-not-builtin` が移行対象を指す。facet 宣言 + `facets` + `[facets=<id>]` に書き換えれば同じ見た目に戻る（specificity は同点）。
- **後続**: docs-site の gallery と home への反映（#2937）、既存 error の回復の統一（#3072）、service 直下の usecase 用で到達不能になったビューのコード経路の撤去（#3073）。
- **AT**: [AT-2677](../acceptance/2677-language-v2.md)。
