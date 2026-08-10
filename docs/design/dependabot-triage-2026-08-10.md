# Dependabot トリアージ 2026-08-10

- **日付**: 2026-08-10
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#2424](https://github.com/kompiro/karasu/pull/2424) / [#2425](https://github.com/kompiro/karasu/pull/2425) / [#2426](https://github.com/kompiro/karasu/pull/2426) / [#2427](https://github.com/kompiro/karasu/pull/2427) / [#2428](https://github.com/kompiro/karasu/pull/2428)
  - 直前の triage: [ADR-2333](../adr/2333-dependabot-triage-2026-08-04.md)
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)
  - react group 化: [ADR-2318](../adr/2318-dependabot-triage-2026-08-03.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`
  - コード: `.oxfmtrc.json`, `package.json`, `packages/*/package.json`, `pnpm-lock.yaml`

## 背景・課題

2026-08-10（月）の weekly バッチで Dependabot PR が 5 件起票された。
`gh api repos/kompiro/karasu/dependabot/alerts` の open alert は **0 件**なので、
今回は security update をひとつも含まない純粋な version update バッチである。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず全 5 件を upstream まで遡って
分析した。サプライチェーン上の懸念はゼロだが、**CI red 1 件（#2427）** と、
**CI green だが upstream の peer 契約に違反している 1 件（#2425）** がある。

## 現状（インベントリ）

| PR | 依存 | from → to | 種別 | スコープ | CI |
| --- | --- | --- | --- | --- | --- |
| [#2424](https://github.com/kompiro/karasu/pull/2424) | `@types/react` / `@types/react-dom`（react group） | 19.2.17 → 19.2.18 / 19.2.3 → 19.2.4 | patch (dev) | app | ✅ |
| [#2425](https://github.com/kompiro/karasu/pull/2425) | `@vitest/coverage-v8` | 4.1.4 → 4.1.10 | patch (dev) | app, cli, core, docs-site, i18n, nest | ✅ |
| [#2426](https://github.com/kompiro/karasu/pull/2426) | `@astrojs/starlight` | 0.41.5 → 0.41.6 | patch (dev) | docs-site | ✅ |
| [#2427](https://github.com/kompiro/karasu/pull/2427) | `oxfmt` | 0.61.0 → 0.62.0 | minor (dev, 0.x) | root | ❌ Format check |
| [#2428](https://github.com/kompiro/karasu/pull/2428) | `lucide-react` | 1.25.0 → 1.28.0 | minor ×3 (runtime) | app | ✅ |

### cooldown（全 semver レベル 7 日、ADR-784）

今日は 2026-08-10。5 件すべて充足している。最短は `oxfmt` 0.62.0 のちょうど 7 日。

| 依存 | 対象版の公開日 | 経過 | registry の最新版 |
| --- | --- | --- | --- |
| `@types/react` 19.2.18 / `@types/react-dom` 19.2.4 | 2026-07-30 | 11 日 | 同じ |
| `@vitest/coverage-v8` 4.1.10 | 2026-07-06 | 35 日 | 同じ（4.1 系の最新） |
| `@astrojs/starlight` 0.41.6 | 2026-07-31 | 10 日 | 0.41.7（2026-08-05、cooldown 中） |
| `oxfmt` 0.62.0 | 2026-08-03 | 7 日 | 0.63.0（2026-08-10、cooldown 中） |
| `lucide-react` 1.28.0 | 2026-07-30 | 11 日 | 1.31.0（2026-08-09、cooldown 中） |

cooldown があるため 3 件は registry の最新版より 1〜3 版古い。これは設計どおりで、
差分は来週以降のバッチで追いつく。

### open PR 枠が上限に達している

`.github/dependabot.yml` は `open-pull-requests-limit` を明示していないため
**既定値 5** が効く。npm の open PR がちょうど 5 件なので、いま Dependabot は
新規 PR を起票できない。後述する `vitest` 本体の更新が今回オファーされなかった
理由もこれで説明がつく。**今回のバッチを捌くこと自体が枠の解放になる。**

## サプライチェーン分析 — 全 5 件クリーン

registry の `_npmUser` / `maintainers` / `dist.attestations` / `dist.signatures` と、
公開 tarball の `scripts` / 依存ツリーを確認した。
**新規に追加された install / postinstall / prepare スクリプトはゼロ**、
**メンテナ・配布主体の変化もゼロ**。

| 依存 | publisher | provenance | lifecycle script | 依存ツリーの変化 |
| --- | --- | --- | --- | --- |
| `@types/react` / `@types/react-dom` | `types`（Microsoft、DefinitelyTyped bot） | 署名のみ（attestation なし、従来どおり） | なし | なし（`csstype` のみ） |
| `@vitest/coverage-v8` 4.1.10 | GitHub Actions（OIDC、trusted publisher、approver `oreanno`） | attestation + 署名 | なし | なし |
| `@astrojs/starlight` 0.41.6 | GitHub Actions（OIDC） | attestation + 署名 | なし | なし（後述の再解決は starlight 自身の依存追加ではない） |
| `oxfmt` 0.62.0 | GitHub Actions（OIDC、maintainer `boshen`） | attestation + 署名 2 本 | なし | なし（`tinypool@2.1.0` 固定のまま、platform binding が 19 個とも同版で追随） |
| `lucide-react` 1.28.0 | GitHub Actions（OIDC、maintainer `ericfennis`） | attestation + 署名 2 本 | なし（`build` / `test` はあるが install 系ではない） | なし |

`gh api /advisories` で 5 件の直接依存および今回 lockfile に現れる transitive
（`nanoid` / `postcss` / `shiki` / `tinypool`）を照会した。既知 advisory に**該当する版は
1 つもない**（`nanoid` 3.3.18 は patched 3.3.17 超、`postcss` 8.5.26 は patched 8.5.23 超）。

## PR ごとの分析

### #2424 `@types/react` / `@types/react-dom`（react group）— リスク low

型定義のみの patch。`packages/app/package.json` の宣言レンジも
`@types/react-dom` が `^19.0.0` → `^19.2.4` に締まる。CI は typecheck を含めて全 green。
[ADR-2318](../adr/2318-dependabot-triage-2026-08-03.md) で作った react group が
意図どおり 1 PR にまとまっている。**特記事項なし。**

### #2425 `@vitest/coverage-v8` — リスク low、ただし peer 契約違反

サプライチェーンはクリーンで CI も green（coverage レポートも出力されている）。
問題は別にある:

```
$ npm view @vitest/coverage-v8@4.1.10 peerDependencies
{ "vitest": "4.1.10", "@vitest/browser": "4.1.10" }
```

`@vitest/coverage-v8` の peer は**完全一致ピン**である。一方 repo の `vitest` は
全 9 manifest で `^4.1.4`、lockfile も 4.1.4 のまま。つまりこの PR は
`coverage-v8@4.1.10 + vitest@4.1.4` という **upstream が動作保証していない組み合わせ**を
作る。副作用として `@vitest/utils` が 4.1.10（coverage 側の固定依存）と 4.1.4
（vitest 側）で二重に入る。

pnpm は `strict-peer-dependencies` を有効化していないため install は通り、
今回の CI も通った。**壊れてはいないが、契約上は不整合な状態を lockfile に固定する。**

`vitest` 4.1.10 は既に公開済み（cooldown も充足）なので、本来は coverage-v8 と
セットで上げるべき更新である。Dependabot が `vitest` をオファーしなかったのは
前述の open PR 上限 5 に張り付いていたためと考えられる。

### #2426 `@astrojs/starlight` — リスク low、ただし lockfile が余計に膨らむ

upstream の変更は 1 コミット（`forgejo` アイコン 1 個の追加）だけ。
それにもかかわらず lockfile の差分は starlight 本体を超えて広がっている:

| lockfile への影響 | 内容 |
| --- | --- |
| 新規追加 | `nanoid@3.3.18`（既存 3.3.17 と併存）、`postcss@8.5.26`（既存 8.5.25 と併存）、`shiki@4.4.2`（既存 4.2.0 / 4.4.1 と併存）、`undici-types@7.24.6`、`@types/node@25.9.5`（既存 25.6.0 と併存） |
| 新規の解決分岐 | `vite@8.2.0(@types/node@25.9.5)` とそれに紐づく `vitefu` / `vitest` のエントリが増える |

これは starlight が依存を増やしたのではなく、Dependabot が `pnpm install` を回した際に
floating range（`^`）の transitive が再解決されたもの。**セキュリティ上の問題はない**
（追加される版はいずれも既知 advisory の patched 版より新しい）が、
`@types/node` が 4 版・`shiki` が 3 版・`vite` の peer 分岐が増える形で
lockfile の重複が増える。CI は green。

### #2427 `oxfmt` — リスク low、CI red は既知の想定内

CI の Format check が落ちている。原因は 3 ファイルの整形差分:

```
packages/core/src/renderer/org-renderer.test.ts
packages/core/src/resolver/style-resolver.test.ts
packages/core/src/view/org-view-extract.test.ts
```

`oxfmt@0.62.0` をスクラッチ環境で実際に走らせて差分を確認した。変化は
**戻り型注釈つき arrow 関数の hug**（`.map((m): MemberNode => ({ ... }))` を
折り返さず密着させる）で、意味は変わらない。

npm の CHANGELOG に載っているのは `fix(oxfmt): type jsdoc. enum options` の 1 件だけだが、
これは `oxfmt` タグの付いたコミットしか収録していないため。oxc monorepo の
`oxfmt_v0.61.0...oxfmt_v0.62.0`（154 commits）を確認すると、原因は
[oxc#25044 `fix(formatter): hug arrows with type-reference return annotations`](https://github.com/oxc-project/oxc/pull/25044)
であり、upstream の意図的な整形修正である。

tarball 差分も changelog と整合していた（`configuration_schema.json` の
`commentLineStrategy` / `lineWrappingStyle` が enum 定義に切り出され、
`dist/` は再ビルドされた bundle のみ。新規スクリプト・新規依存なし）。

なお同区間には `feat(oxfmt)!: Format parser:yaml files by oxc_formatter_yaml` という
breaking 扱いのコミットも含まれるが、今回の format 対象（`packages/` / `scripts/` の
TS/TSX）では追加の差分は出ていない（drift は上記 3 ファイルのみ）。

[ADR-2333](../adr/2333-dependabot-triage-2026-08-04.md) の #2326 と同じ失敗モードで、
同じ対処（bot PR を close し、整形を含めた人手 PR で再提出）が使える。

### #2428 `lucide-react` — リスク low

1.26.0 / 1.27.0 / 1.28.0 の 3 版ぶん。内容はアイコン形状の調整と新規アイコン追加が中心で、
`podcast` → `mic-*` への置き換えのような**削除を伴う変更**も含まれる。

repo が `lucide-react` から import しているアイコンは 2 つだけ:

- `X`（[dialog.tsx](../../packages/app/src/components/ui/dialog.tsx#L9)）
- `ChevronRight`（[breadcrumb.tsx](../../packages/app/src/components/ui/breadcrumb.tsx#L6)）

どちらも 1.26〜1.28 の変更対象に含まれていない。API 削除の巻き添えはない。CI 全 green。

## 制約・前提

- cooldown 7 日（[ADR-784](../adr/784-update-dependencies-20260421.md)）は今回全件充足。緩和は不要。
- npm の open PR は既定上限 5 に張り付いている。5 件を捌くまで新規オファーは来ない。
- `oxfmt` の整形差分は bot ブランチに人手コミットを足しても `@dependabot recreate` で
  失われる（`.claude/rules/dependabot.md`）。close して人手 PR に畳むのが定石。

## 現時点の方針

**5 件すべてを採用する。ただし 2 件は bot PR をそのままマージせず、人手 PR に置き換える。**

| PR | 判断 | 反映方法 |
| --- | --- | --- |
| #2424 `@types/react` / `@types/react-dom` | マージ推奨 | そのままマージ |
| #2426 `@astrojs/starlight` | マージ推奨 | そのままマージ |
| #2428 `lucide-react` | マージ推奨 | そのままマージ |
| #2427 `oxfmt` | 採用（bot PR は close） | 人手 PR: bump + `pnpm format` の整形 3 ファイルを 1 コミットに |
| #2425 `@vitest/coverage-v8` | 採用（bot PR は close） | 人手 PR: `coverage-v8` 4.1.10 と **`vitest` 4.1.10 を同時に** 上げる |

いずれも却下ではないので `@dependabot ignore` は設定しない。

### なぜ #2425 を bot PR のままマージしないか

`@vitest/coverage-v8` の peer は `vitest` 完全一致ピンで、bot PR 単体では
「動くが upstream が保証しない組み合わせ」を lockfile に固定してしまう。
`vitest` を 4.1.10 に揃えれば peer は満たされ、`@vitest/utils` の重複も消える。
Dependabot は open PR 上限のため `vitest` を別 PR で出せないので、
人手 PR で 2 つ同時に上げるのが最短経路である。

`vitest` 4.1.4 → 4.1.10 は 6 版ぶんの patch。リリースノートは backport の bug fix のみ
（browser の fs アクセス確認、vm の外部モジュール解決、mocker の hoist、
worker crash 時の hang 防止など）で、breaking な記述はない。
テスト全体が回る変更なので、CI green が実質的な受け入れ確認になる。

### スライス（作業順序）

`oxfmt` の人手 PR だけは他とコンフリクトしうる（root `package.json` +
`pnpm-lock.yaml`）。lockfile の衝突を最小化するため、以下の順で処理する。

1. bot PR 3 件（#2424 / #2426 / #2428）をマージ
2. #2425 / #2427 を close
3. 人手 PR A: `vitest` + `@vitest/coverage-v8` を 4.1.10 に揃える
4. 人手 PR B: `oxfmt` 0.62.0 bump + `pnpm format` の整形差分
5. 本 Design Doc を ADR に昇格（同 PR で本ファイルを削除）

3 と 4 は互いに独立だが、どちらも `pnpm-lock.yaml` を触るので直列に出す。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（`lucide-react` のみ runtime 依存だが、使用中の 2 アイコンに変更なし）。
- ドキュメント更新: 本 Design Doc → ADR 昇格のみ。
- テスト・examples への影響: `oxfmt` の整形で core の test ファイル 3 本が再整形される（挙動不変）。

## 未解決の問い / 決めないこと

- **`open-pull-requests-limit` を既定 5 から引き上げるか** — 今回は「関連する 2 つの
  依存が同時にオファーされない」という形で実害が出た。ただし上限を上げると
  月曜バッチのレビュー量も増える。今回は既定のままとし、同種の取りこぼしが
  再発したら設定変更を ADR 付きで検討する。
- **`@astrojs/starlight` PR の transitive 再解決による lockfile 重複** — 今回は
  受け入れる。`@types/node` / `shiki` / `vite` の版が増え続けるようなら、
  別途 dedupe を検討する。
- cooldown 中の新しい版（`lucide-react` 1.31.0 / `oxfmt` 0.63.0 /
  `@astrojs/starlight` 0.41.7）は来週以降のバッチに任せる。
