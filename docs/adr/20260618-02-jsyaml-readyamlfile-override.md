---
id: ADR-20260618-02
title: "js-yaml transitive 脆弱性（alert #24）を read-yaml-file の override で完全解決"
status: accepted
date: 2026-06-18
topic: build
scope:
  concerns:
    - ci
    - dependencies
    - security
related_to:
  - ADR-20260616-07
  - ADR-20260520-05
---

# ADR-20260618-02: js-yaml transitive 脆弱性（alert #24）を read-yaml-file の override で完全解決

- **日付**: 2026-06-18
- **ステータス**: 決定済み
- **関連**:
  - Issue #1675 — fully resolve Dependabot security alert #24 (js-yaml transitive via read-yaml-file)
  - Dependabot alert #24（`js-yaml`、medium、GHSA-h67p-54hq-rp68 / CVE-2026-53550）
  - ADR-20260616-07 — 本 ADR は、その「alert #24 を open のまま残す」サブ決定を**改訂・置き換える**（同 ADR の他 12 件のアラート対応はそのまま有効）
  - ADR-20260520-05 — transitive security alert を `pnpm.overrides` で解決する運用ルール

## 背景

Dependabot security alert **#24**（`js-yaml`、medium、GHSA-h67p-54hq-rp68 / CVE-2026-53550 — merge key の alias 反復処理が二次関数的計算量となる DoS）は、2026-06-16 のトリアージ（ADR-20260616-07）以降も **open のまま**残っていた。

当時、`js-yaml@4` override で 4.x インスタンスは patched な `4.2.0` に解決済みだったが、依存ツリーには脆弱な `js-yaml@3.14.2` が dev-only で残存していた。経路は次の通り:

```
@changesets/cli@2.31.0           (devDependency)
└─ @manypkg/get-packages@1.1.3
   └─ read-yaml-file@1.1.0
      └─ js-yaml@3.14.2
```

ADR-20260616-07 ではこれを**修正不可**と判断していた。`js-yaml` を直接 override で 4 系に巻き上げると、`read-yaml-file@1.1.0` が呼ぶ削除済み API `yaml.safeLoad` が壊れるためである。次回トリアージで `dismiss`（vulnerable code not actually used）を再提示する計画だった。

## 決定

`js-yaml` ではなく **`read-yaml-file` 自体**を override し、脆弱な `js-yaml@3.14.2` を依存ツリーから完全に除去する。

```jsonc
// root package.json の pnpm.overrides
"read-yaml-file@1": "^2.1.0",
```

これにより `read-yaml-file@1.1.0`（js-yaml 3.14.2 を引く）が `read-yaml-file@2.1.0` に置換され、`js-yaml@3.14.2` がツリーから消える。残るのは patched な `js-yaml@4.2.0` のみ。

### なぜ read-yaml-file@2.1.0 が安全に差し替えられるのか

- **CJS 互換**: `2.1.0` は `type` 未指定・`main: index.js` の CommonJS。`module.exports = readYamlFile` / `module.exports.default = readYamlFile` / `module.exports.sync = ...` を公開する。`@manypkg/get-packages@1.1.3` は `readYamlFile__default(...)`（default export）と `readYamlFile.sync(...)` を使うため、この shape と完全に一致する。
- **js-yaml 4 をネイティブ採用**: `2.1.0` は `js-yaml@^4.0.0` に依存し `yaml.load`（`safeLoad` ではない）を呼ぶ。削除済み API 問題は発生しない。
- **ESM 化の回避**: `read-yaml-file@3.0.0` は `type: module` の ESM-only で、`@manypkg@1.1.3` の `require()` を壊す。そのため override キーを `read-yaml-file@1` に**スコープ**し、値を `^2.1.0`（`>=2.1.0 <3.0.0`）として 3.x を絶対に引かないようにした。

### js-yaml@4 override は維持する

`read-yaml-file@2.1.0` は `js-yaml@^4.0.0` を要求する。advisory の脆弱範囲は `<= 4.1.1` を含むため、override が無ければ 4.1.1（脆弱）に解決され得る。既存の `"js-yaml@4": "^4.2.0"` を残し、4.2.0 へ pin する。

## 検証

- `pnpm why js-yaml` → `js-yaml@4.2.0`（`read-yaml-file@2.1.0` 経由）のみ。`3.14.2` は消滅。
- `pnpm changeset status` が正常動作（`@changesets/cli → @manypkg/get-packages → read-yaml-file` が `pnpm-workspace.yaml` を読む経路を実際に行使）。
- `pnpm build` 成功。公開物（THIRD_PARTY_NOTICES 等）に差分なし — 変更は `package.json` と `pnpm-lock.yaml` のみ（read-yaml-file は dev-only のため）。
- 全テストスイート pass。

## 却下した案

### alert を `dismiss` する（ADR-20260616-07 の次善案）

`read-yaml-file` を override すれば脆弱コードをツリーから除去できるため、`dismiss`（vulnerable code not actually used）よりも厳密に優れる。dismiss は監査痕跡に「未解決のまま判断で握りつぶした」記録を残すが、override は実際にコードを除去するため不要になった。

### `js-yaml` を直接 3.x 系も含めて override する

`read-yaml-file@1.1.0` は `yaml.safeLoad` を呼ぶため、js-yaml 4 へ巻き上げると壊れる（ADR-20260616-07 で確認済み）。本 ADR は consumer 側（read-yaml-file）を差し替えることでこの制約を回避した。

### `read-yaml-file` を無印キーで override する

現状ツリーには `read-yaml-file@1.1.0` の 1 系統しか無いため無印キーでも動作するが、将来 ESM-only の 3.x が別経路で入る可能性に備え、`read-yaml-file@1` にスコープして脆弱な consumer のみを対象にした（ADR-20260520-05 のスコープ規定に準拠）。
