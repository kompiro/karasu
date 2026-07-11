---
id: ADR-20260711-01
title: TypeScript 7.0（native compiler）を採用する
status: accepted
date: 2026-07-11
topic: build
scope:
  packages: [core, app, cli, lsp, vscode]
  concerns: [dependencies, performance]
---

# ADR-20260711-01: TypeScript 7.0（native compiler）を採用する

- **日付**: 2026-07-11
- **ステータス**: 決定済み
- **関連**:
  - Issue #1862
  - PR #1863（`typescript` `^6.0.3` → `^7.0.2` への bump 実装）

## 背景

TypeScript 7.0 が `latest`（`7.0.2`）として公開された。7.0 は従来の JS 実装
（`tsc` / `tsserver`）を Go で書き直した native port であり、型検査・emit の
速度が大きく向上する。karasu の全ワークスペースは `typescript ^6.0.3` に
pin されていた。

karasu は `src` 配下で TypeScript の compiler API を一切使っていない
（プログラム的な型変換・AST 操作なし。grep で確認）。そのため移行の影響面は
`tsc` の build / typecheck 挙動に限定され、programmatic API の破壊的変更に
晒されない。

同一マシン・同一コードでの実測（`tsc --noEmit`）:

| 対象 | TS 6.0.3 | TS 7.0.2 | 高速化 |
| --- | --- | --- | --- |
| `core` typecheck | ~2.20s | ~0.40s | 約 5.5× |
| `app` typecheck（React） | ~4.18s | ~0.64s | 約 6.5× |
| 全パッケージ `pnpm -r typecheck` | ~9.58s | ~2.74s | 約 3.5× |

単体の typecheck では 5〜6.5×、全体では pnpm のプロセス起動オーバーヘッドが
固定費として乗るため 3.5× に収まる。

## 決定

全ワークスペースの `typescript` devDependency を `^6.0.3` から `^7.0.2`
（native compiler）へ引き上げる。

## 理由

- 型検査・emit が大幅に高速化し、ローカルの保存時チェック・`build` emit・
  CI の `Check` ジョブが速くなる。
- karasu は compiler API を使わないため、native port への移行リスクが
  build/typecheck 挙動に限定され小さい。
- ソース・型の変更なしで typecheck / build / test / lint / knip / check:cycles /
  format が全て通過した（native compiler が既存コードをそのまま受理）。
- emit（`@karasu-tools/core` の `.d.ts` + ESM、`@karasu-tools/i18n`）も
  downstream（CLI の esbuild バンドル、`development` 条件の consumer）が
  問題なく typecheck / build できる程度に互換だった。

## 採用時の注意点

将来 7.x 系を更新する / native compiler に依存する作業をするときに踏みうる罠を
記録する。

1. **compiler API を `src` に持ち込まない。** native port の programmatic API は
   従来の `typescript` パッケージと同一ではなく、まだ限定的。今回リスクが
   小さかったのは「API を使っていない」ことに全面的に依存している。型駆動の
   codegen や AST 変換が必要になったら、この ADR の前提が崩れるので別途評価する。

2. **`pnpm-lock.yaml` が OS/arch 別の native binary 最適依存を抱える。** native
   compiler は platform 固有バイナリを optional dependency として引くため、
   lockfile が肥大化し（今回 +267 行）、CI runner / devcontainer / 各コントリ
   ビュータの環境で解決されるバイナリが異なる。lockfile の churn を dependency
   更新のノイズとして扱い、multi-arch 前提で `--frozen-lockfile` が壊れないか
   確認する。

3. **エディタは workspace 版の TypeScript を使わせる。** VS Code / 各エディタが
   bundle する tsserver が古いと、`tsc` は通るのにエディタだけ古い診断を出す
   乖離が起きる。"Use Workspace Version" を前提にする（`.vscode/settings.json`
   の `typescript.tsdk` 明示は今後の検討事項）。

4. **診断・narrowing の微差は 7.x でも起こりうる。** 今回 6.x → 7.0 では新規
   エラーは出なかったが、native port は型検査の細部が JS 実装と完全一致では
   ない。7.x の minor 更新で新しい診断が出たら、それは回帰ではなく仕様の
   精緻化として個別に潰す。

5. **emit の互換は自明ではない。** 今回は core の `.d.ts` + ESM と i18n の emit
   が downstream ビルドを壊さなかったが、これは検証で担保した事実であって
   保証ではない。emit を触る 7.x 更新では `@karasu-tools/core` を実 dependency に
   持つ `karasu-vscode` と、devDependency で内包する CLI の両方でビルドを
   回して確認する（cascade の非対称性は release 運用の項参照）。

## 却下した案

- **7.0 系ではなく 6.x に留まる** — native compiler の速度メリットが大きく、
  karasu は compiler API 非依存で移行コストが実質ゼロだったため、留まる理由が
  ない。
- **`@typescript/native-preview` を使う** — 既に `typescript@7.0.2` が `latest`
  として stable 公開されているため、preview パッケージを別途引く必要はない。
