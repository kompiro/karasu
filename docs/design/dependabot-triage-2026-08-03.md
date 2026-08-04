# Dependabot トリアージ 2026-08-03 — react 分割 PR の相互ブロックと monaco 0.56.0 の exports 破壊

- **日付**: 2026-08-03
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#2311](https://github.com/kompiro/karasu/pull/2311) / [#2312](https://github.com/kompiro/karasu/pull/2312) / [#2313](https://github.com/kompiro/karasu/pull/2313) / [#2314](https://github.com/kompiro/karasu/pull/2314) / [#2315](https://github.com/kompiro/karasu/pull/2315)
  - 直近の triage: [ADR-2152](../adr/2152-dependabot-triage-2026-07-27.md) / [ADR-2106](../adr/2106-dependabot-triage-2026-07-21.md)
  - 運用ルール: `.claude/rules/dependabot.md`、`docs/process.md`「Dependabot 運用ルール」
  - 設定判断: [ADR-128](../adr/128-dependabot.md)（採用）、[ADR-784](../adr/784-update-dependencies-20260421.md)（cooldown 7 日）
  - コード: `packages/app/src/monaco-setup.ts`, `packages/app/package.json`, `package.json`, `.github/dependabot.yml`, `pnpm-lock.yaml`

## 背景・課題

2026-08-03（月）の weekly version update バッチで 5 件の Dependabot PR が起票された
（起票時刻 21:45〜21:46Z に集中、`security` ラベルなし）。`.claude/rules/dependabot.md`
に従い、bump 種別を問わず全件を upstream まで遡ってサプライチェーン観点で分析した。

結論から言うと **サプライチェーン上の懸念はゼロ**だった。一方で **5 件中 3 件が CI red**
であり、その原因は依存側の悪意ではなく 2 つの構造的な問題だった:

1. `react` と `react-dom` が別々の PR に分割され、**どちらも単独ではマージできない**
   相互ブロック状態になっている（`.github/dependabot.yml` に `groups:` 設定がないため）
2. `monaco-editor` 0.56.0 が `exports` マップの形を変え、**リリースノートに記載のない
   破壊的変更**として `packages/app/src/monaco-setup.ts` の worker 解決を壊している

## 現状（インベントリ）

| PR | 依存 | from → to | 種別 | scope | CI |
| --- | --- | --- | --- | --- | --- |
| [#2311](https://github.com/kompiro/karasu/pull/2311) | `lefthook` | 2.1.6 → 2.1.10 | minor | dev (root) | ✅ 全 pass |
| [#2312](https://github.com/kompiro/karasu/pull/2312) | `react-dom` | 19.2.5 → 19.2.8 | patch | runtime (app) | ❌ Check / Playwright |
| [#2313](https://github.com/kompiro/karasu/pull/2313) | `@radix-ui/react-dropdown-menu` | 2.1.21 → 2.1.24 | patch ×3 | runtime (app) | ✅ 全 pass |
| [#2314](https://github.com/kompiro/karasu/pull/2314) | `react` + `@types/react` | 19.2.5 → 19.2.8 / 19.2.14 → 19.2.17 | patch | runtime + types (app) | ❌ Check / Playwright |
| [#2315](https://github.com/kompiro/karasu/pull/2315) | `monaco-editor` | 0.55.1 → 0.56.0 | minor (0.x) | runtime (app) | ❌ Check / Playwright |

cooldown（全 semver レベル 7 日）は 5 件すべて充足している（最も新しい
`@radix-ui/react-dropdown-menu` 2.1.24 で 2026-07-24 公開、10 日経過）。設定は
期待どおり機能している。

## サプライチェーン分析（全 5 件）

### 共通して確認した事実

npm registry の `_npmUser` / `dist.attestations` / `dist.signatures` と、
tarball 実体の `scripts` フィールドを全件について確認した。

| 依存 | publisher | provenance | lifecycle script |
| --- | --- | --- | --- |
| `lefthook` 2.1.10 | GitHub Actions（OIDC trusted publisher） | attestations あり | `postinstall` あり（後述） |
| `react` 19.2.8 | GitHub Actions（OIDC trusted publisher） | attestations あり | なし |
| `react-dom` 19.2.8 | GitHub Actions（OIDC trusted publisher） | attestations あり | `start` のみ（install 系なし） |
| `@types/react` 19.2.17 | `types`（DefinitelyTyped の公式 bot） | attestations なし（DT 全体の慣行） | なし |
| `@radix-ui/react-dropdown-menu` 2.1.24 | GitHub Actions（OIDC trusted publisher） | attestations あり・署名 2 本 | install 系なし |
| `monaco-editor` 0.56.0 | `microsoft1es`（Microsoft 1ES） | attestations なし | install 系なし |

**新規に install / postinstall / prepare が追加された依存はゼロ**。

### react / react-dom の "new releaser" 警告は改善であって劣化ではない

#2312 / #2314 の PR 本文には Dependabot の警告が出ている:

> This version was pushed to npm by GitHub Actions, a new releaser for react since your current version.

これは publisher が変化したという意味では正しいが、**変化の向きは「人手の手動 publish」
から「GitHub Actions の OIDC trusted publisher + provenance attestation」への移行**である。
registry メタデータで裏を取った:

```
react@19.2.8      _npmUser = GitHub Actions / npm-oidc-no-reply@github.com
                  trustedPublisher = { id: "github", oidcConfigId: "oidc:19f8086e-..." }
                  attestations = true
react-dom@19.2.8  同上（oidcConfigId: "oidc:d9cd0825-..."）
```

乗っ取りであれば provenance attestation は付かない（attestation は GitHub の OIDC
ワークフローが署名するため、npm トークン単体では偽造できない）。**警告は無視してよい**。
これは [ADR-2152](../adr/2152-dependabot-triage-2026-07-27.md) で radix について
下したのと同じ判断であり、同じ根拠（provenance で検証）で処理する。

`@radix-ui/react-dropdown-menu` も同型で、CHANGELOG が 2.1.22 について
「Republish through CI to attach provenance attestations」と明記している。

### lefthook — tarball が実質無変更

`lefthook` は `postinstall` で Go バイナリを解決するため、install スクリプトが
マルウェア経路になりうる。2.1.6 と 2.1.10 の tarball を実際に展開して差分を取った:

- `postinstall.js` — **バイト単位で同一**
- ファイル集合 — **同一**
- `optionalDependencies` — プラットフォーム別パッケージの **版番号のみ** 2.1.6 → 2.1.10

プラットフォームパッケージ（`lefthook-linux-x64` / `lefthook-darwin-arm64` を抽出検査）
も OIDC trusted publisher + attestations あり、lifecycle script なし。

CHANGELOG に「feat: AI coding agents integration」があるが、これは lefthook 側で
AI エージェント用の hook を設定できるようにする opt-in 機能であり、本 repo の
`lefthook.yml` は使っていない。

### monaco-editor — dompurify の transitive bump は純増の改善

`monaco-editor` は `dompurify` を直接依存に持つ。0.55.1 → 0.56.0 で
**3.2.7 → 3.4.8** に上がる。GitHub Advisory で patched version を照合した:

| GHSA | severity | patched | 3.2.7 | 3.4.8 |
| --- | --- | --- | --- | --- |
| GHSA-rp9w-3fw7-7cwq | medium | 3.4.7 | 影響あり | 解消 |
| GHSA-gvmj-g25r-r7wr | low | 3.4.8 | 影響あり | 解消 |
| GHSA-vxr8-fq34-vvx9 | low | 3.4.9 | 影響あり | **残存** |
| GHSA-cmwh-pvxp-8882 | medium | 3.4.11 | 影響あり | **残存** |
| GHSA-c2j3-45gr-mqc4 | low | 3.4.12 | 影響あり | **残存** |

**純増の改善だが完全にクリーンにはならない**。残存分は monaco 側が `dompurify` を
ピン留め（`"dompurify": "3.4.8"`）しているため本 repo からは直接上げられず、
monaco の次期リリース待ちになる。なお karasu は monaco をカスタム言語のエディタ
としてのみ使い、markdown hover の HTML sanitize 経路はほぼ踏まないため、残存分の
実効リスクは低い。**これは #2315 を採る理由にはなるが、急ぐ理由にはならない**。

## CI red の原因分析

### 原因1: react / react-dom の分割による相互ブロック（#2312 / #2314）

両 PR のログはきれいに対称である:

```
# PR #2314（react を上げた側）
Error: Incompatible React versions: ... - react: 19.2.8 / react-dom: 19.2.5

# PR #2312（react-dom を上げた側）
Error: Incompatible React versions: ... - react: 19.2.5 / react-dom: 19.2.8
```

いずれも 67 test file が fail（テスト本体は 364 件すべて pass しており、
失敗は React の版整合チェックが import 時に throw するため）。Playwright の
20m21s タイムアウトも同じ根に由来する。

原因は `.github/dependabot.yml` に **`groups:` 設定がない**こと。現行設定は
`package-ecosystem` / `schedule` / `cooldown` のみで、依存をまとめる指示がない。
そのため Dependabot は `react` を `@types/react` と同居させ（両者が
「needed to be updated together」と判定されたため）、`react-dom` を別 PR に切り出した。

**この 2 本はどちらも単独ではマージできない。** ブランチ保護が green checks を
要求する以上、片方を先にマージする経路も存在しない（先にマージする側の CI が
そもそも通らない）。

### 原因2: monaco-editor 0.56.0 の exports マップ破壊（#2315）

ビルドエラー:

```
[plugin vite:worker-import-meta-url] packages/app/src/monaco-setup.ts
[UNRESOLVED_ENTRY] Cannot resolve entry module src/monaco-editor/esm/vs/editor/editor.worker.js.
```

両版の tarball から `package.json` の `exports` を抽出して比較した:

```jsonc
// 0.55.1
{ ".": { ... }, "./*": "./*" }

// 0.56.0
{ ".": { ... }, "./*.js": "./esm/vs/*.js", "./*": "./esm/vs/*.js" }
```

`packages/app/src/monaco-setup.ts:10` は次の specifier を使っている:

```ts
new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url)
```

- 0.55.1: `"./*": "./*"` → `./esm/vs/editor/editor.worker.js` に解決 ✅
- 0.56.0: `"./*.js": "./esm/vs/*.js"` → `./esm/vs/` + `esm/vs/editor/editor.worker.js`
  = `./esm/vs/esm/vs/editor/editor.worker.js` という **接頭辞が二重になったパス**に
  解決され、存在しないため fail ❌

**ファイル自体は 0.56.0 にも存在する**（`esm/vs/editor/editor.worker.js` を tarball 内で確認）。
壊れたのは物理配置ではなく exports の写像である。したがって修正は specifier の
書き換え 1 行で済む:

```ts
new URL("monaco-editor/editor/editor.worker.js", import.meta.url)
```

`"./*.js": "./esm/vs/*.js"` により `editor/editor.worker.js` → `./esm/vs/editor/editor.worker.js`
に解決される。

**この修正が実際に通ることは検証済み** — #2315 のブランチを worktree に取り、
上記 1 行を適用して `pnpm --filter @karasu-tools/app build` が成功することを確認した
（`✓ built in 3.55s`、`dist/assets/` に worker チャンクが出力される）。

注意すべき点として、**新旧 specifier は排他**である。`monaco-editor/editor/editor.worker.js`
は 0.55.1 では `./editor/editor.worker.js`（存在しない）に解決されるため、
**bump と 1 行修正は同一コミットに載せる必要がある**。Dependabot のブランチに
人手でコミットを足しても `@dependabot recreate` で失われるため、
`.claude/rules/dependabot.md`「bot PR を close → 人手の PR で再提出」の型に載せる。

`monaco-editor` は 0.x であり semver 上 minor で破壊的変更が許されるが、
リリースノート（#5396 "Release Monaco Editor 0.56.0"）に exports 変更の記載はない。
影響を受けるソース参照は `packages/app/src/monaco-setup.ts:10` の **1 箇所のみ**
（`grep -rn "editor.worker\|monaco-editor/esm" packages/` で確認。他のヒットは
`packages/app/dist/` のビルド成果物）。

## 現時点の方針

**5 件中 2 件をそのままマージ、3 件は close して人手の PR 2 本に畳み込む。**

| PR | 依存 | リスク | 推奨アクション |
| --- | --- | --- | --- |
| #2311 | `lefthook` | **low** | **マージ推奨** — CI green、tarball 実質無変更 |
| #2313 | `@radix-ui/react-dropdown-menu` | **low** | **マージ推奨** — CI green、provenance あり |
| #2312 | `react-dom` | **low**（供給側）/ 構造的にマージ不能 | **close** → 人手 PR A に畳み込む |
| #2314 | `react` + `@types/react` | **low**（供給側）/ 構造的にマージ不能 | **close** → 人手 PR A に畳み込む |
| #2315 | `monaco-editor` | **medium**（破壊的変更あり、供給側は low） | **close** → 人手 PR B に畳み込む |

供給側のリスクはいずれも low であり、**却下（今後オファーさせない）に相当するものは
1 件もない**。close する 3 件はあくまで「Dependabot の PR の切り方では CI を通せない」
という構造的理由であって、更新内容そのものは全件採用する。したがって
`@dependabot ignore` 系のコメントは **付けない**。

### 実装の指針

1. **#2311 / #2313 をマージ**する。lockfile 競合を避けるため 1 件ずつ直列に取り込み、
   2 本目は必要に応じて `@dependabot rebase` を挟む。
2. **人手 PR A（react まとめ）** — `react` 19.2.8 / `react-dom` 19.2.8 /
   `@types/react` 19.2.17 を 1 コミットで上げる。`@types/react-dom` も版が
   引きずられる場合は同梱する。#2312 / #2314 を close する。
3. **人手 PR B（monaco）** — `monaco-editor` 0.56.0 への bump と
   `packages/app/src/monaco-setup.ts:10` の specifier 修正を 1 コミットに載せる。
   #2315 を close する。
4. **`.github/dependabot.yml` に `groups:` を追加**して react 系の分割を再発させない。
   PR A に同梱するか、独立した PR にする:

   ```yaml
   groups:
     react:
       patterns:
         - "react"
         - "react-dom"
         - "@types/react"
         - "@types/react-dom"
   ```

   この設定変更は `.claude/rules/dependabot.md`「設定変更は ADR を伴う」に該当するため、
   本 Design Doc の ADR 昇格時に判断根拠として記録する。
5. **AT**: 依存更新のみで user-facing な振る舞いの変更がないため、新規 AT は起こさない。
   monaco の worker 解決は `packages/app` の build と Playwright が実効的な回帰検知に
   なっており、PR B ではこの 2 つが green になることを確認する。
   `monaco-setup.ts` の worker は「エディタが起動して構文ハイライトが出るか」で
   人間が確認できるが、Playwright が同じ経路を踏むため手動確認項目は追加しない。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（すべて依存の版更新。react は patch、
  monaco は 0.x minor だが karasu 側の API 利用面は変わらない）
- ドキュメント更新: `.github/dependabot.yml` の `groups:` 追加に伴い、
  設定判断を ADR に記録する。`docs/process.md`「Dependabot 運用ルール」に
  グルーピング方針を 1 行追記するか検討する
- テスト・examples への影響: なし

## 未解決の問い / 決めないこと

- **`groups:` の粒度をどこまで広げるか** — 本 Doc では react 系のみを対象に提案する。
  `@radix-ui/*` や `@types/*` をまとめると PR 数は減るが、1 本の PR に問題が混在した
  ときの切り分けが難しくなり、upstream 遡及分析の単位も粗くなる。radix は今回も
  単独 PR で問題なくマージできているため、**実際に相互ブロックが起きた react 系だけを
  グループ化する**のが現時点の最小解と考える。ユーザー判断を仰ぐ。
- **deep bare-specifier 依存の proactive TPL を起こすか** — 今回の monaco の失敗は
  「依存パッケージ内部のパスを bare specifier で深く指しており、依存側が `exports`
  マップを変えると壊れる」という再発しうる構造である。`docs/test-perspectives/` の
  `topic: build` 11 件を確認したが、この観点を扱う TPL は存在しない。ただし本件は
  karasu 側のコード bug ではなく依存更新の triage であり、3-Yes ルールの
  「構造的に再発しうる」は満たすが「bug 修正」の文脈ではない。TPL を起こすなら
  PR B に同梱するのが自然だが、**起こすかどうかはユーザー判断とする**。
- **monaco の `dompurify` 残存 advisory** — 3.4.8 でも 3 件（medium 1 / low 2）が
  残る。monaco がピン留めしているため本 repo からは上げられない。`pnpm.overrides`
  で強制的に上げる選択肢はあるが、monaco が想定しない版を差し込むことになり、
  かつ karasu は該当経路をほぼ踏まないため、**現時点では対応しない**方針を提案する。
  monaco の次期リリースで追随されるのを待つ。
