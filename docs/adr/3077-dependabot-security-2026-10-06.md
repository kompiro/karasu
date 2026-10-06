---
id: ADR-3077
title: Dependabot security alert 2026-10-06（transitive 5 件を override で解消し、修正版の無い v6 系 postcss-selector-parser は postcss-nested を 7 に上げて逃がす）
status: accepted
date: 2026-10-06
topic: build
scope:
  packages: [core, docs-site]
  concerns: [security, dependencies]
related_to: [ADR-1038, ADR-2341, ADR-2401, ADR-2115, ADR-2628, ADR-2985, ADR-3069]
assumptions:
  # 決定は patched な系列へ floor を置くことであって、そのときの patch 番号ではない（ADR-2628）。
  # tinypool だけは oxfmt の exact pin に対する patch 内の移動に留めると決めたので `~2.1.` まで書く。
  - "grep: pnpm-workspace.yaml :: tinypool: ~2\\.1\\."
  - "grep: pnpm-workspace.yaml :: source-map-js: \\^1\\."
  - "grep: pnpm-workspace.yaml :: smol-toml: \\^1\\."
  - "grep: pnpm-workspace.yaml :: postcss-nested@6: \\^7\\."
---

# ADR-3077: Dependabot security alert 2026-10-06（transitive 5 件を override で解消し、修正版の無い v6 系 postcss-selector-parser は postcss-nested を 7 に上げて逃がす）

- **日付**: 2026-10-06
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#3077](https://github.com/kompiro/karasu/issues/3077)
  - 修正 PR: [#3078](https://github.com/kompiro/karasu/pull/3078)（本 ADR を同梱）
  - 発見の経緯（前日の Dependabot トリアージ）: [ADR-3069](3069-dependabot-triage-2026-10-05.md)
  - security fix に cooldown を適用しない: [ADR-1038](1038-dependabot-security-2026-04-29.md)、[ADR-2341](2341-dependabot-security-2026-08-04.md)
  - override の置き場: [ADR-2401](2401-pnpm-11-migration.md)、キーのスコープ: [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md)
  - assumptions の書き方: [ADR-2628](2628-adr-assumption-version-policy.md)
  - 運用ルール: `.claude/rules/dependabot.md`「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる」

## 背景

2026-10-06 に `open` と `auto_dismissed` の alert を収集すると、7 件が `open` だった（`auto_dismissed` は 0 件）。
すべて transitive で、Dependabot の security update PR は 1 件も起票されていない。

| alert | package | severity | advisory | scope | 脆弱範囲 | patched | 解決版（main） | 利用元 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #87 | `tinypool` | critical | GHSA-85c8-ppgw-ccpr | development | `< 2.1.2` | 2.1.2 | 2.1.0 | `oxfmt@0.63.0`（`"tinypool": "2.1.0"` の exact pin） |
| #88 | `tinypool` | critical | GHSA-5gmw-xhrv-c9v3 | development | `<= 2.1.0` | 2.1.1 | 2.1.0 | 同上 |
| #90 | `source-map-js` | high | GHSA-68fv-2mgg-jv7q | development | `>= 1.0.0, < 1.2.2` | 1.2.2 | 1.2.1 | postcss / `@tailwindcss/node` / css-tree / Vue compiler / magicast |
| #91 | `smol-toml` | medium | GHSA-r4xh-jqrq-34v2 | runtime | `<= 1.8.0` | 1.9.0 | 1.8.0 と 1.9.0 | 1.8.0 は astro / `@astrojs/internal-helpers`（`^1.6.0`）。`packages/core` が `^1.8.0` で直接宣言 |
| #89 | `postcss-selector-parser` | medium | GHSA-rj75-hqrm-r3gf | runtime | `< 7.1.6` | 7.1.6 | 6.1.4 | `postcss-nested@6.2.0` ← `@expressive-code/core@0.44.2`（docs-site のビルド） |
| #85 | `braces` | high | GHSA-vfj7-8cjw-p6xm | runtime | `<= 3.0.3` | なし | 3.0.3 | micromatch ← fast-glob |
| #86 | `http-cache-semantics` | high | GHSA-ch52-4w7c-c8xp | runtime | `<= 4.2.0` | なし | 4.2.0 | astro、cacheable-request ← got |

advisory の内容:

- `tinypool`（#87 / #88）: `Object.prototype` が汚染されていると、`filename` や `execArgv` / `env` を経由して worker が攻撃者のコードを実行する。前提として別の prototype pollution が必要で、当方では formatter（oxfmt）の内部だけで使われる
- `source-map-js`（#90）: indexed source map の `offset.line` を検証しないため、巨大な値でイベントループを長時間止められる（DoS）
- `smol-toml`（#91）: `parseKey` が文書全体に `indexOf('.')` を掛けるため、ドットの無いキーが並ぶ普通の TOML で O(n²) になる（DoS）
- `postcss-selector-parser`（#89）: `.a.a.a…` のような平坦なセレクタで O(n²) になる（DoS）

`pnpm-workspace.yaml` の `overrides:` には、どのパッケージも載っていなかった。既存の floor が脆弱範囲の内側に残っている形
（ADR-2985 ほか）には当たらない。宣言レンジの突き合わせでは、`packages/core` の `smol-toml: ^1.8.0` が脆弱範囲 `<= 1.8.0` と
交差していた。

## 決定

**修正版のある 5 件は `pnpm-workspace.yaml` の override で解消し、`smol-toml` は `packages/core` の宣言も `^1.9.0` に上げる。
`postcss-selector-parser` は v6 系に修正版が無いので、利用元の `postcss-nested` を v7 に上げて v7 系の修正版に乗せる。
修正版の無い `braces` と `http-cache-semantics` は open のまま残す。**

| alert | 修正 | 結果 |
| --- | --- | --- |
| #87 / #88 | override `tinypool: ~2.1.2` | 2.1.0 → 2.1.2 |
| #90 | override `source-map-js: ^1.2.2` | 1.2.1 → 1.2.2 |
| #91 | override `smol-toml: ^1.9.0` + `packages/core` の宣言 `^1.8.0` → `^1.9.0` + `@karasu-tools/core` の patch changeset | 1.8.0 が lock から消える |
| #89 | override `postcss-nested@6: ^7.0.2` | `postcss-nested` 6.2.0 → 7.0.2、`postcss-selector-parser` 6.1.4 → 7.1.6 |
| #85 / #86 | 修正しない | 修正版の公開を待つ |

## 理由

- **すべて transitive なので override で直す。** bot は宣言行が無いと PR を合成できない。置き場は pnpm 11 が読む
  `pnpm-workspace.yaml`（ADR-2401）。既存の並びに合わせてアルファベット順に挿入した
- **`tinypool` は `~` にして patch 内の移動に留める。** oxfmt は `2.1.0` を exact pin しており、`^2.1.2` だと 2.2.0 に解決されて
  利用元の pin から minor が動く。修正は 2.1.2 で足りるので、上流の意図から最小の距離に置いた
- **`smol-toml` は宣言も上げる。** override だけでも実解決は 1.9.0 になるが、`packages/core` の `^1.8.0` を残すと、override を
  外した瞬間に脆弱版を許す宣言が残る（`.claude/rules/dependabot.md`）。`@karasu-tools/core` は公開パッケージで、利用者の
  依存解決にも効く宣言なので changeset を付けた
- **`postcss-selector-parser` は利用元ごと上げる。** v6 系の最新は 6.1.4（dist-tag `legacy-v6`）で、修正は 7.1.6 にしか無い。
  `postcss-selector-parser@6: ^7.1.6` のように v6 を宣言する `postcss-nested@6` の下へ v7 を押し込む案より、v7 を宣言する
  `postcss-nested@7` に上げるほうが上流の支える組み合わせに留まる。`postcss-nested` 7.0 の breaking change は
  Node 12 / 14 / 16 の非サポート化だけで、7.0.1 / 7.0.2 はコメント処理とセレクタ回帰の修正である。キーは `@6` にスコープし、
  将来 `@expressive-code/core` が v7 以降を宣言したら効かなくなるようにした
- **`source-map-js` 1.2.2 は公開 6 日目だが待たない。** security fix に cooldown は適用しない（ADR-1038 / ADR-2341）。
  `minimumReleaseAge`（1 日）は満たす。publisher は唯一の maintainer `7rulnik` で 1.2.1 と同じ。provenance は前後とも無い。
  upstream の compare（v1.2.1…1.2.2）は CVE の修正と、CSP の `unsafe-eval` 判定（try/catch 内の `new Function('return 0')`）
  の 2 commit だけで、npm の tarball の差分と一致した
- `tinypool` 2.1.2 と `smol-toml` 1.9.0 は GitHub Actions OIDC + SLSA provenance、`postcss-nested` 7.0.2 は唯一の maintainer `ai`
  の publish。いずれも install script は無く、新しいパッケージ名は入らない

### 検証

- lock に `tinypool@2.1.0` / `2.1.1`、`source-map-js@1.2.1`、`smol-toml@1.8.0`、`postcss-selector-parser@6` のエントリが 0 件
- `origin/main` と依存エッジ（peer suffix を落としたもの）で突き合わせ、動いたのは意図したエッジだけだった:
  `source-map-js` / `smol-toml` / `tinypool` の利用元と、`@expressive-code/core → postcss-nested 7.0.2 → postcss-selector-parser 7.1.6`
- `@karasu-tools/core` のテスト 4747 件と typecheck が通る。`oxfmt --check` は tinypool 2.1.2 で通る
- **docs-site は CI でビルドされないので手で確かめた。** ビルドは 71 ページ・リンク検査とも通る。`origin/main` のビルド出力と
  比べると、worktree のパスに依存する Astro のスコープ hash（`astro-xxxxxxxx`）と asset の hash を正規化した後で、CSS と全 HTML が
  一致した。`postcss-nested` 7 は描画結果を変えていない

## 却下した案

### `postcss-selector-parser@6: ^7.1.6` で v6 のキーを v7 に押し上げる

v6 を宣言する `postcss-nested@6.2.0` の下に v7 を入れることになり、上流がテストしていない組み合わせを lock に固定する。
`postcss-nested` 自体を v7 に上げれば同じ結果が上流の支える形で得られる。

### #89 を dismiss する（docs-site のビルド時だけで、入力は repo 内の CSS）

到達性は低いが、修正の手段があり、出力が変わらないことを確かめられた。dismiss は修正手段が無いときの選択肢に残す。

### `tinypool: ^2.1.2`

2.2.0 に解決され、oxfmt の exact pin から minor が動く。修正に必要なのは 2.1.2 までである。

### #85 / #86 を dismiss する

修正版がまだ無いだけで、受け入れると決めたわけではない。open のまま残し、修正版が出たら同じ手順で override を足す。

## 残した観察

- `braces`（#85）は fast-glob → micromatch 経由、`http-cache-semantics`（#86）は astro と got → cacheable-request 経由で入る。
  どちらも修正版の公開待ちで、次のトリアージで再確認する
