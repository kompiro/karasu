---
id: ADR-2139
title: Dependabot security 第 2 便 — postcss の後続 advisory（.map path traversal）で override floor を 8.5.18 へ引き上げる
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
  - ADR-2115
  - ADR-2129
---

# ADR-2139: Dependabot security 第 2 便 — postcss の後続 advisory（.map path traversal）で override floor を 8.5.18 へ引き上げる

- **日付**: 2026-07-24
- **ステータス**: 決定済み
- **関連**:
  - Issue #2139 — resolve Dependabot security alert #57 (postcss, second 2026-07-24 batch)
  - PR #2140 — `chore(deps): raise postcss override floor to 8.5.18 (GHSA-r28c-9q8g-f849)`
  - Dependabot alert #57（`postcss`、high、GHSA-r28c-9q8g-f849、CVE 未採番）
  - ADR-2129（同日の第 1 便 — alert #56 / GHSA-6g55-p6wh-862q）
  - ADR-2115（マージ直後の lockfile 再スキャンで新 alert が開く前例）
  - ADR-1474（transitive security alert を `pnpm.overrides` で解決する運用ルール）

## 背景

第 1 便 PR #2130（ADR-2129、`postcss` override `^8.5.12` 追加）が main にマージされた直後、Dependabot が更新後の lockfile を再スキャンし、**同じ postcss の後続 advisory で alert #57 が開いた**（fixed_at と created_at が同時刻 2026-07-24T21:33:23Z）。ADR-2115 が記録した「マージ直後の再スキャンで第 2 便が開く」パターンの再現である。

| Alert | パッケージ | severity | advisory | 脆弱バージョン | 修正版 | 解決前 | 供給元 |
|-------|-----------|----------|----------|----------------|--------|--------|--------|
| #57 | `postcss` | high | GHSA-r28c-9q8g-f849 | `<= 8.5.17` | `8.5.18` | 8.5.15 | ADR-2129 と同じ（`madge` 系 + `vite` / `vitest`、いずれも devDependencies） |

advisory の内容: 第 1 便の GHSA-6g55-p6wh-862q（任意ファイル読み取り）の後続で、previous source map の自動読み込み（`sourceMappingURL`）における path traversal により任意の `.map` ファイルが開示される。露出評価は ADR-2129 から変わらない（dev ツールチェーン限定、runtime で untrusted CSS を処理しない）。

第 1 便の override `"postcss": "^8.5.12"` は caret の **floor** であり、lockfile に既存の 8.5.15 が範囲内に収まるため再解決を強制しない。8.5.15 は新 advisory の脆弱範囲（`<= 8.5.17`）に含まれるため、floor の引き上げが必要だった。

## 決定

既存 override の floor を修正版まで引き上げた（Issue #2139 / PR #2140）。

```jsonc
"pnpm": {
  "overrides": {
    "postcss": "^8.5.18"  // ^8.5.12 から引き上げ
  }
}
```

`pnpm install` の結果、ツリーは `postcss@8.5.22` の 1 本に解決された。

## 理由

- **無印キーの根拠は ADR-2129 のまま**: ツリーに存在する postcss は major 8 の 1 系統のみで、巻き込む相手が存在しない。
- **caret floor を維持**: exact pin にすると次の advisory のたびに手作業更新が必要になる（ADR-1338 が fast-uri で述べた理由と同じ）。floor を patched 版に置き、以後のパッチは自然に取り込む。
- **検証**:
  - `pnpm why postcss` が `8.5.22` のみに解決されることを確認した。
  - lockfile の他の差分は `nanoid` 3.3.12 → 3.3.16（postcss 自身の依存の patch 更新）のみ。
  - `pnpm build` と `pnpm test`（全パッケージ + scripts）が通過。
  - 公開バンドルに postcss は含まれず、`THIRD_PARTY_NOTICES.md` 不変。changeset 不要。

## 却下した案

### 第 1 便の caret override に任せて対応を見送る

caret は floor であって再解決の強制ではない。lockfile が 8.5.15 を保持する限り alert は解消しない。`pnpm update postcss` 単発でも解決はできるが、override の floor が `^8.5.12` のままだと lockfile 再生成時に脆弱版へ戻る余地を残すため、security floor の正本（`pnpm.overrides`）自体を引き上げた。

### alert を `dismiss` して対応を見送る

severity high で修正版が存在し、override の 1 行変更で解消できる。放置する理由が無い（ADR-128 の前提に反する）。
