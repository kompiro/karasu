---
id: ADR-2115
title: Dependabot security update 第 2 便 — fast-uri / sharp / svgo / linkify-it / dompurify と、override 付き直接依存の bot PR が構造的にマージ不能である件
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
  - ADR-1338
  - ADR-1474
  - ADR-1652
  - ADR-2111
---

# ADR-2115: Dependabot security update 第 2 便 — fast-uri / sharp / svgo / linkify-it / dompurify と、override 付き直接依存の bot PR が構造的にマージ不能である件

- **日付**: 2026-07-22
- **ステータス**: 決定済み
- **関連**:
  - Issue #2115 — resolve Dependabot security alerts (fast-uri, sharp, svgo, linkify-it, dompurify)
  - PR #2116 — `chore(deps): override fast-uri, sharp, svgo, linkify-it and dompurify to patched versions`
  - PR #2114 — Dependabot の `dompurify` security update PR（CI 構造的失敗のため close）
  - Dependabot alert #50 / #55（`fast-uri`、high、GHSA-4c8g-83qw-93j6 / GHSA-v2hh-gcrm-f6hx）
  - Dependabot alert #54（`sharp`、high、GHSA-f88m-g3jw-g9cj）
  - Dependabot alert #53（`svgo`、high、GHSA-2p49-hgcm-8545）
  - Dependabot alert #51（`linkify-it`、high、GHSA-v245-v573-v5vm）
  - Dependabot alert #52（`dompurify`、low、GHSA-c2j3-45gr-mqc4）
  - ADR-2111（同日の第 1 便 — brace-expansion / js-yaml）
  - ADR-1474（transitive security alert を `pnpm.overrides` で解決する運用ルールの確立）
  - ADR-1338（`fast-uri` の override pin。本 ADR で assumptions を緩めた）
  - ADR-1038（security update の bot PR が構造的に CI を通せないケースの前例）

## 背景

ADR-2111 の PR #2112 が main にマージされた直後（2026-07-22 13:13:31Z マージ、13:13:37–38Z alert 生成）、Dependabot が更新後の lockfile を再スキャンし、**6 件の security alert が新たに開いた**。第 1 便（`brace-expansion` / `js-yaml`）とはパッケージが重複せず、#2112 の変更が原因で発生したものではない。lockfile の差分は対象 2 パッケージのバージョン参照のみで、今回の 6 件はいずれも別系統である。

6 件とも **transitive 依存**かつ **runtime スコープ**。

| Alert | パッケージ | severity | advisory | 脆弱バージョン | 修正版 | 解決前 | 供給元 |
|-------|-----------|----------|----------|----------------|--------|--------|--------|
| #55 | `fast-uri` | high | GHSA-v2hh-gcrm-f6hx | `>= 3.0.0, <= 3.1.3` | `3.1.4` | 3.1.2 | `ajv@8.20.0` |
| #50 | `fast-uri` | high | GHSA-4c8g-83qw-93j6 | `>= 3.0.0, < 3.1.3` | `3.1.3` | 3.1.2 | `ajv@8.20.0` |
| #54 | `sharp` | high | GHSA-f88m-g3jw-g9cj | `< 0.35.0` | `0.35.0` | 0.34.5 | `astro@7.1.3`（optional dep） |
| #53 | `svgo` | high | GHSA-2p49-hgcm-8545 | `>= 4.0.0, < 4.0.2` | `4.0.2` | 4.0.1 | `astro@7.1.3` |
| #51 | `linkify-it` | high | GHSA-v245-v573-v5vm | `<= 5.0.1` | `5.0.2` | 5.0.1 | `markdown-it@14.2.0` |
| #52 | `dompurify` | low | GHSA-c2j3-45gr-mqc4 | `<= 3.4.11` | `3.4.12` | 3.4.11 | `packages/app`（直接）+ override |

advisory の内容:

- **fast-uri GHSA-4c8g-83qw-93j6 / GHSA-v2hh-gcrm-f6hx**（high×2）: IDN 正規化の失敗、およびリテラルのバックスラッシュを authority 区切りとして解釈することによる host confusion。ADR-1338 で対応した #15 / #16 と同系統の続報。
- **sharp GHSA-f88m-g3jw-g9cj**（high）: 同梱 libvips 由来の CVE-2026-33327 / 33328 / 35590 / 35591。
- **svgo GHSA-2p49-hgcm-8545**（high）: `removeScripts` プラグインが一部の実行可能スクリプトを除去し損ねる。
- **linkify-it GHSA-v245-v573-v5vm**（high）: `mailto:` バリデータの走査ループが攻撃者入力に対して二次関数的計算量となる DoS。
- **dompurify GHSA-c2j3-45gr-mqc4**（low）: `CUSTOM_ELEMENT_HANDLING` で許可した custom element が `afterSanitizeElements` フックを迂回する。

## 決定

ADR-1474 の運用ルールに従い、6 件とも root `package.json` の `pnpm.overrides` で解決した（Issue #2115 / PR #2116）。あわせて Dependabot PR #2114 を close し、ADR-1338 の `assumptions` を緩めた。

```jsonc
"pnpm": {
  "overrides": {
    "dompurify": "^3.4.12",  // 既存 ^3.4.11 を更新
    "fast-uri": "^3.1.4",    // 既存 ^3.1.2 を更新（#50 / #55 を 1 回で解消）
    "linkify-it": "^5.0.2",  // 新規
    "sharp": "^0.35.0",      // 新規
    "svgo": "^4.0.2"         // 新規
  }
}
```

## 理由

### なぜ今回は全キーを無印にしたのか

ADR-2111 の `brace-expansion` と異なり、5 パッケージとも**依存ツリーに存在するメジャーが 1 系統のみ**である（`fast-uri` 3.x / `sharp` 0.34.x / `svgo` 4.x / `linkify-it` 5.x / `dompurify` 3.x）。ADR-1474 のスコープ規定が守ろうとしているのは「無関係なメジャーを breaking 境界をまたいで巻き上げないこと」であり、巻き込む相手が存在しない以上、無印キーで足りる。

さらに、上流の要求レンジがいずれも修正版を受け入れるため、宣言範囲の外へ強制的に出るパッケージは無い:

- `ajv@8.20.0` → `fast-uri: ^3.0.1`
- `astro@7.1.3` → `sharp: "^0.34.0 || ^0.35.0"`（optionalDependencies）、`svgo: "^4.0.1"`
- `markdown-it@14.2.0` → `linkify-it: ^5.0.1`

`sharp` は 0.34 → 0.35 とマイナーが上がりネイティブバイナリを伴うため単独で注意したが、astro 7.1.3 が `^0.35.0` を明示的に許容しており、実ビルドでも問題が出なかった（下記「検証」）。

### なぜ Dependabot PR #2114 を close したのか

`dompurify` は `packages/app` の**直接依存**（`^3.4.0`）であると同時に root `pnpm.overrides` にも載っている。この構成では Dependabot の security update PR は**構造的に CI を通せない**:

- Dependabot は `packages/app/package.json` の宣言と `pnpm-lock.yaml` を `^3.4.12` に更新する。
- 一方で **`pnpm.overrides` は書き換えない**（Dependabot は override 機構を認識しない）。
- 結果、root `package.json` の override が `^3.4.11` のまま lockfile の `overrides:` スナップショットだけが `^3.4.12` になり、`pnpm install --frozen-lockfile` が `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` で必ず落ちる。

これは ADR-1038 が扱った「`packages/<name>/package.json` のみ更新する重複 PR が `ERR_PNPM_OUTDATED_LOCKFILE` で落ちる」ケースとは**別の失敗モード**である。ADR-1038 は lockfile が更新されないことが原因だったが、本件は lockfile は更新されるのに manifest 側の override が取り残されることが原因で、**root override を持つパッケージが直接依存でもある場合に限って**発生する。

したがって #2114 は `@dependabot recreate` でも直らない。close して、当該 bump を人手の PR #2116 に畳み込んだ。運用ショートカットは `.claude/rules/dependabot.md` に追記した。

### なぜ ADR-1338 の assumptions を緩めたのか

ADR-1338 は `assumptions` に `"fast-uri":\s*"\^3\.1\.2"` と `fast-uri: 3\.1\.2` というリテラルのパッチ番号を書いていたため、`fast-uri` を 3.1.4 へ上げると `adr-check-assumptions`（pre-push フック）が落ちる。

ADR-1338 の決定そのものは「**patched な 3.x に caret で pin する**」であり、exact pin をあえて避けた（「exact にすると次の advisory のたびに手作業更新が必要になる」と ADR-1338 自身が理由を述べている）。つまり特定のパッチ番号は最初から表明したい内容ではなかった。assumptions を 3.x 系の存在確認に緩めることで、ADR-1338 の主張を保ったまま以後の security bump で壊れないようにした。

```yaml
assumptions:
  - "grep: package.json :: \"fast-uri\":\\s*\"\\^3\\."
  - "grep: pnpm-lock.yaml :: fast-uri: 3\\."
```

ADR 本文の決定は書き換えていないため、ADR-1338 を supersede する必要は無い（`related_to` のみ）。

### 検証

- `pnpm install` 後、`pnpm-lock.yaml` で `fast-uri@3.1.4` / `sharp@0.35.3` / `svgo@4.0.2` / `linkify-it@5.0.2` / `dompurify@3.4.12` に解決されることを確認した。
- lockfile の他の差分は、`sharp` 0.35 系の `@img/sharp-*` プラットフォームバイナリ群（libvips 1.3.2）と、`sharp@0.35.3` が新たに要求する `semver@7.8.5` のみ。`semver` は既存の 7.7.4 / 5.7.2 と併存し、巻き上げは発生していない。
- `pnpm build` と `pnpm test` が通過。
- `pnpm --filter @karasu-tools/docs-site run build` が通過。`sharp` / `svgo` を実際に踏むのはこの経路で、画像最適化ステップ（`generating optimized images`）も 0.35.3 で正常に完了した。root の `build` script は docs-site を含まないため、個別に実行して確認する必要がある。
- `pnpm adr:validate`（271 件）と `pnpm adr:check-assumptions`（500 OK / 0 failing）が通過。
- 公開対象の `THIRD_PARTY_NOTICES.md` は不変（いずれも bundle 対象外）。changeset 不要。

## 却下した案

### `dompurify` だけ Dependabot PR #2114 をマージする

上記のとおり CI を構造的に通せない。root override を人手で合わせるコミットを #2114 に足すことも考えられるが、bot ブランチへの人手コミットは次回の `@dependabot recreate` で失われるため、人手の PR に畳み込むほうが確実。

### `packages/app/package.json` の `dompurify` 宣言も `^3.4.12` へ上げる

override が全解決を強制するため、セキュリティ上の効果は無い。宣言の下限と override の二重管理になり、次回の bump で両方を更新し忘れる余地が増えるだけなので見送った（security floor の正本は `pnpm.overrides` に一本化する）。

### `sharp` を 0.34 系に据え置く

advisory の修正版が 0.35.0 であり、0.34 系に patch リリースは無い。据え置きは alert を解消できない。

### ADR-1338 を supersede して新しい pin ADR を書く

ADR-1338 の決定（caret で patched な 3.x に pin）は今も有効で、覆していない。変えたのは assumption の表明粒度だけなので、supersede は関係を無用に複雑にする。

### alert を `dismiss` して対応を見送る

6 件中 5 件が high。いずれも修正版が存在し、上流の要求レンジとも衝突しないため、放置する理由が無い（ADR-128 の前提に反する）。
