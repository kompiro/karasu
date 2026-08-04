---
id: ADR-2318
title: Dependabot トリアージ 2026-08-03 — react 分割 PR の相互ブロックと monaco 0.56.0 の exports 破壊
status: accepted
date: 2026-08-04
topic: build
scope:
  packages: [app]
  concerns: [dependencies, security, ci]
related_to: [ADR-2152, ADR-2106, ADR-784, ADR-128, ADR-2115]
---

# ADR-2318: Dependabot トリアージ 2026-08-03 — react 分割 PR の相互ブロックと monaco 0.56.0 の exports 破壊

- **日付**: 2026-08-04
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#2318](https://github.com/kompiro/karasu/pull/2318)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#2311](https://github.com/kompiro/karasu/pull/2311) / [#2312](https://github.com/kompiro/karasu/pull/2312) / [#2313](https://github.com/kompiro/karasu/pull/2313) / [#2314](https://github.com/kompiro/karasu/pull/2314) / [#2315](https://github.com/kompiro/karasu/pull/2315)
  - 反映 PR: [#2320](https://github.com/kompiro/karasu/pull/2320)（react 一括）/ [#2321](https://github.com/kompiro/karasu/pull/2321)（monaco + worker 修正）/ [#2322](https://github.com/kompiro/karasu/pull/2322)（`groups:` 設定、[#2319](https://github.com/kompiro/karasu/issues/2319)）
  - 直近の triage: [ADR-2152](2152-dependabot-triage-2026-07-27.md) / [ADR-2106](2106-dependabot-triage-2026-07-21.md)
  - cooldown 7 日: [ADR-784](784-update-dependencies-20260421.md)
  - override 起因の CI 失敗モード: [ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md)
  - 運用ルール: `.claude/rules/dependabot.md`、`docs/process.md`「Dependabot 運用ルール」
  - コード: `packages/app/src/monaco-setup.ts`, `packages/app/package.json`, `.github/dependabot.yml`, `pnpm-lock.yaml`

## 背景

2026-08-03（月）の weekly version update バッチで 5 件の Dependabot PR が起票された
（起票時刻 21:45〜21:46Z に集中、`security` ラベルなし）。`.claude/rules/dependabot.md`
に従い、bump 種別を問わず全件を upstream まで遡ってサプライチェーン観点で分析した。

| PR | 依存 | from → to | 種別 | CI |
| --- | --- | --- | --- | --- |
| #2311 | `lefthook` | 2.1.6 → 2.1.10 | minor (dev) | ✅ |
| #2312 | `react-dom` | 19.2.5 → 19.2.8 | patch | ❌ |
| #2313 | `@radix-ui/react-dropdown-menu` | 2.1.21 → 2.1.24 | patch ×3 | ✅ |
| #2314 | `react` + `@types/react` | 19.2.5 → 19.2.8 / 19.2.14 → 19.2.17 | patch | ❌ |
| #2315 | `monaco-editor` | 0.55.1 → 0.56.0 | minor (0.x) | ❌ |

**サプライチェーン上の懸念はゼロだった一方、5 件中 3 件が CI red** であり、その原因は
依存側の悪意ではなく 2 つの構造的問題だった。

## 決定

**5 件すべての更新内容を採用した。ただし Dependabot の PR の切り方では CI を通せない
3 件は close し、人手の PR 2 本に畳み込んだ。**

| PR | 判断 | 反映先 |
| --- | --- | --- |
| #2311 `lefthook` | そのままマージ | — |
| #2313 `@radix-ui/react-dropdown-menu` | そのままマージ | — |
| #2312 `react-dom` | close | #2320 |
| #2314 `react` + `@types/react` | close | #2320 |
| #2315 `monaco-editor` | close | #2321 |

**却下（今後オファーさせない）に相当するものは 1 件もない**ため、close した 3 件に
`@dependabot ignore` 系のコメントは付けていない。あわせて再発防止として
`.github/dependabot.yml` に react の `groups:` を追加した（#2322 / Issue #2319）。

## 理由

### サプライチェーン分析 — 全 5 件クリーン

npm registry の `_npmUser` / `dist.attestations` / `dist.signatures` と、tarball 実体の
`scripts` フィールドを全件確認した。**新規に install / postinstall / prepare が追加された
依存はゼロ**。

| 依存 | publisher | provenance |
| --- | --- | --- |
| `lefthook` 2.1.10 | GitHub Actions（OIDC trusted publisher） | attestations あり |
| `react` / `react-dom` 19.2.8 | GitHub Actions（OIDC trusted publisher） | attestations あり |
| `@types/react` 19.2.17 | `types`（DefinitelyTyped 公式 bot） | なし（DT 全体の慣行） |
| `@radix-ui/react-dropdown-menu` 2.1.24 | GitHub Actions（OIDC trusted publisher） | attestations あり・署名 2 本 |
| `monaco-editor` 0.56.0 | `microsoft1es`（Microsoft 1ES、0.55.1 と同一） | なし（0.55.1 も同様） |

**react の "new releaser" 警告は改善であって劣化ではない。** #2312 / #2314 の PR 本文には
「pushed to npm by GitHub Actions, a new releaser for react」と出るが、変化の向きは
**手動 publish から OIDC trusted publisher + provenance attestation への移行**である。
attestation は GitHub の OIDC ワークフローが署名するため npm トークン単体では偽造できず、
乗っ取りであれば付かない。[ADR-2152](2152-dependabot-triage-2026-07-27.md) が radix について
下したのと同じ判断・同じ根拠で処理した。

**`lefthook` は tarball を実際に展開して差分を取った。** `postinstall` を持つため
マルウェア経路になりうるが、`postinstall.js` は 2.1.6 と 2.1.10 で**バイト単位で同一**、
ファイル集合も同一、`optionalDependencies` はプラットフォーム別パッケージの版番号のみが
変わっていた。プラットフォームパッケージ（`lefthook-linux-x64` / `lefthook-darwin-arm64`
を抽出検査）も OIDC + attestations あり、lifecycle script なし。

### 原因1: react / react-dom の分割による相互ブロック

両 PR のエラーは対称だった:

```
# PR #2314（react を上げた側）
Error: Incompatible React versions: ... - react: 19.2.8 / react-dom: 19.2.5
# PR #2312（react-dom を上げた側）
Error: Incompatible React versions: ... - react: 19.2.5 / react-dom: 19.2.8
```

いずれも 67 test file が fail（テスト本体 364 件はすべて pass。失敗は React の版整合
チェックが import 時に throw するため）。原因は `.github/dependabot.yml` に `groups:`
設定がなく、Dependabot が `react` を `@types/react` と同居させ `react-dom` を別 PR に
切り出したこと。

**この 2 本はどちらも単独ではマージできない。** ブランチ保護が green checks を要求する
以上、先にマージする側の CI がそもそも通らないため、マージ順序による解決経路が存在しない。
したがって 1 コミットに畳むほかない。

### 原因2: monaco-editor 0.56.0 の exports マップ破壊

両版の tarball から `exports` を抽出して比較した:

```jsonc
// 0.55.1
{ ".": { ... }, "./*": "./*" }
// 0.56.0
{ ".": { ... }, "./*.js": "./esm/vs/*.js", "./*": "./esm/vs/*.js" }
```

`esm/vs` 接頭辞が暗黙になったため、`packages/app/src/monaco-setup.ts` の
`monaco-editor/esm/vs/editor/editor.worker.js` は
`./esm/vs/esm/vs/editor/editor.worker.js` という二重接頭辞のパスに解決され、
`vite:worker-import-meta-url` が `UNRESOLVED_ENTRY` で fail した。
**worker ファイル自体は 0.56.0 にも存在する**（tarball 内で確認）。壊れたのは
物理配置ではなく exports の写像であり、修正は specifier から接頭辞を落とす 1 行で済む。

`monaco-editor` は 0.x であり semver 上 minor で破壊的変更が許されるが、
リリースノートに exports 変更の記載はない。影響を受けるソース参照は
`monaco-setup.ts` の 1 箇所のみ（`grep -rn "editor.worker\|monaco-editor/esm" packages/`
で確認。他のヒットは `packages/app/dist/` のビルド成果物）。

新旧 specifier は**排他**（新しい綴りは 0.55.1 では存在しないパスに解決される）なので、
bump と 1 行修正は同一コミットに載せる必要がある。bot ブランチに人手でコミットを足しても
`@dependabot recreate` で失われるため、`.claude/rules/dependabot.md`
「bot PR を close → 人手の PR で再提出」の型に載せた。将来の読み手が specifier を
壊れた形に「整理」し直さないよう、版との結合を該当行の上にコメントで明示した。

### 実装中に判明した 2 点（Design Doc からの修正）

**1. `@types/react` は最新版を採らず 19.2.17 に固定した。**
素の `pnpm install` は `@types/react` を **19.2.18** に解決するが、この版は
2026-07-30 公開で当時 5 日しか経っておらず、[ADR-784](784-update-dependencies-20260421.md)
の cooldown 7 日に違反する。Dependabot が 19.2.17 を提案していたのはこのためであり、
人手 PR でも bot と同じポリシーに従って 19.2.17 に固定した。
**人手で bot PR を再提出するときは、素の `pnpm install` が cooldown を迂回しうる**
という一般則がここで得られた。

**2. monaco の transitive `dompurify` に残存 advisory はない。**
Design Doc は「`dompurify` 3.2.7 → 3.4.8 で 3 件（medium 1 / low 2）の advisory が残り、
monaco がピン留めしているため対応できない。monaco の次期リリースを待つ」と結論したが、
**これは誤りだった**。root `pnpm.overrides` に既に `"dompurify": "^3.4.12"` があり
（[ADR-2115](2115-dependabot-security-2026-07-22-second-batch.md) 系の対応で導入済み）、
lockfile 上 monaco の依存は **3.4.12** に解決される:

```
monaco-editor@0.56.0:
  dependencies:
    dompurify: 3.4.12
```

3.4.12 は照合した 5 件の advisory をすべて解消する（最も要求の高い GHSA-c2j3-45gr-mqc4 の
patched version が 3.4.12）。**対応不要・follow-up 不要**。

### cooldown は期待どおり機能した

5 件すべてが cooldown（全 semver レベル 7 日）を充足していた。上記のとおり
`@types/react` 19.2.18 は正しく保留されており、設定は意図どおり働いている。

## 却下した案

### 案: #2312 / #2314 をマージ順序の工夫で通す

**却下** — ブランチ保護が green checks を要求するため、先にマージする側の CI が
必ず落ちる。順序を変えても対称に失敗するだけで、解決経路が存在しない。

### 案: bot ブランチに人手で修正コミットを足す

**却下** — `@dependabot recreate` で失われる。`.claude/rules/dependabot.md` が
override 起因の失敗モードについて同じ結論を既に出している。

### 案: `groups:` を `@radix-ui/*` や `@types/*` まで広げる

**却下（現時点では）** — PR 数は減るが、`.claude/rules/dependabot.md` が要求する
upstream 遡及分析の単位が粗くなり、red PR が出たときにどの依存が原因かの切り分けも
難しくなる。radix は今回も #2313 が単独で問題なくマージできている。
**実際に相互ブロックが観測された react 系だけをグループ化する**のが最小解と判断した。

### 案: `dompurify` の残存 advisory に follow-up を立てる

**却下** — 上記のとおり既存 override で 3.4.12 に解決されており、残存 advisory は
そもそも存在しない。

## 未解決 / 今後

- `groups:` の効果は CI では検証できない。**次回の weekly バッチで React が 1 本の
  grouped PR として起票されるか**を確認する（#2322 に記載）。
- 「依存パッケージ内部のパスを bare specifier で深く指しており、依存側が `exports`
  マップを変えると壊れる」という観点は再発しうるが、`docs/test-perspectives/` の
  `topic: build` 11 件に該当する TPL はない。今回は karasu 側のコード bug ではなく
  依存更新の triage であるため TPL 化は見送り、`monaco-setup.ts` のコメントで
  局所的に手当てした。同種の破壊が別の依存で再発したら TPL を起こす。
