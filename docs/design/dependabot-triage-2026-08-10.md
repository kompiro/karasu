# Dependabot トリアージ 2026-08-10

- **日付**: 2026-08-10
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR（第 1 バッチ）: [#2424](https://github.com/kompiro/karasu/pull/2424) / [#2425](https://github.com/kompiro/karasu/pull/2425) / [#2426](https://github.com/kompiro/karasu/pull/2426) / [#2427](https://github.com/kompiro/karasu/pull/2427) / [#2428](https://github.com/kompiro/karasu/pull/2428)
  - 対象 Dependabot PR（第 2 バッチ）: [#2432](https://github.com/kompiro/karasu/pull/2432) / [#2433](https://github.com/kompiro/karasu/pull/2433) / [#2434](https://github.com/kompiro/karasu/pull/2434)
  - PR 枠拡大の反映: [#2431](https://github.com/kompiro/karasu/pull/2431)
  - LSP ペア upgrade の tracking Issue: [#2337](https://github.com/kompiro/karasu/issues/2337)
  - 直前の triage: [ADR-2333](../adr/2333-dependabot-triage-2026-08-04.md)
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)
  - react group 化: [ADR-2318](../adr/2318-dependabot-triage-2026-08-03.md)
  - license allowlist の運用: [ADR-1320](../adr/1320-license-compliance-automation.md)
  - 運用ルール: `.claude/rules/dependabot.md`, `docs/release.md`
  - コード: `.github/dependabot.yml`, `.oxfmtrc.json`, `package.json`, `packages/*/package.json`, `pnpm-lock.yaml`, `scripts/ci/license-allowlist.ts`

## 背景・課題

2026-08-10（月）の weekly バッチで Dependabot PR が 5 件起票された。
`gh api repos/kompiro/karasu/dependabot/alerts` の open alert は **0 件**なので、
今回は security update をひとつも含まない純粋な version update バッチである。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず全 5 件を upstream まで遡って
分析した。サプライチェーン上の懸念はゼロだが、**CI red 1 件（#2427）** と、
**CI green だが upstream の peer 契約に違反している 1 件（#2425）** がある。

その後 [#2431](https://github.com/kompiro/karasu/pull/2431) で
`open-pull-requests-limit` を 8 に上げた結果、**枠が空いた分の 3 件
（#2432 / #2433 / #2434）が追加で起票された**。うち 2 件は
[ADR-2333](../adr/2333-dependabot-triage-2026-08-04.md) で先送りし
[#2337](https://github.com/kompiro/karasu/issues/2337) に切り出した
`vscode-languageserver` 9 → 10 のペア upgrade そのものである。第 2 バッチの分析は
「## 第 2 バッチ」節にまとめ、方針は第 1 バッチと合わせて 1 つの表に畳む。

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

これは単なる「オファーが遅れる」問題では済まない。`vitest` と
`@vitest/coverage-v8` のように **peer で結ばれた依存の片方だけが枠に入る**と、
枠が空くのを待つ間に片方をマージした時点で peer 不整合が lockfile に固定される。
枠上限は後述の方針で引き上げる。

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

## 第 2 バッチ（PR 枠を 8 に上げた直後に届いた 3 件）

| PR | 依存 | from → to | 種別 | スコープ | CI |
| --- | --- | --- | --- | --- | --- |
| [#2432](https://github.com/kompiro/karasu/pull/2432) | `vscode-languageserver` | 9.0.1 → 10.1.0 | **major** (runtime) | lsp | ✅ 全 green |
| [#2433](https://github.com/kompiro/karasu/pull/2433) | `vscode-languageclient` | 9.0.1 → 10.1.0 | **major** (runtime) | vscode | ❌ License allowlist / ExTester ×3 |
| [#2434](https://github.com/kompiro/karasu/pull/2434) | `astro` | 7.1.3 → 7.1.6 | patch ×3 (dev) | docs-site | ✅ |

サプライチェーン分析は 3 件ともクリーン。`vscode-languageserver` / `vscode-languageclient`
は `microsoft1es`（第 1 バッチの `vscode-languageserver-protocol` と同じ publisher。
attestation は従来どおり無し）、`astro` は GitHub Actions の OIDC + attestation。
install / postinstall / prepare の新規追加はゼロ。cooldown は `astro` 7.1.6 が
2026-07-29 公開で 12 日、LSP 2 件は 10.1.0 が十分に枯れており充足。

### #2434 `astro` — リスク low

7.1.4 / 7.1.5 / 7.1.6 の patch 3 版ぶん。lockfile の差分は大きいが、
**新規に現れるパッケージ名はゼロ**（`shiki` / `rolldown` / `postcss` /
`@astrojs/compiler-binding-*` などの既存名がバージョンだけ動く）。
既知 advisory は `astro` に 5 件あるが、脆弱範囲の上限が最大でも 7.0.9 / 7.1.0 で、
**7.1.6 はいずれの範囲にも入らない**。`docs-site` の dev 依存で、そのままマージ推奨。

### #2432 / #2433 — Issue #2337 のペア upgrade が bot から降ってきた

[ADR-2333](../adr/2333-dependabot-triage-2026-08-04.md) は
`vscode-languageserver-protocol` 3.17.5 → 3.18.2（#2328）を却下し、
`vscode-languageserver` の major とセットで扱う [#2337](https://github.com/kompiro/karasu/issues/2337)
を起こした。今回の 2 件はまさにその 2 辺だが、**Dependabot は片側ずつ別 PR で出す**ため、
そのままではペアにならない。

#### 得られた自然実験 — 失敗は「skew の向き」に従う

3 つの観測が揃った。ExTester の失敗は毎回 **同じ 3 件・同じメッセージ**である
（AT-0037-9 のハイライト不着、AT-0038 TC-04 の「line 3 に届かず last seen line 2」、
AT-0039 TC-03 の「Customer 行 17 に動かず last seen line 0」）。

| 変更 | server 側が使う protocol | client 側が使う protocol | ExTester |
| --- | --- | --- | --- |
| main（現状） | 3.17.5 | 3.17.5 | ✅ |
| #2328（protocol 直接依存のみ 3.18.2 / ADR-2333） | runtime 3.17.5・`packages/lsp` の import 3.18.2 | 3.17.5 | ❌ 同じ 3 件 |
| **#2432**（server のみ 10.1.0） | **3.18.2** | 3.17.5 | **✅ 全 pass** |
| **#2433**（client のみ 10.1.0） | 3.17.5 | **3.18.2** | ❌ 同じ 3 件 |

**単に版が食い違うと壊れるのではない。** server が 3.18.2・client が 3.17.5 という
skew は全 pass する。壊れるのは 2 例とも「**position を送り出す側が 3.18 で、
受け取る側が 3.17.5**」のときで、#2328 も `packages/lsp` のコードだけが 3.18.2 の
実装を掴み、実際に connection を張る runtime は 3.17.5 のままという同じ形だった。

これは #2337 が「機構はまだ特定できていない」と書いた部分を一段絞る。
position が計算されないのではなく**ずれて計算される**という症状とも整合し、
LSP 3.18 の position encoding negotiation を疑う #2337 の仮説を支持する。
ただし本トリアージで断定はしない — 機構の確定は #2337 の scope 4 のまま残す。

#### ペアで上げると lockfile は 1 版に collapse する

`vscode-languageclient@10.1.0` と `vscode-languageserver@10.1.0` はどちらも
`vscode-languageserver-protocol: 3.18.2` を exact pin で持つ。`packages/lsp` の
直接依存 `^3.17.5` も 3.18.2 に解決されるので、両方を上げれば protocol /
`vscode-jsonrpc` / `vscode-languageserver-types` が 1 版ずつに畳まれ、
#2337 の scope 1 が満たされる。

片方だけだと畳まれない。実際 #2432 / #2433 はどちらも lockfile に 3.17.5 と 3.18.2 を
**両方**残している（それぞれ 9.0.1 のまま据え置かれた側が 3.17.5 を掴む）。

ペア適用後に ExTester が通るかは**本トリアージでは確認できない**。devcontainer は
aarch64 で ExTester をローカル実行できず（x86-64 ChromeDriver が SIGTRAP）、
判定できるのは CI の ExTester ジョブだけである。

#### #2433 のもう 1 つのブロッカー — license allowlist

`vscode-languageclient@10.1.0` は `minimatch: ^10.2.5` を **production 依存**として
持ち込む。`minimatch` は **10.2.5 でライセンスを ISC から BlueOak-1.0.0 に変更**して
おり（10.0.1 までは ISC）、BlueOak-1.0.0 は
[ADR-1320](../adr/1320-license-compliance-automation.md) の allowlist に無い。
CI の License allowlist は fail-closed なのでここで止まる:

```
✗ Production dependencies with a license outside the allowlist:
  - minimatch@10.2.6 — BlueOak-1.0.0
```

事実関係を 4 つ:

- **レンジ上、ISC 版に逃げられない。** `^10.2.5` を満たす 10.x はすべて BlueOak。
  override で 10.0.1 に落とすのは upstream の宣言レンジに反する。
- **`minimatch@10.2.6` 自体は既に lockfile にいる**（dev 依存側）。新しいのは
  ライセンスではなく、それが **prod 表面に出る**という点。
- **これは形式論ではない。** `packages/vscode` は esbuild で `vscode-languageclient` を
  `out/extension.js` にバンドルする（ADR-1320 背景）。`.vsix` に minimatch のコードが
  実際に入るので、`THIRD_PARTY_NOTICES.md` にも効く再配布の話になる。
- **セキュリティ上はむしろ前進。** 現行 client 9.0.1 が使う `minimatch` 5.1.9 は
  ReDoS advisory の patched 版（5.1.8）以降で脆弱ではないが、10.2.6 も同様に
  全 ReDoS advisory（patched 10.2.3 が最新）の外にある。

ADR-1320 決定 3 は **allowlist の追加/削除に ADR を必須**としている。したがって
#2433 は「bot PR をマージする / しない」ではなく、**BlueOak-1.0.0 を allowlist に
加えるかどうかというライセンス方針の判断**を先に要する。

#### #2433 では型検査がまだ走っていない

License allowlist で `check` job が落ちたため、**Typecheck / Test / Build (vscode) は
skip されている**。つまり `vscode-languageclient` 10 の API が
`packages/vscode` のコードとソース互換かは**まだ未検証**。
一方 #2432 は全ステップ green なので、`vscode-languageserver` 10 の側は
`packages/lsp` のコード変更が要らないと分かっている。

### #2424 は Dependabot に recreate されている

タイトルが `bump the react group across 1 directory with 2 updates` に変わっているが、
差分は同じ（`@types/react` 19.2.18 / `@types/react-dom` 19.2.4）。第 1 バッチの判断は変えない。

## 制約・前提

- cooldown 7 日（[ADR-784](../adr/784-update-dependencies-20260421.md)）は全 8 件充足。緩和は不要。
- `oxfmt` の整形差分は bot ブランチに人手コミットを足しても `@dependabot recreate` で
  失われる（`.claude/rules/dependabot.md`）。close して人手 PR に畳むのが定石。
  LSP ペア upgrade も同じ理由で bot ブランチ上では組めない。
- allowlist の追加/削除は ADR 必須（[ADR-1320](../adr/1320-license-compliance-automation.md) 決定 3）。
  BlueOak-1.0.0 の可否は本トリアージの外にある独立した判断で、勝手に足さない。
- ExTester は CI でしか回せない（devcontainer は aarch64）。LSP 側の合否判定は
  push して CI に出すまで確定しない。

## 現時点の方針

**8 件のうち 6 件を採用する。ただし bot PR をそのままマージするのは 4 件だけで、
2 件は人手 PR に置き換える。残る LSP の 2 件は #2337 に畳んで保留する。**

| PR | 判断 | 反映方法 |
| --- | --- | --- |
| #2424 `@types/react` / `@types/react-dom` | マージ推奨 | そのままマージ |
| #2426 `@astrojs/starlight` | マージ推奨 | そのままマージ |
| #2428 `lucide-react` | マージ推奨 | そのままマージ |
| #2434 `astro` | マージ推奨 | そのままマージ |
| #2427 `oxfmt` | 採用（bot PR は close） | 人手 PR: bump + `pnpm format` の整形 3 ファイルを 1 コミットに |
| #2425 `@vitest/coverage-v8` | 採用（bot PR は close） | 人手 PR: `coverage-v8` 4.1.10 と **`vitest` 4.1.10 を同時に** 上げる |
| #2432 `vscode-languageserver` | **保留**（bot PR は close） | [#2337](https://github.com/kompiro/karasu/issues/2337) のペア upgrade に畳む |
| #2433 `vscode-languageclient` | **保留**（bot PR は close） | 同上。先に BlueOak-1.0.0 の allowlist 判断が要る |

いずれも却下ではないので `@dependabot ignore` は設定しない。#2432 / #2433 は
再オファーされうるが、#2337 の人手 PR が先に入れば自然に閉じる。

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

### なぜ #2432 を単独でマージしないか

#2432 は全 CI green なので、単独マージは技術的には可能である。それでも避ける。

- **#2337 が求める到達状態に届かない。** protocol が 1 版に collapse するのは
  client と server を両方上げたときだけで、#2432 単独では 3.17.5 と 3.18.2 が
  lockfile に併存したままになる。
- **切り分けが後で難しくなる。** いま client 側を上げると壊れることが分かっている。
  server だけ先に main へ入れると、次にやる作業は「9 → 10 のペア upgrade」ではなく
  「skew 状態からの復旧」になり、今回得た 3 点の対照（main / server のみ /
  client のみ）と比較できなくなる。実験条件を壊さないうちにペアで出す。
- **急ぐ理由がない。** どちらも dev 体験に効く更新ではなく、main は現状 green。

### なぜ #2433 を bot PR のままにしないか

ブロッカーが 2 つあり、どちらも bot ブランチ上では解けない。

1. **ライセンス** — BlueOak-1.0.0 を allowlist に足すかの判断が先。足すなら ADR が要る
   （ADR-1320 決定 3）。足さないなら `vscode-languageclient` 10 系そのものを見送ることになり、
   #2337 の前提が変わる。
2. **ExTester 3 件** — server 側とペアで上げないと直らない見込みで、これは
   #2433 の差分の外にある。

加えて #2433 では Typecheck / Build (vscode) が skip されたままなので、
client 10 の API 互換性という基本的な情報がまだ無い。ペア upgrade の人手 PR では、
まずそこが green になることを確認してから ExTester の結果を読む。

### なぜ open PR 枠を 8 にするか

今回の #2425 は「枠が足りずに peer 相手がオファーされない」ことが直接の原因なので、
枠を広げれば同じ取りこぼしは構造的に起きにくくなる。

引き上げ幅は 8 とする。npm の直接依存は 9 workspace に分散しているものの、
月曜バッチの実績は直近 3 回とも 5 件（＝上限に張り付いていた）で、
真の需要は 5 を超えている一方、無制限に近い値にするとレビュー量が読めなくなる。
8 なら peer で結ばれた組（`vitest` 系 3 パッケージが最大）が同じバッチに収まり、
かつ 1 回のトリアージで捌ける分量に収まる。

github-actions 側は既定 5 のままにする。週あたりのオファーが 1〜2 件で
枠に張り付いた実績がなく、変更する理由がない。

cooldown（[ADR-784](../adr/784-update-dependencies-20260421.md)）は据え置く。
枠の広さは supply-chain 上の待機時間とは独立した軸で、7 日の待機は変わらない。

### スライス（作業順序）

`oxfmt` の人手 PR だけは他とコンフリクトしうる（root `package.json` +
`pnpm-lock.yaml`）。lockfile の衝突を最小化するため、以下の順で処理する。

1. bot PR 4 件（#2424 / #2426 / #2428 / #2434）をマージ
2. #2425 / #2427 / #2432 / #2433 を close
3. 人手 PR A: `vitest` + `@vitest/coverage-v8` を 4.1.10 に揃える
4. 人手 PR B: `oxfmt` 0.62.0 bump + `pnpm format` の整形差分
5. 本 Design Doc を ADR に昇格（同 PR で本ファイルを削除）
6. #2337 のペア upgrade（本トリアージのスコープ外・別 Issue の仕事）

3 と 4 は互いに独立だが、どちらも `pnpm-lock.yaml` を触るので直列に出す。

6 は 1〜5 と独立に進められるが、それ自体が複数の判断を含むので #2337 に残す。
本トリアージが #2337 に引き渡すのは次の 3 点:

- 「server のみ 3.18.2」は ExTester 全 pass、「client のみ 3.18.2」は既知の 3 件が
  fail という対照結果（上の表）
- ペアで上げれば protocol / jsonrpc / types が 1 版に collapse するという確認
- BlueOak-1.0.0（`minimatch` 10.2.5 以降）の allowlist 判断が前提条件として要ること

#2337 の follow-up にある「LSP 3 パッケージの `groups:` 化」は、今回
**片側だけ green の PR が 2 本並ぶ**という形で必要性が実証された。ペア upgrade が
landed した後に入れる（先に入れても、exact pin がある間は group だけでは解決しない
という #2337 の指摘は変わらない）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（`lucide-react` のみ runtime 依存だが、使用中の 2 アイコンに変更なし）。
- ドキュメント更新: 本 Design Doc → ADR 昇格のみ。`docs/release.md` の
  「Dependabot 運用ルール」と `.claude/rules/dependabot.md` は cooldown と
  schedule だけを規定しており PR 枠に触れていないので、更新不要。
- テスト・examples への影響: `oxfmt` の整形で core の test ファイル 3 本が再整形される（挙動不変）。
- 次回以降のバッチ: 枠が 8 になるため、月曜のレビュー対象が最大 5 件から 8 件に増えうる。
  実際、枠を上げた直後に 3 件が追加で届いた。
- VS Code 拡張の配布物: 今回は LSP 2 件を保留するので `.vsix` の中身は変わらない。
  #2337 でペア upgrade を入れる時点で `THIRD_PARTY_NOTICES.md` に `minimatch` が
  加わる（allowlist 判断とセット）。

## 未解決の問い / 決めないこと

- **BlueOak-1.0.0 を allowlist に加えるか** — 本トリアージでは決めない。
  ADR-1320 決定 3 に従い独立した ADR で判断する。#2337 の前提条件。
- **position drift の機構** — 「送る側が 3.18・受ける側が 3.17.5 のときに壊れる」
  ところまでは絞れたが、position encoding negotiation が原因かは未確定。
  #2337 の scope 4 に残す。
- **`@astrojs/starlight` PR の transitive 再解決による lockfile 重複** — 今回は
  受け入れる。`@types/node` / `shiki` / `vite` の版が増え続けるようなら、
  別途 dedupe を検討する。
- cooldown 中の新しい版（`lucide-react` 1.31.0 / `oxfmt` 0.63.0 /
  `@astrojs/starlight` 0.41.7）は来週以降のバッチに任せる。
