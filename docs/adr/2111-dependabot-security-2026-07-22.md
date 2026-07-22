---
id: ADR-2111
title: Dependabot security update — brace-expansion / js-yaml をメジャースコープの pnpm.overrides で解決
status: accepted
date: 2026-07-22
topic: build
scope:
  concerns:
    - ci
    - dependencies
    - security
related_to:
  - ADR-128
  - ADR-1038
  - ADR-1474
  - ADR-1593
  - ADR-1652
  - ADR-1675
---

# ADR-2111: Dependabot security update — brace-expansion / js-yaml をメジャースコープの pnpm.overrides で解決

- **日付**: 2026-07-22
- **ステータス**: 決定済み
- **関連**:
  - Issue #2111 — resolve Dependabot security alerts (brace-expansion, js-yaml)
  - PR #2112 — `chore(deps): override brace-expansion and js-yaml to patched versions`
  - Dependabot alert #40 / #41 / #42（`brace-expansion`、high、GHSA-3jxr-9vmj-r5cp / CVE-2026-13149）
  - Dependabot alert #44（`js-yaml`、high、GHSA-52cp-r559-cp3m / CVE-2026-59869）
  - ADR-1474（transitive security alert を `pnpm.overrides` で解決する運用ルールの確立）
  - ADR-1652 / ADR-1593（直近の同型対応）
  - ADR-1675（`js-yaml@3` 系を `read-yaml-file` 差し替えでツリーから除去）
  - ADR-128（Dependabot 採用）

## 背景

2026-07-22 時点で Dependabot security alert が 4 件オープンしていた。**いずれも transitive 依存**であり、どの `package.json` にも宣言が無いため Dependabot は security update PR を起票しなかった（alert だけがオープンのまま残っていた）。ADR-1474 / ADR-1593 / ADR-1652 で扱ったケースと同型である。

| Alert | パッケージ | severity | スコープ | advisory | 脆弱バージョン | 修正版 | 解決前 |
|-------|-----------|----------|----------|----------|----------------|--------|--------|
| #44 | `js-yaml` | high | development | GHSA-52cp-r559-cp3m / CVE-2026-59869 | `>= 4.0.0, < 4.3.0` | `4.3.0` | 4.2.0 |
| #42 | `brace-expansion` | high | runtime | GHSA-3jxr-9vmj-r5cp / CVE-2026-13149 | `>= 2.0.0, < 2.1.2` | `2.1.2` | 2.1.0 |
| #41 | `brace-expansion` | high | runtime | GHSA-3jxr-9vmj-r5cp / CVE-2026-13149 | `< 1.1.16` | `1.1.16` | 1.1.14 |
| #40 | `brace-expansion` | high | development | GHSA-3jxr-9vmj-r5cp / CVE-2026-13149 | `>= 3.0.0, < 5.0.7` | `5.0.7` | 5.0.6 |

advisory の内容:

- **brace-expansion CVE-2026-13149**（high）: 連続する非展開の `{}` グループを含むパターンで展開が指数関数的計算量となる DoS。1.x / 2.x / 3.x–5.x の各系統に別々の alert が立っている（同一 advisory が系統別の修正版を持つ）。
- **js-yaml CVE-2026-59869**（high）: YAML の merge key の連鎖で二次関数的な CPU 消費を強制できる DoS。ADR-1652 で対応した CVE-2026-53550（merge key alias 反復）に続く同系統の指摘で、4.2.0 では未修整だった経路。

`js-yaml` については既に `"js-yaml@4": "^4.2.0"` の override があり、`brace-expansion` についても `"brace-expansion@5": "^5.0.6"` の override があったが、いずれも今回の advisory の修正版に満たなかった。

## 決定

ADR-1474 の運用ルールに従い、4 件とも root `package.json` の `pnpm.overrides` に修正版を pin して解決した（Issue #2111 / PR #2112）。追加・更新したエントリ:

```jsonc
"pnpm": {
  "overrides": {
    "brace-expansion@1": "^1.1.16", // 新規（major 1 にスコープ）
    "brace-expansion@2": "^2.1.2",  // 新規（major 2 にスコープ）
    "brace-expansion@5": "^5.0.7",  // 既存 ^5.0.6 を更新
    "js-yaml@4": "^4.3.0"           // 既存 ^4.2.0 を更新
  }
}
```

## 理由

### なぜ `pnpm.overrides` で解決するのか

- 4 件とも transitive 依存で、書き換えるべき直接依存の宣言が `package.json` に存在しない。Dependabot は更新対象を特定できず PR を起票しなかった。
- `pnpm.overrides` は解決済みバージョンを workspace 横断で強制でき、transitive 依存にも効く。ADR-1474 / ADR-1593 / ADR-1652 で運用が確立している。

### なぜ `brace-expansion` をメジャーごとに 3 キーへ分けたのか

依存ツリーに 1.1.14 / 2.1.0 / 5.0.6 の 3 系統が共存し、**同一 advisory が系統別に別々の修正版を持つ**（1.1.16 / 2.1.2 / 5.0.7）。無印キーで一本化すると、脆弱性と無関係な breaking 境界をまたいで 1.x / 2.x の消費側まで 5.x へ強制昇格させてしまう。ADR-1474 のスコープ規定に従い、各メジャーをその系統の修正版へ in-place で引き上げた。

alert #40 の脆弱範囲は `>= 3.0.0, < 5.0.7` でメジャー 3 / 4 も含むが、依存ツリーに 3.x / 4.x は存在しないためキーは追加していない。

### なぜ `js-yaml` を major 4 スコープのまま更新したのか

`js-yaml` は 5.x が公開されているが、4.x 系統の修正版は 4.3.0 であり、脆弱範囲から抜けるのに major 昇格は不要。ADR-1675 で `js-yaml@3` 系は `read-yaml-file` の差し替えによりツリーから除去済みなので、現在ツリーに残るのは 4.x のみ。既存の `js-yaml@4` キーをそのまま修正版へ引き上げた。

なお lock file には `@types/js-yaml@4.0.9` も現れるが、これは型定義のみのパッケージで脆弱な実装を含まないため対象外。

### 検証

- `pnpm install` 後、`pnpm-lock.yaml` で `brace-expansion@1.1.16` / `@2.1.2` / `@5.0.7` / `js-yaml@4.3.0` に解決されることを確認した。lock の差分は対象 4 パッケージのバージョン参照のみで、無関係なメジャーの巻き込みや付随更新は無い。
- `pnpm build`（全パッケージ + CLI バンドル）と `pnpm test`（全パッケージのテスト）が通過。CI（`Check` / `Playwright` / `VS Code extension host` / `VS Code WebView (ExTester)` 等）も green。
- 公開対象の `THIRD_PARTY_NOTICES.md` は再生成しても不変（脆弱パッケージはいずれも bundle 対象外）。changeset 不要。

## 却下した案

### `brace-expansion` を無印キーで pin する

依存ツリーに 3 メジャーが共存し、系統ごとに修正版が異なる。無印キーは無関係メジャーを breaking 境界をまたいで強制昇格させるため、ADR-1474 のスコープ規定に反する。

### `js-yaml` を 5.x へ上げる

4.3.0 で脆弱範囲から抜けられるため、major 昇格の breaking リスクを負う理由が無い。

### alert を `dismiss` して対応を見送る

4 件とも high で、うち 2 件は runtime スコープ。いずれも修正版が存在するため放置する理由が無く、ADR-128 の前提に反する。

### transitive 依存を直接依存へ昇格させて Dependabot に更新させる

使っていない依存を root に宣言する不自然な構成になり、保守時に意図が読めなくなる。`pnpm.overrides` のほうが意図が明示的。ADR-1474 / ADR-1593 / ADR-1652 と同じ判断。
