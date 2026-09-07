# Dependabot トリアージ 2026-09-08 — 半移動を機械で捕まえた 2 件

- **日付**: 2026-09-08
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#2763](https://github.com/kompiro/karasu/pull/2763) / [#2764](https://github.com/kompiro/karasu/pull/2764) / [#2765](https://github.com/kompiro/karasu/pull/2765) / [#2766](https://github.com/kompiro/karasu/pull/2766) / [#2767](https://github.com/kompiro/karasu/pull/2767) / [#2768](https://github.com/kompiro/karasu/pull/2768) / [#2769](https://github.com/kompiro/karasu/pull/2769) / [#2770](https://github.com/kompiro/karasu/pull/2770)
  - 直前の triage: [ADR-2753](../adr/2753-dependabot-triage-2026-09-07.md)
  - `@types/vscode` ↔ `engines.vscode` 同値ポリシーと前例の差し替え PR: [ADR-2562](../adr/2562-dependabot-triage-2026-08-17.md)
  - Node baseline: [ADR-2397](../adr/2397-node-24-baseline.md)
  - 判定語彙 / 差し替え PR: [ADR-2474](../adr/2474-dependabot-replacement-pr-vocabulary.md)、`.claude/rules/dependabot.md`
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)
  - コード: `scripts/ci/vscode-version-policy.test.ts`、`scripts/ci/node-version-policy.test.ts`、`.oxlintrc.json`

## 背景・課題

[ADR-2753](../adr/2753-dependabot-triage-2026-09-07.md) のバッチをマージして枠が空いた直後に、
Dependabot が 8 件を起票した（`open-pull-requests-limit: 8` を再び飽和）。すべて npm、
`security` ラベルはゼロ、`dependabot/alerts` の open も 0 件で、純粋な version update バッチ。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず 8 件すべてを upstream まで遡った。
**供給側（配布主体・改ざん）の懸念はゼロだった** — 新規 publisher なし、リポジトリ移管なし、
lifecycle script の新規追加なし、cooldown 7 日は全件充足、既知 advisory の該当なし。
**バッチ全体で lock に新規登場したパッケージ名は 1 件もない**（消えた名前が 1 件あるだけ）。

一方で **2 件が CI 落ちで、どちらも「Dependabot が触れない宣言が同じ repo 内にある」**
という同じ形の失敗である。

1. **[#2768](https://github.com/kompiro/karasu/pull/2768)** — `@types/vscode` は動くが
   `engines.vscode` は動かない。`scripts/ci/vscode-version-policy.test.ts` が落とす。
2. **[#2769](https://github.com/kompiro/karasu/pull/2769)** — oxlint が新しい React 規則を
   correctness に入れたため、既存コードが 16 error + 8 warning で落ちる。

前者は [ADR-2562](../adr/2562-dependabot-triage-2026-08-17.md) が**既に決めた形**で解ける。
後者は repo 側の判断が要る。

## 現状（インベントリ）

### 対象 PR 一覧

| PR | 依存 | from → to | 種別 | 位置 | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#2770](https://github.com/kompiro/karasu/pull/2770) | `@types/node` | 26.3.0 → 26.4.0 | minor | 9 manifest devDep | green | low | 採用 |
| [#2769](https://github.com/kompiro/karasu/pull/2769) | `oxlint` | 1.76.0 → 1.80.0 | minor ×4（exact pin） | root devDep | **fail** | **medium** | **保留** |
| [#2768](https://github.com/kompiro/karasu/pull/2768) | `@types/vscode` | 1.125.0 → 1.134.0 | minor ×9 | `vscode` + `vscode-e2e` devDep | **fail** | low | 採用（差し替え PR） |
| [#2767](https://github.com/kompiro/karasu/pull/2767) | `@radix-ui/react-tabs` | 1.1.13 → 1.1.21 | patch ×8 | `app` runtime dep | green | low | 採用 |
| [#2766](https://github.com/kompiro/karasu/pull/2766) | `jsdom` | 29.0.2 → 30.0.1 | **major** | `app` devDep | green | low | 採用 |
| [#2765](https://github.com/kompiro/karasu/pull/2765) | `astro` | 7.2.9 → 7.2.10 | patch | `docs-site` devDep | green | low | 採用 |
| [#2764](https://github.com/kompiro/karasu/pull/2764) | `@testing-library/react` | 16.3.2 → 16.3.3 | patch | `app` devDep | green | low | 採用 |
| [#2763](https://github.com/kompiro/karasu/pull/2763) | `@vitejs/plugin-react` | 6.1.0 → 6.1.1 | patch | `app` devDep | green | low | 採用 |

### 供給側の確認結果（npm registry）

`published` は 8 件すべて 7 日以上前で、cooldown（[ADR-784](../adr/784-update-dependencies-20260421.md)）は
満たされている。**メンテナ一覧の異常・新規 publisher・所有権移管はいずれにも無い。**

| package@version | published | publisher | provenance | install script |
| --- | --- | --- | --- | --- |
| `@types/node@26.4.0` | 2026-08-27 | `types` | none | なし |
| `oxlint@1.80.0` | 2026-08-24 | GitHub Actions | SLSA v1 | なし |
| `@types/vscode@1.134.0` | 2026-08-19 | `types` | none | なし |
| `@radix-ui/react-tabs@1.1.21` | 2026-07-24 | GitHub Actions | SLSA v1 | なし |
| `jsdom@30.0.1` | 2026-07-29 | GitHub Actions | SLSA v1 | `prepare` のみ（29.0.2 と同一。tarball install では走らない） |
| `astro@7.2.10` | 2026-08-31 | GitHub Actions | SLSA v1 | なし |
| `@testing-library/react@16.3.3` | 2026-08-27 | GitHub Actions | SLSA v1 | なし |
| `@vitejs/plugin-react@6.1.1` | 2026-08-28 | GitHub Actions | SLSA v1 | なし |

`@types/*` の provenance が none なのは DefinitelyTyped の publish 経路が従来どおりだからで、
今回の変化ではない。

### 既知 advisory との突き合わせ

**移行先バージョンを脆弱範囲に含む advisory は 1 件も無い。** 直接依存に加えて、
`jsdom` が連れてくる 2 つの要注意パッケージも解決版で確認した。

| package | 該当 advisory の脆弱範囲（最新） | 解決版 | 判定 |
| --- | --- | --- | --- |
| `jsdom` | `<= 16.4.0`（GHSA-f4c9-cqv8-9v98, low） | 30.0.1 | 範囲外 |
| `tough-cookie`（jsdom 経由） | `< 4.1.3`（GHSA-72xf-g2v4-qvf3, medium） | 6.0.2 | 範囲外 |
| `undici`（jsdom 経由） | `>= 7.0.0, < 7.28.0`（GHSA-vxpw-j846-p89q, high） | 7.29.0（据え置き） | 範囲外 |
| `astro` | `< 6.1.10`（GHSA-xr5h-phrj-8vxv, low） | 7.2.10 | 範囲外 |
| `@types/node` / `oxlint` / `@types/vscode` / `@radix-ui/react-tabs` / `@testing-library/react` / `@vitejs/plugin-react` | advisory 0 件 | — | — |

`pnpm-workspace.yaml` の `overrides:` は空なので、`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` の
失敗モードは起こり得ない。

### 依存エッジの巻き込み

`pnpm-lock.yaml` の**依存エッジ**を base とヘッドで突き合わせた（peer suffix を落として比較）。
**8 件すべてで新規パッケージ名の追加はゼロ。** 名前の増減は 1 件だけで、それも削除方向である。

| PR | 巻き込んだ transitive | 新規名 |
| --- | --- | --- |
| #2770 | `@types/node` を参照する 7 パッケージのエッジが 26.4.0 へ揃う | なし |
| #2769 | プラットフォーム別バイナリ 19 件のみ | なし |
| #2768 | なし（型定義のみ） | なし |
| #2767 | radix の内部パッケージ群が版収束（旧版エッジの削除が主） | なし |
| #2766 | `@asamuzakjp/css-color` 5.1.5 → 6.0.7、`@asamuzakjp/dom-selector` 7.0.6 → 8.3.2、`@csstools/*`、`parse5` 8.0.0 → 8.0.1、`tough-cookie` 6.0.1 → 6.0.2、`whatwg-url` 16 → 17 | なし（**`@asamuzakjp/nwsapi` が消える**） |
| #2765 | `@astrojs/internal-helpers` 0.10.4 → 0.11.0 ほか。`find-proc` は 0.1.0 のまま | なし |
| #2764 / #2763 | なし | なし |

`find-proc` は [ADR-2753](../adr/2753-dependabot-triage-2026-09-07.md) で内容を確認して採用した
0.1.0 のままで、版は動いていない。

### #2768 の失敗は何を意味するか

`packages/vscode/package.json` の `engines.vscode` は `^1.125.0` のまま、
`@types/vscode` だけが `^1.134.0` に上がるため、**2 箇所**で落ちている。

```
scripts/ci/vscode-version-policy.test.ts
  × keeps engines.vscode equal to the @types/vscode range
    AssertionError: expected '^1.125.0' to be '^1.134.0'

VS Code WebView (ExTester)
  Error: @types/vscode ^1.134.0 greater than engines.vscode ^1.125.0.
         Either upgrade engines.vscode or use an older @types/vscode version
```

これは**予見済みの失敗**である。ガード自身のヘッダコメントが以下を書いている。

> Two of the three sites are `devDependencies` entries, which Dependabot rewrites on
> its own; `engines.vscode` it cannot touch. So the natural failure mode is a
> half-move (...) This guard fails first, in the unit run, naming the file.

つまり [ADR-2562](../adr/2562-dependabot-triage-2026-08-17.md) は、この形が来ることを
織り込んだうえで「3 箇所を同時に動かす差し替え PR」を正解と決めている（前例は #2563）。

### #2769 の失敗は何を意味するか

oxlint 1.80.0 をローカルで実行して規則名まで確認した。CI の内訳（16 error + 8 warning）と一致する。

| 規則 | 件数 | 既定カテゴリ | 本 repo での扱い |
| --- | --- | --- | --- |
| `react(refs)` — Cannot access refs during render | 7 | correctness | error |
| `react(set-state-in-effect)` — setState synchronously within an effect | 6 | correctness | error |
| `react(globals)` — This value cannot be modified | 2 | correctness | error |
| `react(immutability)` — Cannot reassign variables declared outside the component/hook | 1 | correctness | error |
| `react(exhaustive-effect-dependencies)` — extra effect dependencies | 6 | suspicious | **`--deny-warnings` で致命的** |
| `react(memo-dependencies)` — missing memoization dependencies | 2 | suspicious | **`--deny-warnings` で致命的** |

`.oxlintrc.json` は `categories.correctness: "error"` / `suspicious: "warn"`、
root の lint script は `oxlint --deny-warnings packages/ scripts/` なので、
**新規規則は設定を一切変えなくても自動的に fatal になる**。指摘は `packages/app` の
12 ファイルに散っている（`ProjectModeApp.tsx` / `AppShell.tsx` / `theme/index.tsx` /
`FileTree.tsx` / `ProjectPicker.tsx` / `DiffModeBanner.tsx` / `useChatSession.ts` /
`useStyleSource.ts` / `useLatestRef.ts` / `use-command.ts` ほか）。

内容は typo 級ではなく、React の実行時挙動に関わる指摘である（render 中の ref 参照、
effect 内の同期 setState）。

### #2766（jsdom major）で確認したこと

jsdom 30.0.0 の **breaking change は 1 つだけ** — Node.js の下限が
`^22.22.2 || ^24.15.0 || >=26.0.0` に上がったこと。他は CSS 周りの機能追加と修正である。

- CI と devcontainer は Node 24（`scripts/ci/node-version-policy.test.ts` が 21 の workflow で
  `node-version: "24"` を検査している。[ADR-2397](../adr/2397-node-24-baseline.md)）。
  `"24"` は最新の 24.x に解決されるので `^24.15.0` を満たす。
- `jsdom` は `packages/app`（`"private": true`）の devDependency だけで、公開パッケージには
  入らない。したがって `packages/core` / `packages/cli` が宣言する `engines.node: ">=22.12"`
  は影響を受けない。
- CI の `Check`（`packages/app` の vitest 一式が jsdom 上で走る）は green。

## 制約・前提

- **判定は 採用 / 保留 / 却下 の 3 値**、反映手段（そのままマージ / 差し替え PR）はそれと別軸
  （`.claude/rules/dependabot.md`）。「rebase が必要なだけ」は差し替えの理由にならない
  （[ADR-2152](../adr/2152-dependabot-triage-2026-07-27.md)）。
- **今回は out of scope**: `.github/dependabot.yml` の変更、`packages/app` の React 実装の是正
  そのもの（#2769 の指摘対応は別 PR に切る前提で選択肢を比較する）。

## 検討した選択肢

### 判断が要る 1 件目: #2769（oxlint の新規 React 規則）

#### 案 A: 保留 — 指摘を別 PR で解消してから bump を入れる

#2769 は open のまま残し、24 件の指摘を是正する Issue を起こす。是正が入ったあと
bump をマージする（またはその PR に bump を同梱する）。

**メリット**

- 新しい規則が拾った信号を消さない。指摘は React の実行時挙動に関わるもので、
  1 件ずつ読む価値がある。
- bump PR と是正 PR のレビュー単位が分かれる。

**デメリット**

- 是正が終わるまで oxlint の bump 全体（4 マイナー分のバグ修正を含む）が入らない。
- 枠 8 のうち 1 つを保留 PR が占め続ける。飽和は 3 週連続で起きている。

#### 案 B: 差し替え PR — bump と 24 件の是正を 1 コミットにする

**メリット**

- CI が緑のまま 1 回で終わる。枠も空く。

**デメリット**

- ツールチェーンの bump と 12 ファイルの React 実装変更が同じ diff に混ざる。
  レビューで「lint を通すための変更」と「挙動を変える変更」を分離できない。

#### 案 C: bump を採用し、新規規則を `.oxlintrc.json` で off にして是正は Issue に送る

**メリット**

- ツールチェーンが最新に保たれ、枠も空く。off エントリが Issue 番号付きの
  TODO として grep できる形で残る。
- `.oxlintrc.json` には既に `"off"` の前例がある（`react/react-in-jsx-scope` など）。

**デメリット**

- 既存の `"off"` は恒久的なポリシー判断であって、期限付きの負債ではない。
  同じ場所に性質の違うものを混ぜると、次の読み手が区別できない。
- 規則を切った状態は緑になるので、**是正されたかどうかを CI が言わなくなる**
  （`.claude/rules/README.md` チェックリスト 8「守られたか事後判定できるか」）。

### 判断が要る 2 件目: #2768（`@types/vscode` の半移動）

#### 案 A: 差し替え PR — `engines.vscode` と `@types/vscode` を同時に 1.134 へ

[ADR-2562](../adr/2562-dependabot-triage-2026-08-17.md) が決めた形そのもので、前例は #2563。
bot PR を close し、3 箇所（`packages/vscode` の `engines.vscode` と `@types/vscode`、
`packages/vscode-e2e` の `@types/vscode`）を 1 コミットで動かす。

**メリット**

- ポリシーどおり。ガードが意図した解決経路であり、`vsce` も通る。

**デメリット**

- **拡張が要求する VS Code の下限が 1.125 → 1.134 に上がる**（9 マイナー分）。
  これは依存の判断ではなくプロダクトの判断で、古い VS Code のユーザーが
  Marketplace から入れられなくなる。

#### 案 B: 却下 — `@types/vscode` を 1.125 に据え置く

`@dependabot ignore this minor version` で当面オファーを止める。

**メリット**

- VS Code の下限を上げない。

**デメリット**

- 型定義が古いままなので 1.126 以降の API を型安全に使えない。
  ポリシーは「同値」であって「古いまま維持」ではないので、据え置きは決定の先送りにしかならない。

## 比較

| 観点 | #2769 案A（保留） | #2769 案B（差し替え） | #2769 案C（規則 off） |
| --- | --- | --- | --- |
| 新規則の信号 | 残る | 残る | **消える** |
| bump の適時性 | 遅れる | 即時 | 即時 |
| レビュー単位 | 分離 | **混在** | 分離 |
| 枠の占有 | 1 つ占有 | 空く | 空く |
| 是正漏れを CI が言うか | 言う | 該当なし | **言わない** |

## 現時点の方針

**#2769 を保留（案 A）、#2768 を採用して差し替え PR（案 A）、残る 6 件を採用してそのままマージする。
却下はゼロ。**

### #2769: 保留（案 A）

指摘 24 件は「lint を通すためのノイズ」ではなく、render 中の ref 参照と effect 内の
同期 setState という React の実行時挙動に関わるものである。これを bump の diff に混ぜると
（案 B）レビューで分離できず、規則を切ると（案 C）是正されたかを CI が言わなくなる。
**新しい規則が拾った信号を、消さずに別 PR で受け止める**のが素直だと判断した。

保留なので `@dependabot ignore` は設定せず、PR は open のまま残す。指摘の是正 Issue を
別途起票し、是正 PR がマージされたら #2769 を rebase してマージする。

枠を 1 つ占有する点は認識している。ただし飽和の主因は保留ではなく毎週の起票数なので、
1 件の保留で構造が変わるわけではない。

### #2768: 採用、差し替え PR（案 A）

[ADR-2562](../adr/2562-dependabot-triage-2026-08-17.md) が「`engines.vscode` と
`@types/vscode` は常に同値」と決め、`scripts/ci/vscode-version-policy.test.ts` が
それを機械で見ている。今回の失敗はそのガードが**意図どおり半移動を捕まえた**結果なので、
解決経路も既に決まっている。判定は**採用**であり、`@dependabot ignore` は設定しない。

ただし **VS Code の下限が 1.125 → 1.134 に上がる点はプロダクト判断**なので、
差し替え PR ではこれを明示する。下限を上げたくない場合のみ案 B（却下・据え置き）に倒す。

### 残り 6 件: 採用（そのままマージ）

いずれも供給側・依存エッジ・advisory とも懸念なし。

[#2766](https://github.com/kompiro/karasu/pull/2766) は major だが、breaking change は
Node.js 下限の引き上げ 1 点のみで、CI・devcontainer とも Node 24、`jsdom` は private な
`packages/app` の devDependency なので公開パッケージの `engines.node` には触れない。
`packages/app` の vitest 一式が jsdom 上で緑である以上、実地の検証も済んでいる。

[#2765](https://github.com/kompiro/karasu/pull/2765) は [ADR-2753](../adr/2753-dependabot-triage-2026-09-07.md)
で採用した astro の 1 patch 先で、`find-proc` は 0.1.0 のまま動いていない。

### 反映手順

1. [#2770](https://github.com/kompiro/karasu/pull/2770) / [#2767](https://github.com/kompiro/karasu/pull/2767) /
   [#2766](https://github.com/kompiro/karasu/pull/2766) / [#2765](https://github.com/kompiro/karasu/pull/2765) /
   [#2764](https://github.com/kompiro/karasu/pull/2764) / [#2763](https://github.com/kompiro/karasu/pull/2763)
   を順にマージする（`pnpm-lock.yaml` を触るので 1 本ずつ、必要に応じて `@dependabot rebase`）。
2. [#2768](https://github.com/kompiro/karasu/pull/2768) を close し、差し替え PR で
   `engines.vscode` + `@types/vscode` ×2 を 1.134 へ同時に動かす。`@dependabot ignore` は設定しない。
3. [#2769](https://github.com/kompiro/karasu/pull/2769) は open のまま残し、oxlint の
   新規 React 規則 24 件を是正する Issue を起票する。
4. 本 Design Doc を ADR に昇格し、同じ PR で削除する。

## 影響範囲・マイグレーション

- 既存ユーザーへの影響: [#2768](https://github.com/kompiro/karasu/pull/2768) の差し替えを
  入れた場合のみ、VS Code 拡張の要求バージョンが 1.125 → 1.134 に上がる。それ以外は
  runtime 依存の変更が `@radix-ui/react-tabs` の patch のみで、影響なし。
- ドキュメント更新: 本 Design Doc → ADR 昇格のみ。
- 既存テストデータへの影響: なし。

## 未解決の問い

- **`--deny-warnings` と linter の自動 bump は相性が悪い。** upstream が
  `suspicious` に規則を足すたび、コード無変更で CI が赤くなる。今回は保留で受けるが、
  同じことは oxlint の次の minor でも起きる。規則追加を検知して段階的に受け入れる形
  （新規規則を一度 warn 相当で観測してから昇格させる）が要るかどうかは、再発回数を見て判断する。
