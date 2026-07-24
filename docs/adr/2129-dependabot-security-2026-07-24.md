---
id: ADR-2129
title: Dependabot security alert #56（postcss 任意ファイル読み取り）を pnpm override で解決する
status: accepted
date: 2026-07-24
topic: build
scope:
  concerns:
    - ci
    - dependencies
    - security
related_to:
  - ADR-128
  - ADR-1474
  - ADR-2111
  - ADR-2115
---

# ADR-2129: Dependabot security alert #56（postcss 任意ファイル読み取り）を pnpm override で解決する

- **日付**: 2026-07-24
- **ステータス**: 決定済み
- **関連**:
  - Issue #2129 — resolve Dependabot security alert #56 (postcss)
  - PR #2130 — `chore(deps): override postcss to patched 8.5.12 (GHSA-6g55-p6wh-862q)`
  - Dependabot alert #56（`postcss`、high、GHSA-6g55-p6wh-862q / CVE-2026-45623）
  - ADR-1474（transitive security alert を `pnpm.overrides` で解決する運用ルールの確立）
  - ADR-2111 / ADR-2115（直近 2026-07-22 の security バッチ）

## 背景

2026-07-24 時点で open な Dependabot security alert は 1 件だった。

| Alert | パッケージ | severity | advisory | 脆弱バージョン | 修正版 | 解決前 | 供給元 |
|-------|-----------|----------|----------|----------------|--------|--------|--------|
| #56 | `postcss` | high | GHSA-6g55-p6wh-862q / CVE-2026-45623 | `<= 8.5.11` | `8.5.12` | 8.5.10 | `madge@8.0.0` → `precinct` → `detective-postcss` / `@vue/compiler-sfc` |

advisory の内容: PostCSS の `PreviousMap` が CSS 中の `/*# sourceMappingURL=PATH */` コメントをデフォルトオプションのまま（`map: false` を指定しない限り）ローカルファイルシステムに対して解決するため、攻撃者が CSS 入力を制御できる場合に任意ファイル読み取り・ファイル存在オラクルになる。

karasu での露出は限定的である:

- 脆弱な `postcss@8.5.10` は **devDependencies の transitive**（`madge` の循環依存チェック `check:cycles` 経路）のみで、runtime には載らない。
- karasu は信頼できない CSS を PostCSS に通さない。
- 依存ツリーにはもう 1 系統 `postcss@8.5.15`（`vite` / `vitest` 経由）が存在し、こちらは既に修正済みだった。

transitive のため Dependabot は security update PR を合成できず、alert だけが open のまま残っていた（本 skill の主対象ケース）。

## 決定

ADR-1474 の運用ルールに従い、root `package.json` の `pnpm.overrides` に無印キーで追加して解決した（Issue #2129 / PR #2130）。

```jsonc
"pnpm": {
  "overrides": {
    "postcss": "^8.5.12"  // 新規
  }
}
```

`pnpm install` の結果、ツリーは修正済みの `postcss@8.5.15` 1 本にデデュープされた。

## 理由

### なぜ無印キーにしたのか

ADR-1474 のスコープ規定が守ろうとしているのは「無関係なメジャーを breaking 境界をまたいで巻き上げないこと」である。今回、依存ツリーに存在する postcss は **major 8 の 1 系統のみ**（8.5.10 と 8.5.15）で、巻き込む相手が存在しない。

なお lockfile の grep で `postcss@7.0.1` に見えるヒットは別パッケージ `detective-postcss@7.0.1` であり、postcss 7.x はツリーに存在しない。パッケージ名が他パッケージ名のサフィックスになっている場合の grep 誤認に注意（`verify_implemented_linkage` と同種の確認を行った）。

上流の要求レンジも修正版を受け入れるため、宣言範囲の外へ強制的に出るパッケージは無い（`@vue/compiler-sfc@3.5.33` → `postcss: ^8.4.14`、`detective-postcss@7.0.1` → `postcss: ^8.4.23`、`postcss-values-parser@6.0.2` → peer `postcss: ^8.2.9`）。

### 検証

- `pnpm why postcss` が `8.5.15` のみに解決されることを確認した。
- lockfile の他の差分は、`postcss@8.5.10` の除去に伴い orphan 化した `nanoid@3.3.11` の除去と、vitest snapshot の peer 解決キー付け替え（`tsx@4.22.4` → `tsx@4.21.0` の参照差し替え。tsx は両バージョンともインストールされたままで、実バージョンの変動は無い）のみ。
- `pnpm build` と `pnpm test`（全パッケージ + scripts）が通過。
- postcss は公開バンドル（cli / vscode）に含まれず、`THIRD_PARTY_NOTICES.md` は不変。changeset 不要。

## 却下した案

### Dependabot PR のマージを待つ

transitive 依存のため Dependabot は PR を構造的に起票できない。待っても解決しない。

### `postcss@8` にスコープしたキーを使う

脆弱メジャーが 1 系統しか無い場合は無印キーでよい（ADR-2115 と同じ判断）。スコープ付きキーは将来 postcss 7 以下が紛れ込んだ場合にしか意味を持たず、現状では冗長。

### alert を `dismiss` して対応を見送る

severity high で修正版が存在し、上流レンジとも衝突しない。dev-only の露出であっても override 1 行で解消できるため、放置する理由が無い（ADR-128 の前提に反する）。
