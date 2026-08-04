---
id: ADR-2333
title: Dependabot トリアージ 2026-08-04 — LSP protocol の単独 bump を却下し、oxlint の新規則を設定で収める
status: accepted
date: 2026-08-04
topic: build
scope:
  packages: [app, lsp, vscode, core, e2e]
  concerns: [dependencies, security, ci]
related_to: [ADR-2318, ADR-784, ADR-128]
---

# ADR-2333: Dependabot トリアージ 2026-08-04 — LSP protocol の単独 bump を却下し、oxlint の新規則を設定で収める

- **日付**: 2026-08-04
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2333](https://github.com/kompiro/karasu/pull/2333)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2324](https://github.com/kompiro/karasu/pull/2324) / [#2325](https://github.com/kompiro/karasu/pull/2325) / [#2326](https://github.com/kompiro/karasu/pull/2326) / [#2328](https://github.com/kompiro/karasu/pull/2328) / [#2329](https://github.com/kompiro/karasu/pull/2329)
  - 反映 PR: [#2334](https://github.com/kompiro/karasu/pull/2334)（oxfmt）/ [#2336](https://github.com/kompiro/karasu/pull/2336)（oxlint）
  - 後続 Issue: [#2337](https://github.com/kompiro/karasu/issues/2337)（`vscode-languageserver` 9 → 10 の paired upgrade）
  - 直前の triage: [ADR-2318](2318-dependabot-triage-2026-08-03.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)
  - 運用ルール: `.claude/rules/dependabot.md`
  - コード: `.oxlintrc.json`, `packages/lsp/src/protocol.ts`, `packages/app/src/components/PreviewPane.tsx`

## 背景

[ADR-2318](2318-dependabot-triage-2026-08-03.md) の反映作業中に、新たに 5 件の Dependabot PR が
起票された。`.claude/rules/dependabot.md` に従い全件を upstream まで遡って分析した。

| PR | 依存 | from → to | 種別 | CI |
| --- | --- | --- | --- | --- |
| #2324 | `vite` | 8.0.16 → 8.1.5 | minor (dev) | ✅ |
| #2325 | `oxlint` | 1.61.0 → 1.76.0 | minor ×15 (dev) | ❌ Lint |
| #2326 | `oxfmt` | 0.46.0 → 0.61.0 | minor ×15 (dev, 0.x) | ❌ Format check |
| #2328 | `vscode-languageserver-protocol` | 3.17.5 → 3.18.2 | minor (runtime) | ❌ ExTester |
| #2329 | `@astrojs/starlight` | 0.41.3 → 0.41.5 | patch (dev) | ✅ |

サプライチェーン上の懸念はゼロだったが、3 件が CI red で原因は 3 つとも別種だった。

## 決定

**5 件中 4 件を採用し、#2328 のみ却下した。**

| PR | 判断 | 反映先 |
| --- | --- | --- |
| #2324 `vite` | そのままマージ | — |
| #2329 `@astrojs/starlight` | そのままマージ | — |
| #2326 `oxfmt` | close | #2334 |
| #2325 `oxlint` | close | #2336 |
| #2328 `vscode-languageserver-protocol` | **却下** | Issue [#2337](https://github.com/kompiro/karasu/issues/2337) |

**#2328 は一連の triage で初めて「今回は採らない」判断**となった。`@dependabot ignore this minor
version` を設定して再オファーを止め、`vscode-languageserver` の major 更新とセットで扱う
Issue #2337 を起こした。他の 4 件はいずれも却下ではなく採用であり、ignore condition は設定していない。

## 理由

### サプライチェーン分析 — 全 5 件クリーン

registry の `_npmUser` / `dist.attestations` / `dist.signatures` と tarball の `scripts` を確認した。
**新規に install / postinstall / prepare が追加された依存はゼロ**。cooldown（全 semver レベル
7 日）も 5 件すべて充足（最も新しい `@astrojs/starlight` 0.41.5 が 2026-07-28 でちょうど 7 日）。

| 依存 | publisher | provenance |
| --- | --- | --- |
| `vite` 8.1.5 | GitHub Actions（OIDC） | attestations あり |
| `oxlint` 1.76.0 / `oxfmt` 0.61.0 | GitHub Actions（OIDC） | attestations あり・署名 2 本 |
| `vscode-languageserver-protocol` 3.18.2 | `microsoft1es` | なし（3.17.5 も同様） |
| `@astrojs/starlight` 0.41.5 | GitHub Actions（OIDC） | attestations あり・依存差分ゼロ |

`vscode-languageserver-protocol` の publisher が `vscode-bot` → `microsoft1es` に変わっているが、
これは `monaco-editor` を publish しているのと同じ Microsoft 1ES アカウントであり、3.17.5 の公開
（2023-09-26）から 3 年近い間隔があることを踏まえれば社内 publish 基盤の移行と見るのが自然。
`scripts` の変化も開発用スクリプトのみで、consumer の install 時には実行されない
（`prepack` / `prepublishOnly` は publish 側、`prepare` は存在しない）。

### #2328 を却下する理由 — 単独では構造的に成立しない

`vscode-languageserver@9.0.1` は protocol を**範囲ではなく完全固定**で依存している:

```
vscode-languageserver@9.0.1  dependencies = { "vscode-languageserver-protocol": "3.17.5" }
```

そのため `packages/lsp` の直接依存だけを上げてもサーバランタイムが使う版は変わらず、
lockfile に 2 つの copy が残る。結果として ExTester が 3 件 fail する:

```
1) AT-0037-9 — [data-node-id="OrderService"] never picked up class "karasu-highlighted"
2) AT-0038   — editor cursor did not reach line 3 for OrderManagement; last seen line 2
3) AT-0039   — editor cursor did not move to Customer line (expected 17); last seen line 0
```

**既知の WebView flake ではない**と判断した根拠は 3 つ:

1. 再実行しても同じ 3 件が fail する（2 回連続）
2. 同じ main を base にする #2324 / #2329 では ExTester が pass している
3. 症状が「動かない」ではなく**位置がずれる**（3 を期待して 2、17 を期待して 0）

正しい組み合わせは `vscode-languageserver@10.1.0` ↔ `protocol@3.18.2`（10.1.0 が 3.18.2 を
固定依存）であり、major 更新を伴う。依存更新の範囲を超えるため Issue #2337 に切り出した。

#### 破壊メカニズムは未特定（記録として残す）

当初「2 つの `RequestType` の identity 不一致で custom request が dispatch されない」と考えたが
**これは誤り**だった。`packages/lsp/src/protocol.ts` の冒頭コメントが既にこの懸念に触れており、
dispatch は method 名の文字列で行うと明記している。症状も dispatch 断絶ではなく行番号のずれで
あり、identity 説とは整合しない。LSP 3.18 が position encoding（utf-16 / utf-8 のネゴシエーション）
を変更していることから、そちらが有力だが未確認である。**推奨アクションは機構の特定を待たずに
決まる**ため、原因究明は #2337 に委ねた。同じ袋小路を次の人が辿らないよう、Issue 本文にも
identity 説が否定済みであることを明記した。

### #2325 `oxlint` — 新規則 93 件を設定で収める

`pnpm lint` は `oxlint --deny-warnings` なので **warning も全て失敗要因**。1.61 → 1.76 で
6 error + 87 warning が出る。規則別に分類した:

| 規則 | 件数 | 判断 |
| --- | --- | --- |
| `vitest(expect-expect)` | 6 (error) | **false positive** — assertion がヘルパー内 |
| `eslint(no-underscore-dangle)` | 85 (warning) | 既存規約との衝突。バグではない |
| `react(no-object-type-as-default-prop)` | 2 (warning) | 1 件は実質的な指摘 |

`vitest(expect-expect)` の対象は `parser.test.ts`（×4、`expectSingleNestedLegendError`）、
`escape-round-trip.test.ts`（`expectRoundTrip`）、`wrangler.test.ts`（`assertRoundTrips`）。
いずれも assertion はヘルパー関数の中にあり、規則がそれを追えていないだけである。
`assertFunctionNames` で解決した — **この repo には既に同型の前例**があり、
`.oxlintrc.json` の overrides が `packages/vscode-e2e/tests/**` に対し `jest/expect-expect` を
同じ形で設定している。

`no-underscore-dangle` 85 件は `__dirname`（Node builtin）、VS Code 拡張の private field 規約、
意図的な未使用マーカー（`_exhaustive`）、webview の state key（`__themeStamp`）という
**性質の異なる 4 系統**にまたがる。85 箇所の改名に価値はなく、allow list にすると private field を
足すたびに設定を触ることになるため **off にした**。これは規約の緩和であり、判断であることを
明示しておく。

`react(no-object-type-as-default-prop)` は `PreviewPane` の `viewPath = []` が毎 render で新しい
配列を作る点が実質的な指摘なので、モジュールスコープの安定した既定値に直した。もう 1 件は
テストハーネスの使い捨て既定値なのでテストファイルに対して off にした。

**規則を無効化していないことを逆検証した** — 意図的に assertion のないテストを一時的に置き、
`vitest(expect-expect)` が引き続き検出することを確認したうえで削除した。

### #2326 `oxfmt` — 挙動不変の整形差分

0.46 → 0.61 で最終引数のアロー関数を hug する整形に変わり、
`packages/app/src/components/PreviewPane.test.tsx` と `packages/e2e/fixtures/README.md`
の 2 ファイルが差分を持つ。formatter を流して同一コミットに載せた。挙動を変える要素はない。

### #2324 `vite` — green だが monaco 0.56 との組み合わせを実測した

`vite` 8.1.5 は `rolldown` を 1.0.3 → ~1.1.5 に上げる。rolldown は vite 8 のバンドラ本体であり、
[ADR-2318](2318-dependabot-triage-2026-08-03.md) で monaco の worker 解決を壊した
`vite:worker-import-meta-url` プラグインもここに属する。CI green を鵜呑みにせず確認したところ、
Dependabot が #2321 マージ後に rebase しており CI が走った SHA は既に monaco 0.56 を含んでいた。
加えてローカルでも app の build が成功し worker チャンクが出力されることを実測した。

### #2325 / #2326 を人手 PR に畳んだ理由

どちらも修正が bump と同一コミットに載る必要があり、bot ブランチに人手コミットを足しても
`@dependabot recreate` で失われる。[ADR-2318](2318-dependabot-triage-2026-08-03.md) の monaco と
同じ構造であり、`.claude/rules/dependabot.md`「bot PR を close → 人手 PR で再提出」の型に載せた。

## 却下した案

### 案: #2328 の ExTester 失敗を flake として再実行で流す

**却下** — 再実行しても同じ 3 件が fail し、同じ base の他 PR では pass している。
症状も位置ずれであり flake の signature と異なる。

### 案: #2328 を LSP 系の `groups:` 設定で解決する

**却下** — grouping では解決しない。`vscode-languageserver@9.0.1` が protocol を完全固定して
いる以上、major を取るまで protocol は上がらないため、まとめて offer されても状況は変わらない。
paired upgrade 完了後にグループ化する価値はあるので、#2337 の follow-up に記載した。

### 案: `no-underscore-dangle` を allow list で運用する

**却下（現時点では）** — 85 件が 4 系統にまたがっており、新しい private field を足すたびに
設定を触ることになる。off を選んだが、これは規約の緩和なので将来 allow list に戻す判断もありうる。

### 案: `vitest(expect-expect)` の 6 件をテスト側の書き換えで解消する

**却下** — assertion はヘルパー内に存在しており、テストは正しく検証している。規則の側が
ヘルパーを追えていないだけなので、テストを歪めるのではなく設定で解決するのが正しい。

## 未解決 / 今後

- **#2328 の破壊メカニズム** — identity 不一致説は否定済み。position encoding 起因が有力だが
  未確定。#2337 で追う。
- **open な security alert 6 件** — 本バッチとは独立に、`fast-uri`（high）/ `postcss`（medium）/
  `brace-expansion` ×4（high）が open であることを確認した。6 件とも root `pnpm.overrides` で
  floor を管理している package であり、floor を patched version まで引き上げれば解消する見込み。
  `/hane:security-alert` の対象として別途処理する。
  なお過去に「`brace-expansion` は修正版がないため意図的に open」と判断した経緯があるが、
  **現在は 4 件すべてに patched version が存在する**ため、その判断は既に失効している。
