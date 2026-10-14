---
id: ADR-3203
title: Dependabot security alert 2026-10-14（sharp の override floor を修正版へ上げ、shell-quote を override し、修正版が無く upstream が異議を出している http-cache-semantics と braces は dismiss する）
status: accepted
date: 2026-10-14
topic: build
scope:
  packages: [docs-site, vscode, vscode-e2e]
  concerns: [security, dependencies]
related_to: [ADR-1038, ADR-2115, ADR-2401, ADR-2628, ADR-3069, ADR-3077, ADR-3196]
assumptions:
  # 決定は patched な系列へ floor を置くことであって、そのときの patch 番号ではない（ADR-2628）。
  - "grep: pnpm-workspace.yaml :: sharp: \\^0\\.35\\."
  - "grep: pnpm-workspace.yaml :: shell-quote: \\^1\\."
---

# ADR-3203: Dependabot security alert 2026-10-14（sharp の override floor を修正版へ上げ、shell-quote を override し、修正版が無く upstream が異議を出している http-cache-semantics と braces は dismiss する）

- **日付**: 2026-10-14
- **ステータス**: 決定済み
- **関連**:
  - トラッキング Issue: [#3203](https://github.com/kompiro/karasu/issues/3203)
  - 修正 PR: [#3204](https://github.com/kompiro/karasu/pull/3204)（本 ADR を同梱）
  - 発見の経緯（同日の Dependabot トリアージ）: [ADR-3196](3196-dependabot-triage-2026-10-14.md)
  - 前回の security alert 対応: [ADR-3077](3077-dependabot-security-2026-10-06.md)
  - sharp の override を入れた判断: [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md)
  - override の置き場: [ADR-2401](2401-pnpm-11-migration.md)、assumptions の書き方: [ADR-2628](2628-adr-assumption-version-policy.md)
  - 運用ルール: `.claude/rules/dependabot.md`「Security alert 時は advisory の脆弱範囲を override / 宣言レンジと突き合わせる」

## 背景

2026-10-14 に `open` と `auto_dismissed` の alert を収集すると、4 件が `open` だった（`auto_dismissed` は 0 件）。
すべて transitive で、Dependabot の security update PR は 1 件も起票されていない。#92 / #93 は 10-06 に起票され、ADR-3196 の
トリアージ中に見つけた。#85 / #86 は ADR-3069 の時点から修正版待ちだった。

| alert | package | severity | advisory | scope | 脆弱範囲 | patched | 解決版（main） | 利用元 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #93 | `sharp` | high | GHSA-wq5f-xc86-pv6w（同梱 librsvg の CVE-2026-96889） | runtime | `< 0.35.5` | 0.35.5 | 0.35.4 | `astro`（optional dependency、docs site のビルド） |
| #92 | `shell-quote` | critical | GHSA-pqg4-j6r4-53mv / CVE-2026-102422 | development | `>= 1.8.4, < 1.11.0` | 1.11.0 | 1.10.0 | `@changesets/cli` → `launch-editor`（`^1.8.4`） |
| #86 | `http-cache-semantics` | high | GHSA-ch52-4w7c-c8xp / CVE-2026-93748 | runtime | `<= 4.2.0` | なし | 4.2.0 | `astro`、`vscode-extension-tester` → `got` → `cacheable-request` |
| #85 | `braces` | high | GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 | runtime | `<= 3.0.3` | なし | 3.0.3 | `@vscode/vsce` → `secretlint` → `globby` → `fast-glob` → `micromatch` |

宣言レンジとの突き合わせ（`grep -n '<pkg>' pnpm-workspace.yaml; grep -rn '"<pkg>"' packages/*/package.json`）:

- `sharp`: `pnpm-workspace.yaml` の `overrides:` に `sharp: ^0.35.0`（ADR-2115 で入れたもの）。**floor 0.35.0 が脆弱範囲 `< 0.35.5` の内側にある**。
  直接依存の宣言は無い
- `shell-quote` / `http-cache-semantics` / `braces`: override も直接依存の宣言も無い

## 決定

**#93 は既存 override の floor を `^0.35.5` に上げ、#92 は `shell-quote: ^1.11.0` を override に足し、修正版の無い #86 / #85 は理由を
付けて dismiss する。**

| alert | 方法 | 結果 |
| --- | --- | --- |
| #93 `sharp` | 既存 override の floor 引き上げ `^0.35.0` → `^0.35.5` | 0.35.5 に解決（`@img/sharp-libvips-*` 1.3.4） |
| #92 `shell-quote` | 新しい override `shell-quote: ^1.11.0`（無印キー） | 1.12.0 に解決 |
| #86 `http-cache-semantics` | dismiss（`tolerable_risk`） | lock は 4.2.0 のまま |
| #85 `braces` | dismiss（`not_used`） | lock は 3.0.3 のまま |

検証:

- `grep -c 'sharp@0.35.4' pnpm-lock.yaml` と `grep -c 'shell-quote@1.10.0' pnpm-lock.yaml` がどちらも 0
- lock の依存エッジ（peer suffix を落として `origin/main` と比較）で動いたのは、`astro → sharp`、`sharp → @img/*`、
  `launch-editor → shell-quote` と、副次的な `vite@8.3.0 → postcss` 8.5.28 → 8.5.29 だけ
- CI が触らない docs site を `pnpm --filter @karasu-tools/docs-site run build` でビルドし、73 ページ・画像最適化の段・check-links が
  通ること、WARN が main と同じ既存の 2 件だけであることを確認した。app のビルドと `pnpm changeset status` も通る

## 理由

### #93 sharp: floor を上げる

ADR-2115 で入れた floor `^0.35.0` は当時の patched 版で、その後 0.35.5 未満を脆弱とする advisory が出て、override が脆弱版を
許すレンジになっていた（`.claude/rules/dependabot.md` が警告する形と同じで、js-yaml / dompurify / brace-expansion に続く例）。新しいキーを足すのではなく既存キーの floor を上げる。
0.35.5 と `@img/*` の prebuilt binary は 0.35.4 と同じく GitHub Actions から SLSA provenance 付きで publish されており、install script は無い。
sharp は docs site のビルドでしか動かず、advisory の RCE 条件（glibc の Linux、PIE でない node での SVG デコード）に当たるのは
devcontainer と CI のビルド環境である。

### #92 shell-quote: 無印キーで override する

依存ツリーにある shell-quote は 1.x の 1 系統だけで、`launch-editor` の宣言 `^1.8.4` の範囲内に修正版がある。メジャーをまたぐ
巻き込みが起きないので、キーをスコープする必要は無い（ADR-2115 のスコープ規則）。解決は 1.12.0 になった。1.11.0 → 1.12.0 の差分は
`parse()` が認識する shell operator の追加（`&>` / `;;&` / `>(` など）だけで、publisher は 1.10.0 と同じ `ljharb`（前後とも provenance なし）、
install script なし、2026-10-02 公開で cooldown 7 日も満たす。1.11.0 で `quote()` の single quote / `!` の扱いも変わったが、
利用元は changesets が使う `launch-editor` だけで、利用者に届く出力には出ない。

### postcss の副次的な移動を受け入れる

override を変えたことで pnpm が再解決し、`vite@8.3.0` の postcss が、docs site 経由で既に lock にあった 8.5.29 に寄った（vite の宣言は
`^8.5.28`）。8.5.29 は ADR-3196 で確認済みの版（GitHub Actions + provenance、2026-10-05 公開）で、lock から postcss 8.5.28 が消えて
1 版に揃う。app のビルドは通る。

### #86 http-cache-semantics: tolerable_risk で dismiss する

- 修正版が無い。4.3.0（2026-10-04）は脆弱範囲 `<= 4.2.0` の外にあるが、変更は Vary の扱い（`*` と継承プロパティ）と `status()` の追加だけで、
  advisory が指す `max-stale` の処理には触れていない
- upstream の maintainer は報告を「RFC が cookie 付き応答の共有を明示的に許している」として否定し、issue
  [kornelski/http-cache-semantics#56](https://github.com/kornelski/http-cache-semantics/issues/56) を not planned で閉じた。MITRE への
  dispute も出ている
- 当方の利用は docs site のビルド（astro）と ExTester による VS Code のダウンロード（got）で、**複数ユーザーの応答を共有する
  キャッシュを運用していない**。advisory の攻撃（共有キャッシュから他人の Set-Cookie を取り出す）の前提が成り立たない

### #85 braces: not_used で dismiss する

- 修正版が無い。upstream の maintainer は「ネストの深さ 5,000 には 10,001 文字以上が要り、既存の `maxLength` で防げる」として報告を
  否定している（[micromatch/braces#70](https://github.com/micromatch/braces/issues/70) は open のまま）
- 当方で braces に到達するのは、VS Code 拡張を `vsce` で package するときの secretlint の glob 展開だけで、pattern は repo の設定に由来する。
  **信頼できない入力が brace pattern として届く経路が無い**

## 却下した案

### #86 を 4.3.0 に override して alert を消す

4.3.0 は脆弱範囲の外なので alert は閉じるが、`max-stale` の挙動は変わっていない。scanner を黙らせるだけで、脆弱性の主張に対して
何もしていないのに解決済みと記録することになる。dispute の結果 advisory の範囲が 4.3.0 を含むように直されれば、また開く。
dismiss の理由として事実をそのまま残すほうが後から辿れる。

### #85 / #86 を open のまま残す

dispute の決着を待つ案。どちらも当方の利用では前提が成り立たないことを確認しており、open のままだと毎回のトリアージで同じ調査を繰り返す。
advisory が更新されて修正版が出れば、Dependabot が新しい alert として出し直す。

### shell-quote を 1.11.0 に exact で固定する

cooldown を満たす最新の 1.12.0 を避ける理由が無い。floor だけを置き、caret の範囲で解決させる（他の override と同じ形）。
