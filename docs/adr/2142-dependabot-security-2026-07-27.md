---
id: ADR-2142
title: Dependabot security 第 3 便 — brace-expansion OOM DoS は 5 系のみ floor 引き上げ、修正版の無い 1/2 系は据え置く
status: accepted
date: 2026-07-27
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
  - ADR-2129
  - ADR-2139
---

# ADR-2142: Dependabot security 第 3 便 — brace-expansion OOM DoS は 5 系のみ floor 引き上げ、修正版の無い 1/2 系は据え置く

- **日付**: 2026-07-27
- **ステータス**: 決定済み
- **関連**:
  - Issue #2142 — resolve Dependabot security alert #58 (brace-expansion)
  - PR #2143 — `chore(deps): raise brace-expansion@5 override floor to 5.0.8 (GHSA-mh99-v99m-4gvg)`
  - Dependabot alert #58（`brace-expansion`、high、GHSA-mh99-v99m-4gvg / CVE-2026-14257）
  - ADR-2129 / ADR-2139（同じ再スキャン連鎖の第 1 便・第 2 便 — postcss）
  - ADR-2111（brace-expansion のメジャー別スコープ override を確立した回）
  - ADR-1474（transitive security alert を `pnpm.overrides` で解決する運用ルール）

## 背景

第 2 便 PR #2140 のマージ直後の lockfile 再スキャンで、alert #58 が開いた（2026-07-27T14:40:08Z、fixed_at と同時刻 — ADR-2115 のパターンの 3 連鎖目）。

| Alert | パッケージ | severity | advisory | 脆弱バージョン | 修正版 | 解決前 | 供給元 |
|-------|-----------|----------|----------|----------------|--------|--------|--------|
| #58 | `brace-expansion` | high | GHSA-mh99-v99m-4gvg / CVE-2026-14257 | `<= 5.0.7` | `5.0.8` | 1.1.16 / 2.1.2 / 5.0.7 | minimatch 各メジャー経由（transitive） |

advisory の内容: 展開長が無制限のため、攻撃者制御のパターンで out-of-memory プロセスクラッシュを起こせる DoS。

依存ツリーには ADR-2111 のとおり 3 メジャーが共存し、override はメジャー別スコープ済み（`brace-expansion@1: ^1.1.16` / `@2: ^2.1.2` / `@5: ^5.0.7`）。今回の advisory はレンジが `<= 5.0.7` の単一区間で、**修正版は 5.0.8 のみ**。npm 上の 1 系最新は 1.1.16、2 系最新は 2.1.2 であり、**1/2 系には in-major の修正版が存在しない**。

## 決定

到達可能な修正版を持つ 5 系のみ floor を引き上げた（Issue #2142 / PR #2143）。

```jsonc
"pnpm": {
  "overrides": {
    "brace-expansion@1": "^1.1.16",  // 据え置き（in-major 修正版なし）
    "brace-expansion@2": "^2.1.2",   // 据え置き（in-major 修正版なし）
    "brace-expansion@5": "^5.0.8"    // ^5.0.7 から引き上げ
  }
}
```

1.1.16 / 2.1.2 は advisory レンジ内に残る。この残余リスクの扱い（upstream の 1/2 系 patch リリース待ち・根拠付き dismiss・旧 minimatch を pin する consumer の bump）は Issue #2142 に記録し、alert #58 が 5 系修正で close するかの観察を先行させる。

## 理由

- **スコープ規定の本旨どおりの判断**: ADR-1474 のスコープ規定は「無関係なメジャーを breaking 境界をまたいで巻き上げない」ためにある。1/2 系を 5 系へ強制昇格させる無印 override は、まさにこの規定が禁じる操作（minimatch@3/5/9 系 consumer は各メジャーの API を前提とする）。
- **DoS の実露出は限定的**: brace-expansion は minimatch の glob パターン展開でのみ使われ、karasu が攻撃者制御のパターンを展開する経路は無い（CLI / dev ツールがユーザー自身のファイルパターンを扱うのみ）。残余リスクを許容して観察に回す判断と整合する。
- **検証**:
  - lockfile で 5 系のみ 5.0.8 へ移動し、1.1.16 / 2.1.2 が据え置かれていることを確認した（巻き込みゼロ）。
  - その他の差分は brace-expansion 5.0.8 自身の `engines` メタデータ（node 18 のドロップ）のみ。リポジトリの要求は node 20+ のため影響なし。
  - `pnpm build` と `pnpm test`（全パッケージ + scripts）が通過。
  - 公開バンドルへの影響・`THIRD_PARTY_NOTICES.md` の変化なし。changeset 不要。

## 却下した案

### 無印キー `"brace-expansion": "^5.0.8"` で全メジャーを 5 系へ巻き上げる

alert は即 close できるが、minimatch@3/5/9 系の consumer に breaking 境界越えの強制昇格がかかる。ADR-1474 スコープ規定の禁じる操作そのものであり、DoS の実露出の低さに対してリスクが釣り合わない。

### 旧 minimatch を pin する consumer を一斉 bump して 1/2 系を排除する

依存ツリーの広範な組み替えになり、security fix の 1 コミットに収まらない。alert #58 が 5 系修正で close しなかった場合の選択肢として Issue #2142 に残す。

### alert を `dismiss` して対応を見送る

5 系には到達可能な修正版があり、override 1 行で適用できる。少なくとも到達可能な部分は修正すべきで、全面 dismiss は ADR-128 の前提に反する。

### 1/2 系も含めて対応完了まで PR を保留する

1/2 系の修正版は upstream に存在せず、待つ間 5 系の修正まで止まる。到達可能な修正を先に入れ、残余は観察・追跡に回すほうがよい。
