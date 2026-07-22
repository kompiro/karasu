---
id: ADR-2114
title: Dependabot トリアージ 2026-07-22 — dompurify 3.4.12 を採用し、override 同時更新を Dependabot PR に上乗せする
status: accepted
date: 2026-07-22
topic: build
scope:
  packages: [app]
  concerns:
    - ci
    - dependencies
    - security
related_to:
  - ADR-128
  - ADR-1474
  - ADR-1652
  - ADR-1694
  - ADR-1722
  - ADR-2106
  - ADR-2111
---

# ADR-2114: Dependabot トリアージ 2026-07-22 — dompurify 3.4.12 を採用し、override 同時更新を Dependabot PR に上乗せする

- **日付**: 2026-07-22
- **ステータス**: 決定済み
- **関連**:
  - 対象 Dependabot PR: [#2114](https://github.com/kompiro/karasu/pull/2114)（`dompurify` 3.4.11 → 3.4.12）
  - advisory: GHSA-c2j3-45gr-mqc4（LOW, 2026-07-21 公開、`<= 3.4.11` 該当 / `3.4.12` で修正）
  - ADR-1474（transitive security alert を `pnpm.overrides` で解決する運用ルール）
  - ADR-2111（同日の security alert 対応 — brace-expansion / js-yaml）
  - ADR-2106（前回トリアージ 2026-07-21）
  - ADR-128（Dependabot 採用）
  - コード: `package.json`, `packages/app/package.json`, `pnpm-lock.yaml`

## 背景

`hane:dependabot` の方針に従い、open だった Dependabot PR を bump 種別を問わず upstream
まで遡ってサプライチェーン観点で分析した。対象は 1 件のみ。

| PR | 依存 | from → to | 種別 | direct/transitive |
| --- | --- | --- | --- | --- |
| #2114 | `dompurify` | 3.4.11 → 3.4.12 | patch | direct（`packages/app`）+ `monaco-editor` 経由 transitive |

### サプライチェーン分析（リスク: low）

- **配布主体**: publisher は `cure53 <mario@cure53.de>` で従来と同一。maintainer 追加・
  リポジトリ移管・改名なし。npm registry の署名あり。
- **lifecycle スクリプト**: 消費者側で実行されるものは無し（`prepare: husky` は upstream repo
  内でのみ走り、registry tarball の install では起動しない）。
- **依存ツリー**: **新規パッケージの追加ゼロ**。lockfile に現れる `@babel/code-frame` /
  `@babel/helper-validator-identifier` / `@babel/runtime` の 7.29.7 は、`@testing-library/dom`
  が持つ浮動レンジの再解決に伴う付随差分で、いずれも既にツリーにあるパッケージ。
- **実タルボール差分**（`npm diff` で 3.4.11 と 3.4.12 を比較）: 実質の変更は `src/purify.ts`
  と `src/attrs.ts` のみ。内容はリリースノートと一致し、不審なコードは無い。
  - `_handleDisallowedTag` が custom element を残す経路で `afterSanitizeElements` フックを
    呼ばなかった不具合の修正（= GHSA-c2j3-45gr-mqc4 本体）
  - `_neutralizeRoot` で detach より前にサブツリーの属性を剥がすハードニング（既に読み込み中の
    `<img onerror>` の queued な resource event がページスコープで発火するのを防ぐ）
  - `_neutralizePatchLinkage` の新設（declarative partial updates の事前 sweep）
  - SVG 属性 `dominant-baseline` / `text-orientation` の許可追加
- **公開からの経過時間**: 3.4.12 は 2026-07-11 公開で 11 日経過。`.github/dependabot.yml` の
  cooldown 7 日（全 semver レベル、ADR-1722）を満たす。

### 実質的にセキュリティ更新である

PR に `security` ラベルは付いていないが、**GHSA-c2j3-45gr-mqc4**（LOW）が `<= 3.4.11` に該当し
`3.4.12` で修正されている。この advisory は 2026-07-21 に公開され、3.4.12 自体の公開（07-11）
より後である。Dependabot が 07-22 に PR を起票したのはこの advisory 公開が引き金であり、
定期 bump ではない。

### PR 単体では CI が構造的に緑にならない

#2114 は 4 ジョブが `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` で fail していた。原因は
サプライチェーンではなく **Dependabot が pnpm の `pnpm.overrides` を扱えない**ことにある。

`dompurify` は ADR-1474 の運用ルールに従い root `package.json` の `pnpm.overrides` に
`^3.4.11` で pin されている。Dependabot は `packages/app/package.json` と
`pnpm-lock.yaml`（先頭の `overrides:` ミラーを含む）を `^3.4.12` に書き換える一方、
root `package.json` の `pnpm.overrides` は `^3.4.11` のまま残す。pnpm はこの 2 者の不一致を
`--frozen-lockfile` で拒否する。

これは一過性の事故ではなく、**「`pnpm.overrides` に pin されている依存」× 「Dependabot が
その依存の PR を起票する」の組み合わせで必ず起きる**。dompurify で同型の手当てを行うのは
今回で 3 度目である（ADR-1652 の PR #1654、ADR-1694 の PR #1695 はいずれも Dependabot PR に
頼らず手作業で override を bump した）。

## 決定

**#2114 を採用する。ただし PR をそのままマージするのではなく、Dependabot ブランチに
root `package.json` の `pnpm.overrides.dompurify` を `^3.4.12` へ揃えるコミットを上乗せし、
CI 緑を確認してからマージする。**

```jsonc
"pnpm": {
  "overrides": {
    // ...
    "dompurify": "^3.4.12", // ^3.4.11 から
  }
}
```

## 理由

- **更新自体は low リスク**: 配布主体不変・署名あり・新規 lifecycle スクリプト無し・新規
  transitive 依存ゼロで、タルボール差分がリリースノートと GHSA の記述に 1:1 で対応する。
- **急ぐ理由がある**: GHSA-c2j3-45gr-mqc4 の修正版であり、`dompurify` は `packages/app` が
  Markdown 描画で使う sanitizer かつ `monaco-editor` の依存でもある。severity は LOW だが、
  sanitizer のフックライフサイクルの不整合は放置する種類の欠陥ではない。
- **cooldown 済み**: 公開から 11 日経過しており、改ざんが検知されないまま取り込むリスクは
  ADR-1722 が定めた 7 日の閾値を超えて低減している。
- **既存 PR に上乗せする形を選んだ**: 過去 2 回（PR #1654 / #1695）は Dependabot PR を使わず
  別 PR で override を手 bump したが、今回は #2114 が `packages/app/package.json` と
  lockfile の更新を既に正しく行っており、欠けているのは override 1 行だけである。既存 PR を
  close して同じ内容を作り直すより、1 行を上乗せするほうが差分が小さく履歴も追いやすい。
  以後この PR が Dependabot の管理外になる（force-push で上書きされなくなる）のは、
  マージ直前の状態では許容できる副作用である。
- **検証**: worktree で `origin/main` を merge したうえで `pnpm install --frozen-lockfile` が
  通ること、`dompurify` が 3.4.12 単一バージョンに解決されること、`@karasu-tools/app` の
  102 ファイル / 1129 テストが通ることを確認した。

## 却下した案

### #2114 を close して別ブランチで対応する

過去 2 回（ADR-1652 / ADR-1694）の進め方。#2114 の差分自体は正しく、欠けているのは override
1 行だけなので、close して作り直すのは無駄な往復になる。Dependabot PR の履歴（リリースノート・
compatibility score・advisory への導線）を残したまま直せるほうが後から辿りやすい。

### 保留する

GHSA-c2j3-45gr-mqc4 は LOW であり急を要さない、という判断もあり得た。しかし修正版は既に
cooldown を満たしており、上乗せコミットは 1 行で検証も済んでいるため、保留するほうがコストが
高い。

### `pnpm.overrides` から `dompurify` を外して Dependabot に任せる

`dompurify` は `packages/app` の direct dependency なので、override を外せば Dependabot PR が
単体で緑になる。しかし override は `monaco-editor` が抱える transitive な `dompurify` を
同一バージョンへ引き上げるために置かれている（ADR-1474 の運用）。外すと monaco 側が古い
`dompurify` に張り付き、sanitizer が 2 バージョン同居する。今回の advisory がまさに
sanitizer の欠陥である以上、この構成は取れない。

## 申し送り

`pnpm.overrides` に pin された依存について Dependabot が PR を起票すると、その PR は必ず
`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` で fail する。現在 override 配下にあるのは
`brace-expansion` / `diff` / `dompurify` / `esbuild` / `fast-uri` / `form-data` / `js-yaml` /
`markdown-it` / `qs` / `read-yaml-file` / `serialize-javascript` / `tmp` / `undici` / `uuid` /
`vite` / `ws` の 16 パッケージで、いずれも同じ症状を起こしうる。次回以降のトリアージでは
**CI red を見た時点でまず root `package.json` の `pnpm.overrides` との突き合わせを疑う**こと。
将来的には override と lockfile の整合を CI で先に検出する lint、あるいは Dependabot PR に
override を自動追従させる仕組みを検討する余地がある。
