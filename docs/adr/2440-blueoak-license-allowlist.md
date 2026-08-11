---
id: ADR-2440
title: production 依存の license allowlist に BlueOak-1.0.0 を加える
status: accepted
date: 2026-08-11
topic: build
scope:
  packages: [cli, vscode]
  concerns: [dependencies, ci]
related_to: [ADR-1320, ADR-2333]
assumptions:
  - "file: scripts/ci/license-allowlist.ts"
  - "grep: scripts/ci/license-allowlist.ts :: \"BlueOak-1.0.0\""
  - "grep: CONTRIBUTING.md :: `BlueOak-1.0.0`"
  - "symbol: scripts/ci/generate-third-party-notices.ts :: LICENSE_FILE_PATTERN"
---

# ADR-2440: production 依存の license allowlist に BlueOak-1.0.0 を加える

- **日付**: 2026-08-11
- **ステータス**: 決定済み
- **関連**:
  - allowlist 機構の正本: [ADR-1320](1320-license-compliance-automation.md)（allowlist 変更に ADR を要求している）
  - 引き金の Dependabot PR: [#2433](https://github.com/kompiro/karasu/pull/2433)（`vscode-languageclient` 9 → 10）
  - triage: [#2437](https://github.com/kompiro/karasu/pull/2437)（2026-08-10 バッチ第 2 弾）
  - unblock 対象: [#2337](https://github.com/kompiro/karasu/issues/2337)（LSP 9 → 10 のペア upgrade）
  - コード: `scripts/ci/license-allowlist.ts`, `scripts/ci/generate-third-party-notices.ts`, `CONTRIBUTING.md`

## 背景

[ADR-1320](1320-license-compliance-automation.md) で production 依存の SPDX を
allowlist で機械チェックする仕組みを入れ、未知のライセンスは fail-closed で
CI を止めるようにした。allowlist の追加/削除には ADR を必須としている（決定 3）。

その最初の発火が [#2433](https://github.com/kompiro/karasu/pull/2433) だった。

```
✗ Production dependencies with a license outside the allowlist:
  - minimatch@10.2.6 — BlueOak-1.0.0
```

`vscode-languageclient@10.1.0` は `minimatch: ^10.2.5` を **production 依存**として
持ち込む。`minimatch` は **10.2.5 でライセンスを ISC から BlueOak-1.0.0 に変更**した
（10.0.1 までは ISC）。`^10.2.5` を満たす 10.x はすべて BlueOak なので、
レンジ内に ISC 版へ逃げる余地はない。

これは単発ではない。**npm の足回りを支える isaacs 系パッケージ群がまとめて移行**して
おり、karasu の依存ツリーには既に 9 個の BlueOak パッケージがいる（すべて dev 側
なので allowlist チェックに掛かっていなかっただけ）:

```
common-ancestor-path, glob@13, jackspeak, lru-cache@11,
minimatch@10, minipass, package-json-from-dist, path-scurry, sax
```

したがって判断すべきは「`minimatch` を入れるか」ではなく、**BlueOak-1.0.0 という
ライセンス系統を production 表面で許容するか**である。今回見送っても、
`glob` / `lru-cache` を引く別の依存で同じ壁に必ず当たる。

## 決定

**`LICENSE_ALLOWLIST` に `BlueOak-1.0.0` を追加する。**

`scripts/ci/license-allowlist.ts` の定数が正本で、`CONTRIBUTING.md` の
「License compliance」節のミラーも同じ PR で更新する。

## 理由

### 許諾的で copyleft の要素がない

BlueOak-1.0.0 は Blue Oak Council（デラウェア州の非営利法人、501(c)(3)）が発行する
許諾的ライセンスで、[OSI 承認済み（2024-01-19）](https://opensource.org/license/blue-oak-model-license)。
copyleft の要素はなく、karasu 自身の Apache-2.0 での配布と衝突しない。

ADR-1320 が防ごうとしたリスクの 1 つ目（コピーレフトの混入）には該当しない。

### 義務が MIT より軽く、保護はむしろ厚い

| 観点 | MIT | BlueOak-1.0.0 |
| --- | --- | --- |
| 特許の明示的許諾 | なし | **あり** |
| 再配布時の義務 | 著作権表示 + ライセンス全文の同梱 | ライセンス全文 **または URL リンク** |
| 著作権者名の維持 | 必要 | 不要（維持すべき attribution リストがない） |
| 違反時 | 即座に契約違反 | 書面通知から **30 日の是正期間**（Excuse 節） |

MIT / ISC は Blue Oak Council 自身の格付けで Silver に留まる（主因は特許条項の欠如）。
既に allowlist にある MIT / ISC より受け手に厳しくなる要素はない。

### 既存の自動化でそのまま義務を満たせる

BlueOak が課す再配布義務は Notices 節（全文または
`https://blueoakcouncil.org/license/1.0.0` へのリンクを受領者に届ける）だけである。
karasu はこれを満たす仕組みを既に持っている:

- `minimatch@10.2.6` の tarball は `LICENSE.md` を同梱している
- `scripts/ci/generate-third-party-notices.ts` の `LICENSE_FILE_PATTERN`
  （`/^(LICEN[CS]E|COPYING|NOTICE)(\.\w+)?$/i`）が `LICENSE.md` にマッチする

よって `THIRD_PARTY_NOTICES.md` に全文が自動で入り、`packages/vscode` が esbuild で
`vscode-languageclient` を `out/extension.js` にバンドルして `.vsix` に載せる経路でも
Notices は満たされる。**追加の手作業はゼロ。**

Apache-2.0 §4(d) のような `NOTICE` ファイル条項も持たないので、
ADR-1320 が運用に載せた「major bump 時の NOTICE 再監査」の対象面も広がらない。

### fail-closed の設計は維持される

追加するのは 1 つの SPDX 識別子だけで、`isLicenseAllowed` の評価規則
（`OR` / `AND` / `WITH` / 未知の式は fail）は変えない。GPL / LGPL / AGPL や
`Unknown` は従来どおり CI を止める。

## 却下した案

### allowlist を変えず、`minimatch` を ISC 版に override する

`vscode-languageclient@10.1.0` の宣言レンジは `^10.2.5` で、ISC だったのは 10.0.1 まで。
override で 10.0.1 に落とすのは upstream の宣言に反する固定であり、
`.claude/rules/dependabot.md` が別文脈で警告しているのと同じ「override が
古い版への固定装置として働く」状態を自分から作ることになる。
`minimatch` 10.2.1 / 10.2.3 では ReDoS advisory の修正が入っているので、
古い版に留めるのはセキュリティ上も逆行する。

### allowlist を変えず、`vscode-languageclient` 10 系を採らない

client を 9 系に据え置くと、[#2337](https://github.com/kompiro/karasu/issues/2337) の
ペア upgrade が成立しない。#2437 の観測では client と server の protocol が
食い違うと ExTester の 3 件（AT-0037-9 / AT-0038 / AT-0039）が落ちるため、
protocol 3.18.2 に揃えるには client 10 が要る。
ライセンス回避のために LSP を古い版に固定し続けるのは割に合わない。

### `BlueOak-1.0.0` を case-by-case の例外リストで扱う

「この依存だけ許す」形にすると、`glob` / `lru-cache` が production に出るたびに
同じ判断を繰り返すことになる。既に dev 側に 9 パッケージいる以上、
系統として許容するか否かを一度決めるほうが監査証跡としても読みやすい。

## 影響

- 既存ユーザーへの影響: なし。この PR 単体では依存の解決結果は変わらない。
- `.vsix` / npm tarball: #2337 のペア upgrade が入った時点で
  `THIRD_PARTY_NOTICES.md` に `minimatch` の項目が加わる。生成は自動。
- 年次再監査（`CONTRIBUTING.md`）: allowlist が 9 → 10 件になる。
