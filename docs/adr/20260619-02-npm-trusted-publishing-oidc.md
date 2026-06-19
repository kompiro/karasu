---
id: ADR-20260619-02
title: "npm publish を Trusted Publishing（GitHub OIDC）に移行し `NPM_TOKEN` を廃止する"
status: accepted
date: 2026-06-19
topic: build
related_to:
  - ADR-20260512-05
scope:
  concerns:
    - ci
    - deployment
    - security
assumptions:
  - "file: .github/workflows/release.yml"
  - "grep: .github/workflows/release.yml :: npm install -g npm@latest"
  - "grep: package.json :: \"release\": \"pnpm build && changeset publish\""
---

# ADR-20260619-02: npm publish を Trusted Publishing（GitHub OIDC）に移行し `NPM_TOKEN` を廃止する

- **日付**: 2026-06-19
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue: [#1317](https://github.com/kompiro/karasu/issues/1317)（hard launch — public 化 / 初回公開）
  - [ADR-20260512-05](20260512-05-release-automation-changesets.md) — changesets によるリリース自動化。「初回はトークン publish → その後 OIDC に移行」を follow-up として明記しており、本 ADR はその auth 部分の後続決定（決定 5 の OIDC 移行）を確定する
  - npm Trusted Publishing docs（npm CLI >= 11.5.1 / Node >= 22.14.0）

## 背景

`karasu` / `@karasu-tools/core` の初回 0.1.0 を公開し（repo public 化済み）、npm にパッケージが存在する状態になった。[ADR-20260512-05](20260512-05-release-automation-changesets.md) は当面 `NPM_TOKEN`（repo secret）で publish し、後で OIDC に移すと決めていた。

初回公開を CI のトークンで通そうとした際、npm アカウントの 2FA（Authorization and writes）下で `changeset publish` が **`EOTP`（one-time password 要求）** で失敗した。CI では OTP を入力できない。回避には「2FA を bypass する automation / granular token」を作る必要があるが、npmjs.com はその種別の token に対し **「セキュリティリスクがある。CI/CD には Trusted Publishing を使え」** と明示的に警告する。

長期トークンは漏洩・ローテーションの対象であり、bypass token はさらにリスクが高い。Trusted Publishing なら repo に保持する秘密がゼロになる。初回公開は済んでいて Trusted Publisher 登録の前提（パッケージの存在）も満たしたので、ここで OIDC へ移行する。

## 決定

1. **npm publish を Trusted Publishing（GitHub OIDC）に切り替え、`NPM_TOKEN` を廃止する。** `release.yml` の publish は `id-token: write` を npm（>= 11.5.1）が短命クレデンシャルに交換して行う。token 行（`//registry.npmjs.org/:_authToken=...`）と `NPM_TOKEN` gate を削除する。
2. **npm を OIDC 対応版へ更新する。** Node 22 同梱の npm は 10.x のため、`npm install -g npm@latest` を publish 前に実行する（`changeset publish` はこの `npm` を呼ぶ）。Node は `>= 22.14.0`（setup-node `"22"` は最新 22.x に解決され要件を満たす）。
3. **provenance は trusted publishing が自動付与する。** `--provenance` / `NPM_CONFIG_PROVENANCE` は不要なので削除する。`packages/*/package.json` の `publishConfig.provenance: true` は残す（local の手動 publish ではこれを一時的に無効化する運用 — 下記）。
4. **公開対象パッケージごとに npmjs.com で Trusted Publisher を登録する**（org `kompiro` / repo `karasu` / workflow `release.yml`）。未登録パッケージの OIDC publish は失敗する。
5. **新規パッケージの初回公開はローカルから手動 publish する。** Trusted Publisher は「既存パッケージの settings」でしか登録できず、新規 scoped パッケージは OIDC 初回 publish で `E404` になりやすい（npm/cli #8976）。`pnpm publish`（`workspace:*` を実バージョンに書換）+ provenance off + 対話 OTP で一度公開し、その後 Trusted Publisher を登録して以後は CI に委ねる。`karasu@0.1.0` / `@karasu-tools/core@0.1.0` はこの方法で公開済み。

## 理由

- **secretless が最大の利点**: repo に長期トークンを置かないので漏洩・失効・ローテーションの運用が消える。npmjs.com 自身が CI/CD に対して Trusted Publishing を推奨している。
- **2FA と非衝突**: OIDC アイデンティティが認証主体になるため、token publish で詰まった `EOTP` が構造的に発生しない。2FA は有効のまま維持できる。
- **provenance が自動**: trusted publishing は provenance attestation を既定で付与する。明示フラグを持たなくてよく、設定ミスの余地が減る。
- **`changeset publish` と両立**: changesets は `changeset publish` での OIDC をサポートする。内部で呼ぶ `npm publish` が OIDC を処理するため、npm のバージョンだけ満たせばよい。

## 却下した案

- **2FA bypass 付き automation / granular token を `NPM_TOKEN` に置く**: 初回公開はこれで通るが、長期 bypass token を repo に保持し続けることになり、npmjs.com も明示的に非推奨とする。secretless にできる以上採らない。
- **CI のために npm アカウントの 2FA を無効化する**: アカウント全体のセキュリティを落とす。論外。
- **新規パッケージも CI(OIDC) で初回公開する**: Trusted Publisher を事前登録できず、scoped パッケージで `E404` を踏みやすい（npm/cli #8976）。初回だけローカル手動公開する方が確実。

## 影響

- `NPM_TOKEN` secret は不要になり削除する。初回公開時に作りかけた bypass token も破棄する。
- 既存の release フロー（`changeset version` → `chore: release` PR → merge → `release.yml`）は不変。変わるのは publish の認証経路のみ。
- 次回の版上げ（0.1.x / 0.2.0）publish が OIDC 経路の最初の検証点になる（現時点は 0.1.0 公開済みで `changeset publish` は no-op）。
