# Dependabot トリアージ 2026-08-04 — LSP protocol 単独 bump の退行と oxlint 15 minor 分の新規則

- **日付**: 2026-08-04
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#2324](https://github.com/kompiro/karasu/pull/2324) / [#2325](https://github.com/kompiro/karasu/pull/2325) / [#2326](https://github.com/kompiro/karasu/pull/2326) / [#2328](https://github.com/kompiro/karasu/pull/2328) / [#2329](https://github.com/kompiro/karasu/pull/2329)
  - 直前の triage: [ADR-2318](../adr/2318-dependabot-triage-2026-08-03.md)
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)
  - 運用ルール: `.claude/rules/dependabot.md`
  - コード: `.oxlintrc.json`, `packages/lsp/src/protocol.ts`, `packages/lsp/package.json`, `packages/app/src/components/PreviewPane.tsx`

## 背景・課題

前バッチ（[ADR-2318](../adr/2318-dependabot-triage-2026-08-03.md)）の反映作業中に、新たに 5 件の
Dependabot PR が起票された。同じく全件を upstream まで遡って分析した。

| PR | 依存 | from → to | 種別 | scope | CI |
| --- | --- | --- | --- | --- | --- |
| [#2324](https://github.com/kompiro/karasu/pull/2324) | `vite` | 8.0.16 → 8.1.5 | minor | dev | ✅ 全 pass |
| [#2325](https://github.com/kompiro/karasu/pull/2325) | `oxlint` | 1.61.0 → 1.76.0 | minor ×15 | dev | ❌ Lint |
| [#2326](https://github.com/kompiro/karasu/pull/2326) | `oxfmt` | 0.46.0 → 0.61.0 | minor ×15 (0.x) | dev | ❌ Format check |
| [#2328](https://github.com/kompiro/karasu/pull/2328) | `vscode-languageserver-protocol` | 3.17.5 → 3.18.2 | minor | runtime (lsp) | ❌ ExTester |
| [#2329](https://github.com/kompiro/karasu/pull/2329) | `@astrojs/starlight` | 0.41.3 → 0.41.5 | patch | dev (docs-site) | ✅ 全 pass |

**サプライチェーン上の懸念はゼロ**。一方 3 件が CI red で、原因は 3 つとも別種だった。
うち 1 件（#2328）は**実際の機能退行**であり、これがこのバッチで最も重要な発見である。

## サプライチェーン分析（全 5 件）

registry の `_npmUser` / `dist.attestations` / `dist.signatures` と tarball の `scripts` を確認した。
**新規に install / postinstall / prepare が追加された依存はゼロ**。

| 依存 | publisher | provenance | 備考 |
| --- | --- | --- | --- |
| `vite` 8.1.5 | GitHub Actions（OIDC） | attestations あり | scripts は 8.0.16 と同一 |
| `oxlint` 1.76.0 | GitHub Actions（OIDC） | attestations あり・署名 2 本 | lifecycle script なし |
| `oxfmt` 0.61.0 | GitHub Actions（OIDC） | attestations あり・署名 2 本 | lifecycle script なし |
| `vscode-languageserver-protocol` 3.18.2 | `microsoft1es` | なし | **publisher が `vscode-bot` から変化**（後述） |
| `@astrojs/starlight` 0.41.5 | GitHub Actions（OIDC） | attestations あり | **依存差分ゼロ** |

cooldown（全 semver レベル 7 日）は 5 件すべて充足。最も新しい `@astrojs/starlight` 0.41.5 が
2026-07-28 公開でちょうど 7 日。

### `vscode-languageserver-protocol` の publisher 変化は許容できる

`vscode-bot` → `microsoft1es` に変わっているが、これは Microsoft の 1ES（One Engineering
System）アカウントであり、`monaco-editor` を publish しているのと同じ主体である。
3.17.5 の公開が 2023-09-26、3.18.2 が 2026-06-30 と **3 年近い間隔**があり、その間に社内の
publish 基盤が移行したと見るのが自然。attestations がないのは 3.17.5 も同様で、劣化ではない。

`scripts` は `lint` / `clean` / `compile` などが `../node_modules/...` 直叩きからローカル
バイナリ呼び出しに変わっているが、いずれも**開発用スクリプトであり consumer の install 時には
実行されない**（`prepack` / `prepublishOnly` は publish 側のみ、`prepare` は存在しない）。

## CI red の原因分析

### #2328 `vscode-languageserver-protocol` — 実機能の退行（最重要）

ExTester が 3 件 fail する。**flake ではない** — 判断根拠は 3 つ:

1. **再実行しても同じ 3 件が fail する**（2 回連続、2 回目は AT-0037-9 も追加で fail）
2. **同じ main を base にする #2324 / #2329 では ExTester が pass している**
3. 失敗の症状が「動かない」ではなく**位置がずれる**

```
1) AT-0037-9 — [data-node-id="OrderService"] never picked up class "karasu-highlighted"
2) AT-0038   — editor cursor did not reach line 3 for OrderManagement; last seen line 2
3) AT-0039   — editor cursor did not move to Customer line (expected 17); last seen line 0
```

いずれも editor ↔ SVG preview の双方向同期とノード位置解決に関わる。

#### 直接の構造的原因: protocol の二重化

`vscode-languageserver@9.0.1` は protocol を**範囲ではなく `3.17.5` 完全固定**で依存している:

```
vscode-languageserver@9.0.1  dependencies = { "vscode-languageserver-protocol": "3.17.5" }
```

そのため `packages/lsp` の直接依存だけを 3.18.2 に上げても**サーバランタイムが使う版は
3.17.5 のまま**で、lockfile 上は 2 つの copy が共存する:

```
vscode-languageserver-protocol@3.17.5   ← vscode-languageserver@9.0.1 が使う
vscode-languageserver-protocol@3.18.2   ← packages/lsp/src/protocol.ts が import する
```

正しい組み合わせは `vscode-languageserver@10.1.0` ↔ `protocol@3.18.2`
（10.1.0 が 3.18.2 を固定依存している）。つまり **protocol は単独では上げられない依存**であり、
`vscode-languageserver` の major 更新（9 → 10）とセットでしか成立しない。

#### 破壊の詳細メカニズムは未確定（正直に記録する）

当初は「2 つの `RequestType` クラスの identity 不一致で custom request が dispatch されない」と
考えたが、**これは誤り**だった。`packages/lsp/src/protocol.ts` の冒頭コメントが既にこの懸念に
言及しており、dispatch は method 名の文字列で行われると明記している:

> Runtime request dispatch matches on the method-NAME string
> (`"karasu/nodeAtPosition"` / `"karasu/positionOfNode"`), not on class identity, so the two
> sides interoperate regardless of which package's `RequestType` export constructed each end's value.

実際の症状も dispatch 断絶（まったく動かない）ではなく**行番号がずれる**（3 を期待して 2、
17 を期待して 0）ことなので、identity 説とは整合しない。LSP 3.18 は position encoding
（utf-16 / utf-8 のネゴシエーション）まわりに変更を入れているため、型・変換ロジックの版が
ランタイムとずれた結果として位置計算が狂っている可能性が高いが、**本 Doc の時点では
特定できていない**。

いずれにせよ**推奨アクションは機構の特定を待たずに決まる**（単独 bump は不可、major と
セットで別途取り組む）ため、原因究明は後続 Issue に委ねる。

### #2325 `oxlint` — 15 minor 分の新規則が 87 件ヒット

`pnpm lint` は `oxlint --deny-warnings` なので、**warning も全て失敗要因**である。
1.61 → 1.76 で新たに 6 error + 87 warning が出る。ローカル再現して規則別に集計した:

| 規則 | 件数 | 種別 | 評価 |
| --- | --- | --- | --- |
| `vitest(expect-expect)` | 6 | error | **false positive** |
| `eslint(no-underscore-dangle)` | 85 | warning | 既存規約との衝突 |
| `react(no-object-type-as-default-prop)` | 2 | warning | 1 件は実質的な指摘 |

**`vitest(expect-expect)` 6 件はすべて false positive。** assertion がヘルパー関数の中にある:

```ts
// parser.test.ts:3336
function expectSingleNestedLegendError(source: string, parentKind: string) {
  expect(result.diagnostics).toHaveLength(1);   // ← assertion はここ
  ...
}
it("service: reports once", () => {
  expectSingleNestedLegendError(`...`, "service");   // ← oxlint はここを「assertion なし」と見る
});
```

対象は `parser.test.ts`（4 箇所、`expectSingleNestedLegendError`）、
`escape-round-trip.test.ts`（`expectRoundTrip`）、`wrangler.test.ts`（`assertRoundTrips`）。
**この repo には既に同型の設定前例がある** — `.oxlintrc.json` の overrides で
`packages/vscode-e2e/tests/**` に対し `jest/expect-expect` を
`{ "assertFunctionNames": ["assert", "assert.*"] }` で設定済み。同じ形で解決できる。

**`no-underscore-dangle` 85 件はすべて既存規約との衝突**であってバグではない。内訳は
`__dirname`（Node builtin、9 件）、VS Code 拡張の private field 規約
（`_panel` / `_disposables` / `_viewType` / `_disposed` など）、意図的な未使用マーカー
（`_exhaustive`）、webview の state key（`__themeStamp`）。85 箇所を改名する価値はない。

**`react(no-object-type-as-default-prop)` 2 件のうち 1 件は実質的な指摘。**
`PreviewPane.tsx:78` の `viewPath = []` は毎 render で新しい配列を作るため参照が変わり、
memo 化した子の再 render を誘発しうる。もう 1 件はテストハーネスの `onSelectProject = () => {}`
で無害。

#### 検証済みの解決策

以下を適用して `pnpm lint` が exit 0、app の 103 files / 1136 tests が pass することを確認した:

1. `.oxlintrc.json` に `"vitest/expect-expect": ["error", { "assertFunctionNames": ["expect", "expect*", "assert*"] }]`
2. `.oxlintrc.json` に `"no-underscore-dangle": "off"`
3. `PreviewPane.tsx` にモジュールスコープの `const EMPTY_VIEW_PATH: string[] = []` を置いて既定値に使う
4. テストファイルに対して `react/no-object-type-as-default-prop` を override で off

### #2326 `oxfmt` — 整形結果の変更のみ

0.46 → 0.61 で最終引数のアロー関数を hug する整形に変わり、2 ファイルが差分を持つ:

```diff
-      click(
-        previewContainer as HTMLElement,
-        () => container.querySelector("[data-node-id='svc']")!,
+      click(previewContainer as HTMLElement, () =>
+        container.querySelector("[data-node-id='svc']")!,
       );
```

対象は `packages/app/src/components/PreviewPane.test.tsx` と
`packages/e2e/fixtures/README.md`（コードブロック内の配列）。`pnpm exec oxfmt packages/ scripts/`
を流して commit するだけで解決し、**テストは 1136 件すべて pass する**ことを確認済み。
挙動を変える要素はない。

### #2324 `vite` — green だが monaco 0.56 との組み合わせを実測した

`vite` 8.0.16 → 8.1.5 は依存として `rolldown` を **1.0.3 → ~1.1.5** に上げる。rolldown は
vite 8 のバンドラ本体であり、[ADR-2318](../adr/2318-dependabot-triage-2026-08-03.md) で
壊れた `vite:worker-import-meta-url` プラグインもここに属する。**monaco 0.56 の worker 解決と
干渉しうる**ため、単に CI green を信じずに確認した。

Dependabot は #2321 マージ後にこの PR を rebase しており、CI が走った SHA
（`7f8f02b`）は既に monaco 0.56 を含む。加えてローカルでも
`pnpm --filter @karasu-tools/app build` が成功し、`editor.worker-*.js` が出力されることを
実測した。**組み合わせは問題ない。**

### #2329 `@astrojs/starlight` — 依存差分ゼロの patch

0.41.3 → 0.41.5 で `dependencies` は 29 件すべて完全一致。CI も全 pass。

## 現時点の方針

| PR | 依存 | リスク | 推奨アクション |
| --- | --- | --- | --- |
| #2324 | `vite` | **low** | **マージ推奨** — green、monaco との組み合わせも実測済み |
| #2329 | `@astrojs/starlight` | **low** | **マージ推奨** — 依存差分ゼロ、green |
| #2326 | `oxfmt` | **low** | **close → 人手 PR** — bump + 整形 2 ファイルを 1 コミットに |
| #2325 | `oxlint` | **low**（供給側）/ 設定作業あり | **close → 人手 PR** — bump + `.oxlintrc.json` + 1 箇所修正 |
| #2328 | `vscode-languageserver-protocol` | **medium** — 機能退行 | **却下（close + ignore）** — 別 Issue で major とセット対応 |

#2325 / #2326 は monaco（[ADR-2318](../adr/2318-dependabot-triage-2026-08-03.md)）と同じ理由で
bot PR のままでは green にできない。修正が bump と同一コミットに載る必要があり、bot ブランチに
人手コミットを足しても `@dependabot recreate` で失われるため、
`.claude/rules/dependabot.md`「bot PR を close → 人手 PR で再提出」の型に載せる。

**#2328 だけは他と性質が違い、唯一「今回は採らない」判断になる。** 単独 bump が構造的に
成立しない（`vscode-languageserver@9.0.1` が 3.17.5 を完全固定している）ため、
`@dependabot ignore this minor version` 系のコメントで再オファーを止めたうえで、
`vscode-languageserver` 9 → 10 の major 更新として別 Issue を立てる。

### 実装の指針

1. **#2324 / #2329 をマージ**する。lockfile 競合を避けて 1 件ずつ直列に取り込む。
2. **人手 PR（oxfmt）** — bump + `pnpm exec oxfmt packages/ scripts/` の結果を 1 コミットに。#2326 を close。
3. **人手 PR（oxlint）** — bump + 上記「検証済みの解決策」1〜4 を 1 コミットに。#2325 を close。
4. **#2328 を close** し、`@dependabot ignore this minor version` をコメント。
   `vscode-languageserver` 9 → 10 + protocol 3.18.2 の paired upgrade を **新規 Issue** に起こす。
   Issue には ExTester 3 件の再現ログと、機構未特定であることを明記する。
5. **AT**: 依存更新のみで user-facing な振る舞いの変更はないため新規 AT は起こさない。
   oxlint / oxfmt は `pnpm lint` / `pnpm format:check` 自体が回帰検知であり、
   #2328 の退行は既存の ExTester（AT-0037-9 / AT-0038 / AT-0039）が正しく検出できている。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（#2328 を見送るため LSP の挙動は現状維持）
- ドキュメント更新: `.oxlintrc.json` の規則設定変更は本 Doc の ADR 昇格時に根拠を記録する
- テスト・examples への影響: `PreviewPane.test.tsx` が oxfmt で整形される（挙動不変）

## 未解決の問い / 決めないこと

- **#2328 の破壊メカニズムの特定** — identity 不一致説は `protocol.ts` のコメントと症状から
  否定された。position encoding 起因が有力だが未確定。paired upgrade の Issue 側で追う。
- **`no-underscore-dangle` を off にするか allow list にするか** — 本 Doc は off を提案する。
  85 件が `__dirname`・VS Code private field・未使用マーカーと**性質の異なる 4 系統**に
  またがっており、allow list にすると新しい private field を足すたびに設定を触ることになる。
  ただしこれは規約の緩和なので、allow list を選ぶ判断もありうる。ユーザー判断を仰ぐ。
- **LSP 系にも `groups:` を入れるか** — react と同じ「協調して上がるべき依存が別 PR に割れる」
  問題だが、#2328 は grouping では解決しない（`vscode-languageserver@9` が protocol を完全固定
  している以上、major を取るまで protocol は上がらない）。paired upgrade 完了後に
  `vscode-languageserver` / `vscode-languageserver-protocol` / `vscode-languageclient` を
  グループ化する価値はある。Issue 側で扱う。

## 本バッチ外の指摘: open な security alert 6 件

トリアージ中に、本バッチとは独立に **open な Dependabot security alert が 6 件**あることを
確認した（version update バッチではないため本 Doc の対象外だが、優先度が高いので記録する）:

| alert | GHSA | severity | package | patched |
| --- | --- | --- | --- | --- |
| #65 | GHSA-7p8r-x3mc-p8w7 | **high** | `fast-uri` | 3.1.5 |
| #64 | GHSA-fxqj-rqcc-2cmp | medium | `postcss` | 8.5.23 |
| #62 | GHSA-rgw5-rvv9-x895 | **high** | `brace-expansion` | 2.1.4 |
| #61 | GHSA-rgw5-rvv9-x895 | **high** | `brace-expansion` | 1.1.18 |
| #60 | GHSA-mh99-v99m-4gvg | **high** | `brace-expansion` | 1.1.17 |
| #59 | GHSA-mh99-v99m-4gvg | **high** | `brace-expansion` | 2.1.3 |

6 件とも root `pnpm.overrides` で floor を管理している package であり、現在の floor
（`fast-uri: ^3.1.4` / `postcss: ^8.5.18` / `brace-expansion@1: ^1.1.16` / `@2: ^2.1.2`）を
patched version まで引き上げれば解消する見込み。**`/hane:security-alert` の対象**として
別途処理することを推奨する。

なお過去に「`brace-expansion` は修正版がないため意図的に open のままにする」と判断した
経緯があるが、**上表のとおり現在は patched version が存在する**ため、その判断は既に
失効している。
