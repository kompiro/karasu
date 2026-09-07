# Dependabot トリアージ 2026-09-07 — 生成物への部分編集と、upstream が招き入れた新規パッケージ

- **日付**: 2026-09-07
- **ステータス**: 検討中
- **関連**:
  - 対象 Dependabot PR: [#2740](https://github.com/kompiro/karasu/pull/2740) / [#2742](https://github.com/kompiro/karasu/pull/2742) / [#2743](https://github.com/kompiro/karasu/pull/2743) / [#2744](https://github.com/kompiro/karasu/pull/2744) / [#2745](https://github.com/kompiro/karasu/pull/2745) / [#2746](https://github.com/kompiro/karasu/pull/2746) / [#2747](https://github.com/kompiro/karasu/pull/2747) / [#2749](https://github.com/kompiro/karasu/pull/2749) / [#2750](https://github.com/kompiro/karasu/pull/2750) / [#2751](https://github.com/kompiro/karasu/pull/2751)
  - 直前の triage: [ADR-2671](../adr/2671-dependabot-triage-2026-08-31.md)
  - gh-aw の lock 生成: [`docs/design/gh-aw-dependency-automation.md`](gh-aw-dependency-automation.md)
  - cooldown 7 日: [ADR-784](../adr/784-update-dependencies-20260421.md)
  - 判定語彙 / 差し替え PR: `.claude/rules/dependabot.md`、[ADR-2474](../adr/2474-dependabot-replacement-pr-vocabulary.md)
  - vitest 系の group 化 follow-up: [#2674](https://github.com/kompiro/karasu/issues/2674)（PR [#2738](https://github.com/kompiro/karasu/pull/2738) で反映済み）
  - コード: `.github/dependabot.yml`、`.github/workflows/*.lock.yml`、`.github/aw/actions-lock.json`

## 背景・課題

2026-09-07（月）の weekly バッチ。npm 8 件 + github-actions 2 件の計 10 件が起票された。
`security` ラベル付きはゼロ、`gh api repos/kompiro/karasu/dependabot/alerts` の open も
**0 件**で、純粋な version update バッチである。

10 件すべて CI green・`MERGEABLE CLEAN`（github-actions の 2 件は `mergeable: UNKNOWN` だが
これは GitHub 側の計算未了で、checks は全 pass）。`.github/workflows/dependabot-triage.md`
（週次 agentic workflow）による `[dep-triage]` Issue や PR コメントは今回付いていないので、
所見の検証ではなく一次調査として全件を upstream まで遡った。

`.claude/rules/dependabot.md` に従い、bump 種別を問わず 10 件すべてを upstream まで確認した。
**配布主体の乗っ取り・改ざんの兆候はゼロだった。** 判断が要ったのは 2 点で、性質が異なる。

1. **[#2740](https://github.com/kompiro/karasu/pull/2740) は生成物を部分的に書き換えている。**
   対象の `.lock.yml` は `gh aw compile` の生成物で、Dependabot は `uses:` 行だけを更新し、
   同じファイル内のメタデータと `.github/aw/actions-lock.json` を据え置いた。
2. **[#2744](https://github.com/kompiro/karasu/pull/2744)（astro）は upstream が新規パッケージを招き入れている。**
   `find-process` を、公開 17 日目・単独メンテナの fork `find-proc@0.1.0` に差し替えた。

## 現状（インベントリ）

### 対象 PR 一覧

| PR | 依存 | from → to | 種別 | 位置 | CI | リスク | 推奨 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#2751](https://github.com/kompiro/karasu/pull/2751) | `knip` | 6.32.2 → 6.33.0 | minor | root devDep | green | low | 採用 |
| [#2750](https://github.com/kompiro/karasu/pull/2750) | `svgo` | 4.0.2 → 4.1.0 | minor | `packages/cli` devDep | green | low | 採用 |
| [#2749](https://github.com/kompiro/karasu/pull/2749) | `@playwright/test` | 1.59.1 → 1.62.1 | minor ×3 | root + `packages/e2e` devDep | green | low | 採用 |
| [#2747](https://github.com/kompiro/karasu/pull/2747) | `lefthook` | 2.1.10 → 2.1.12 | patch | root devDep | green | low | 採用 |
| [#2746](https://github.com/kompiro/karasu/pull/2746) | `lucide-react` | 1.34.0 → 1.38.0 | minor ×4 | `packages/app` runtime dep | green | low | 採用 |
| [#2745](https://github.com/kompiro/karasu/pull/2745) | `@anthropic-ai/sdk` | 0.120.0 → 0.122.0 | minor ×2 (0.x) | `packages/app` runtime dep | green | low | 採用 |
| [#2744](https://github.com/kompiro/karasu/pull/2744) | `astro` | 7.2.3 → 7.2.9 | patch ×6 | `packages/docs-site` devDep | green | **medium** | 採用 |
| [#2743](https://github.com/kompiro/karasu/pull/2743) | `lsp` group 4 件 | 下記 | patch | `packages/lsp` + `packages/vscode` | green | low | 採用 |
| [#2742](https://github.com/kompiro/karasu/pull/2742) | `azure/login` | v3.0.1 → v3.0.2 | patch | 2 workflow | green | low | 採用 |
| [#2740](https://github.com/kompiro/karasu/pull/2740) | `github/gh-aw-actions/setup` | v0.86.2 → v0.87.10 | minor | 2 `.lock.yml`（**生成物**） | green | **medium** | **却下** |

`lsp` group（[#2743](https://github.com/kompiro/karasu/pull/2743)）の内訳:
`vscode-languageserver` 10.1.0 → 10.1.1 / `vscode-languageserver-protocol` 3.18.2 → 3.18.3 /
`vscode-languageserver-textdocument` 1.0.13 → 1.0.14 / `vscode-languageclient` 10.1.0 → 10.1.1。

### 供給側の確認結果（npm registry）

`published` は 10 件すべて 7 日以上前で、cooldown（[ADR-784](../adr/784-update-dependencies-20260421.md)）は
満たされている。最も新しい `lucide-react@1.38.0` が 2026-08-31 でちょうど 7 日。

| package@version | published | publisher | provenance | install script |
| --- | --- | --- | --- | --- |
| `knip@6.33.0` | 2026-08-28 | `webpro` | none | なし |
| `svgo@4.1.0` | 2026-08-24 | GitHub Actions | SLSA v1 | なし |
| `@playwright/test@1.62.1` | 2026-07-30 | GitHub Actions | SLSA v1 | なし |
| `lefthook@2.1.12` | 2026-08-28 | GitHub Actions | SLSA v1 | あり（`postinstall`。従前と同一） |
| `lucide-react@1.38.0` | 2026-08-31 | GitHub Actions | SLSA v1 | なし |
| `@anthropic-ai/sdk@0.122.0` | 2026-08-27 | GitHub Actions | SLSA v1 | なし |
| `astro@7.2.9` | 2026-08-27 | GitHub Actions | SLSA v1 | なし |
| `vscode-language*` 4 件 | 2026-08-26〜29 | `microsoft1es` | none | なし |
| `find-proc@0.1.0`（astro 経由の新規） | 2026-08-21 | GitHub Actions | SLSA v1 | なし |

メンテナ一覧の異常（新規 publisher・所有権移管・アカウント改名）は 10 件いずれにも無かった。
`vscode-language*` の provenance が none なのは従来どおりで、代わりに
`prepublishOnly` が `⛔ Can only publish from a secure pipeline ⛔` で人手 publish を塞いでいる。

### 既知 advisory との突き合わせ

`gh api /advisories?ecosystem=npm&affects=<pkg>` で全パッケージを引いた。
**移行先バージョンを脆弱範囲に含む advisory は 1 件も無い。**

| package | 該当 advisory の脆弱範囲（最新のもの） | 移行先 | 判定 |
| --- | --- | --- | --- |
| `astro` | `< 6.1.10`（GHSA-xr5h-phrj-8vxv, low）ほか 5.x 以下 | 7.2.9 | 範囲外 |
| `svgo` | `= 4.0.0`（GHSA-xpqw-6gx7-v673, high） | 4.1.0 | 範囲外（4.0.2 も範囲外） |
| `playwright` | `< 1.55.1`（GHSA-7mvr-c777-76hp, high） | 1.62.1 | 範囲外 |
| `@anthropic-ai/sdk` | `>= 0.79.0, < 0.91.1`（GHSA-p7fg-763f-g4gf, medium） | 0.122.0 | 範囲外 |
| `zod`（knip 経由） | `<= 3.22.2`（GHSA-m95q-7qp3-xv42, medium） | 4.5.4 | 範囲外 |
| `knip` / `lefthook` / `lucide-react` / `find-proc` / `standardwebhooks` / `vscode-language*` | advisory 0 件 | — | — |

`pnpm-workspace.yaml` の `overrides:` は現在空で、`package.json` の `pnpm` フィールドも空。
今回の 10 件はいずれも override に載っていないので、`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`
の失敗モード（`.claude/rules/dependabot.md`「override 付き直接依存の security update PR」）は
そもそも起こり得ない。

### 依存エッジの巻き込み

解決バージョンの集合比較ではなく `pnpm-lock.yaml` の**依存エッジ**を base とヘッドで
突き合わせた（peer suffix を落として比較）。npm 8 件のうち、意図した bump 以外に動いたのは
以下だけで、**新規に登場したパッケージ名は `find-proc` の 1 件のみ**である。

| PR | 巻き込んだ transitive | 備考 |
| --- | --- | --- |
| #2751 knip | `formatly` 0.3.0 → 0.7.0（+ `package-manager-detector` エッジ追加）、`get-tsconfig` 4.14.1 → 4.14.3、`oxc-parser` 0.143.0 → 0.147.0、`picomatch` 4.0.5 → 4.0.7、`zod` 4.4.3 → 4.5.4 | すべて既存グラフ内の版移動。新規名なし |
| #2750 svgo | `css-select` 6.0.0 へのエッジ追加（名前自体は既存） | |
| #2749 playwright | `playwright` / `playwright-core` のみ | |
| #2747 lefthook | プラットフォーム別バイナリ 10 件のみ | |
| #2746 lucide-react | なし（`react` peer は 19.2.8 のまま） | |
| #2745 anthropic-sdk | `standardwebhooks` 1.0.0 → 1.1.1 のみ（`zod` は据え置き） | |
| #2744 astro | `@astrojs/compiler-*` 0.3.2 → 0.4.0、`satteri` 0.9.5 → 0.10.5、`sharp` 0.35.3 → 0.35.4、`js-yaml` 4.3.1 → 4.3.2 ほか多数 | **`find-process` + `loglevel` が消え、`find-proc` が入る** |
| #2743 lsp group | `vscode-jsonrpc` 9.0.1 → 9.0.2、`vscode-languageserver-types` 3.18.0 → 3.18.3 | group が意図どおり 4 件を同時に動かしている |

## 制約・前提

- **判定は 採用 / 保留 / 却下 の 3 値**、反映手段（そのままマージ / 差し替え PR）はそれと別軸
  （`.claude/rules/dependabot.md`）。「rebase が必要なだけ」は差し替えの理由にならない
  （[ADR-2152](../adr/2152-dependabot-triage-2026-07-27.md)）。
- **今回は out of scope**: `.github/dependabot.yml` の変更、gh-aw 本体の運用設計の見直し。
  後者は #2740 の扱いに関連するが、対応は別 Issue に切り出す。

## 検討した選択肢

### 判断が要る 1 件目: #2740（gh-aw setup action）

`.github/workflows/dependabot-triage.lock.yml` と `security-alert-sweep.lock.yml` は、
先頭に `# This file was automatically generated by gh-aw (v0.86.2). DO NOT EDIT.` を持つ
`gh aw compile` の生成物である。Dependabot はこれを普通の workflow YAML として扱い、
**`uses:` 行 10 箇所だけ**を書き換えた。その結果ヘッド側は次の状態になっている。

| 箇所 | 値 | |
| --- | --- | --- |
| `uses:` 行（10 箇所） | `github/gh-aw-actions/setup@bc8c008a…` / `v0.87.10` | **更新された** |
| `# gh-aw-manifest` ヘッダ内の `actions[]` エントリ | `"sha":"6aab9e5b…","version":"v0.86.2"` | 据え置き |
| `# gh-aw-metadata` の `compiler_version` | `"v0.86.2"` | 据え置き |
| `.github/aw/actions-lock.json` | `"github/gh-aw-actions/setup@v0.86.2"` → `6aab9e5b…` | **PR に含まれない** |

つまり、同一ファイルの中で「マニフェストが宣言する SHA」と「実際に実行される SHA」が
食い違い、SHA pin の正本である `actions-lock.json` は旧版を指したままになる。
SHA pin は「宣言と実行が一致していること」に価値があるので、この状態は pin の意味を損なう。
また v0.86.2 のコンパイラが生成した本体スクリプトを v0.87.10 の setup action が
セットアップすることになり、0.86 → 0.87 の間の互換性は保証されていない。

なお action の SHA pin 自体は正しい。`v0.87.10` の annotated tag を辿ると
commit は `bc8c008a419c5b7a29df6f5641edd35fd1c6ea85` で PR の pin と一致し、
コミットは `github-actions[bot]` の `chore: sync actions from gh-aw@v0.87.10 (#222)`
（2026-08-31）である。問題は SHA の真正性ではなく、**生成物を部分的に書き換えたこと**にある。

#### 案 A: そのままマージする

**メリット**: 追加作業ゼロ。`uses:` の SHA 自体は tag と一致している。

**デメリット**: マニフェストと実体が食い違った生成物が main に残る。次に誰かが
`gh aw compile` を回した瞬間、この差分は無かったことになって巻き戻る（= 今回のマージは
一時的にしか効かない）。`actions-lock.json` が旧 SHA を指し続ける。

#### 案 B: 却下し、`gh aw compile` による再生成 PR に畳む

bot PR を close し、gh-aw CLI を v0.87.10 系に上げてから `.md` から
`.lock.yml` と `actions-lock.json` を再生成する PR を別に立てる。

**メリット**: 生成物が生成物として一貫する。`compiler_version` / manifest / `uses:` /
`actions-lock.json` が同時に揃う。再生成なので次の compile でも巻き戻らない。

**デメリット**: PR 1 本の追加作業。gh-aw 自体の版上げに伴う lock の差分は
`uses:` 行だけに留まらない可能性があり、diff のレビュー量が増える。

#### 案 C: 却下し、`.lock.yml` を Dependabot の対象から外す

`.github/dependabot.yml` の github-actions 設定に `ignore` を足し、生成物には
そもそも PR を起票させない。

**メリット**: 同じ形の PR が毎回出るのを止められる。

**デメリット**: 今回の bump そのものは入らないままになる。また `ignore` の粒度は
パッケージ単位（`dependency-name`）で、`.lock.yml` に限った除外は書けない。
同じ action を非生成 workflow で使い始めたときに黙って更新が止まる。

### 判断が要る 2 件目: #2744（astro が招き入れた `find-proc`）

astro 7.2.9 は `find-process@^2.1.1` を `find-proc@0.1.0` に差し替えた。
upstream の変更は [withastro/astro#17786](https://github.com/withastro/astro/pull/17786)
（commit `db7c53b`）で、changeset の文言は
`Replaces the internal find-process dependency with a smaller, lighter alternative`、
**作者は `@gameroman` = `find-proc` の唯一のメンテナ本人**である。
「コントリビュータが自作パッケージを広く使われる framework の依存に入れる」形なので、
供給側の確認を通常より厚めに行った。

確認したこと:

- `find-proc` は 2026-08-21 に作られた新しいパッケージ（`0.0.0` / `0.0.1` / `0.1.0` /
  `0.2.0` の 4 版。astro が使うのは `0.1.0`）。README に `find-process` の fork と明記。
- 配布物は 5 ファイル・18 KB（`dist/index.mjs` 521 行 + 型定義 + LICENSE + README）。
  **ランタイム依存ゼロ**（元の `find-process` が連れていた `loglevel` が消える）。
- **install / postinstall / preinstall / prepare スクリプトなし。**
- SLSA provenance あり（GitHub Actions から publish。`gameroman-npm/find-proc`）。
- 配布バンドル全文を走査した結果、**ネットワーク送信・`eval` / `new Function`・
  `process.env` 参照・`Buffer.from` によるデコード・`atob` はいずれも 0 件**。
  外部インタフェースは `node:child_process` の `exec` / `spawn` のみで、組み立てる
  コマンドは `ps ax -ww -o pid,ppid,uid,gid,args` / `netstat -tunlp` / `lsof -nP -i :<port>` /
  `netstat -ano` / `powershell.exe` と、`find-process` が元から実行していたものと同じ系統。

`astro` は `packages/docs-site` の devDependency のみで、GitHub Pages のドキュメントサイトを
ビルドするときにしか動かない。karasu の配布物（npm パッケージ・VS Code 拡張・Pages app）には
入らない。

#### 案 A: 採用（そのままマージ）

**メリット**: 7.2.3 → 7.2.9 に含まれる 6 patch 分の修正が入る。露出は docs-site の
ビルド時のみで、コードを読んだ結果も clean。

**デメリット**: 公開 17 日目・単独メンテナのパッケージがビルド経路に入る。将来
このパッケージが乗っ取られた場合、docs-site をビルドする CI ジョブが影響を受ける。

#### 案 B: 保留（次の astro リリースまで様子を見る）

**メリット**: `find-proc` が実績を積むのを待てる。

**デメリット**: astro 7.2.4 以降すべてが `find-proc` を持つので、「待つ」は
patch 更新を無期限に止めることを意味する。0.1.0 は既に astro 経由で広く配られており、
karasu が個別に待っても改ざん検知の役には立たない。

## 比較

| 観点 | #2740 案A（そのまま） | #2740 案B（再生成 PR） | #2740 案C（ignore） |
| --- | --- | --- | --- |
| 生成物の一貫性 | 崩れたまま | 回復する | 崩れない（更新も入らない） |
| 次の compile で巻き戻るか | 巻き戻る | 巻き戻らない | 該当なし |
| `actions-lock.json` の追随 | しない | する | 該当なし |
| 作業量 | ゼロ | PR 1 本 | 設定変更 + 副作用の検討 |

## 現時点の方針

**#2740 を却下し、残る 9 件を採用する。**

### #2740: 却下 → 再生成 Issue に畳む（案 B）

生成物への部分編集はマージしても次の `gh aw compile` で巻き戻る。入れるべきは
「setup action の SHA」ではなく「gh-aw v0.87.10 系で再生成した lock 一式」なので、
bot PR は close し、再生成を別 Issue として起票する。

これは判定語彙上の**却下**であって差し替え PR ではない。差し替え PR は
「bot が作れる diff の形では正しい変更にならない」ときに同じ bump を別 PR で入れる手段だが、
今回入れたいものは bump ではなく compile 結果全体で、対象ファイルも `.md` 側の
コンパイル出力に広がる。同じ bump を別の形で入れるのではない以上、差し替えとは呼ばない。

`@dependabot ignore` は設定しない。生成物であることが理由なので、パッケージ単位の
無視（案 C）では粒度が合わない。再生成 PR がマージされれば `uses:` は v0.87.10 になり、
同じ PR は二度と起票されない。

### #2744: 採用（案 A）

配布物を読んだ結果に問題が無く、install スクリプトも provenance も懸念が無い。
露出が docs-site のビルド時に限られること、`find-proc` を待っても検知の足しにならないことから、
保留する理由が立たない。ただし**単独メンテナの新規パッケージがビルド経路に入ったこと自体は
記録に残す**ので、以後 astro 系の alert を見るときにこの依存を思い出せるようにする。

### 残り 8 件: 採用（そのままマージ）

いずれも供給側・依存エッジとも懸念なし。`lsp` group（[#2743](https://github.com/kompiro/karasu/pull/2743)）は
`.github/dependabot.yml` の group 設定が意図どおり 4 パッケージを 1 PR にまとめており、
protocol 版の食い違いは発生していない。

[#2749](https://github.com/kompiro/karasu/pull/2749) は宣言レンジの下限も
`^1.49.0` → `^1.62.1` に上がるが、CI は Playwright のコンテナイメージを版で pin しておらず
（`.github/workflows/*.yml` に `mcr.microsoft.com/playwright:v*` の参照なし）、
ブラウザは毎回 install される。required gate の Playwright は 10 件すべてで pass 済み。

### 反映手順

1. [#2751](https://github.com/kompiro/karasu/pull/2751) / [#2750](https://github.com/kompiro/karasu/pull/2750) /
   [#2749](https://github.com/kompiro/karasu/pull/2749) / [#2747](https://github.com/kompiro/karasu/pull/2747) /
   [#2746](https://github.com/kompiro/karasu/pull/2746) / [#2745](https://github.com/kompiro/karasu/pull/2745) /
   [#2744](https://github.com/kompiro/karasu/pull/2744) / [#2743](https://github.com/kompiro/karasu/pull/2743)
   を順にマージする（`pnpm-lock.yaml` を触るので 1 本ずつ、必要に応じて `@dependabot rebase`）。
2. [#2742](https://github.com/kompiro/karasu/pull/2742) をマージする（lockfile 非依存なのでいつでもよい）。
3. [#2740](https://github.com/kompiro/karasu/pull/2740) を close し、理由をコメントで残す。
   `@dependabot ignore` は設定しない。
4. gh-aw の lock 再生成 Issue を起票する（`gh aw compile` で `.lock.yml` 2 本と
   `.github/aw/actions-lock.json` を v0.87.10 系で再生成）。
5. 本 Design Doc を ADR に昇格し、同じ PR で削除する。

## 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし。runtime 依存の変更は `packages/app` の
  `lucide-react` と `@anthropic-ai/sdk` のみで、どちらも API 破壊のない minor。
- ドキュメント更新: 本 Design Doc → ADR 昇格のみ。
- 既存テストデータへの影響: なし。

## 未解決の問い

- **生成物を Dependabot に部分編集させ続けるか。** 今回は再生成 PR で吸収するが、
  gh-aw が action を上げるたび同じ形の PR が出る。`.lock.yml` 内の `uses:` を
  Dependabot の対象から外す仕組み（`.gitattributes` の generated 指定は Dependabot には
  効かない）が要るかどうかは、再発回数を見てから判断する。
