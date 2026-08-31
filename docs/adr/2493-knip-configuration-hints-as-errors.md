---
id: ADR-2493
title: knip に compiled extension をたどらせ、configuration hint を失敗として扱う
status: accepted
date: 2026-08-31
topic: build
scope:
  packages: [app, docs-site]
  concerns:
    - ci
related_to:
  - ADR-2472
  - ADR-953
assumptions:
  - "grep: knip.json :: \"treatConfigHintsAsErrors\": true"
  - "grep: knip.json :: ts,tsx,css"
  - "grep: knip.json :: ts,astro,mdx"
  - "grep: lefthook.yml :: pnpm run knip"
---

# ADR-2493: knip に compiled extension をたどらせ、configuration hint を失敗として扱う

- **日付**: 2026-08-31
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2493](https://github.com/kompiro/karasu/issues/2493) / PR [#2653](https://github.com/kompiro/karasu/pull/2653)
  - [ADR-2472](2472-dependabot-triage-2026-08-13.md)（knip 6.32.0 採用時にこの hint 3 件を別変更へ送った）
  - [ADR-953](953-ci-docs-only-paired-stub-workflow.md)（docs-only PR は CI 本体を回さない）

## 背景

`pnpm knip` は exit 0 のまま、configuration hint を 3 件報告し続けていた。

```
.css    packages/app        Compiled extension excluded by project (imports not followed)
.astro  packages/docs-site  Compiled extension excluded by project (imports not followed)
.mdx    packages/docs-site  Compiled extension excluded by project (imports not followed)
```

この hint は**パターンの文字列**だけを見て出る。knip は各ワークスペースの
`project` glob に書かれた拡張子を集め、登録済み compiler 拡張子のうちそこに
現れないものを報告する（`WorkspaceWorker` の `getConfigurationHints`）。
`packages/app` の glob は `*.{ts,tsx}`、`packages/docs-site` は `*.ts` しか
名指ししていなかったため、knip は `.css` / `.astro` / `.mdx` のファイルを一度も
開かず、そこからしかたどれないものは未使用に見え、そこが import するものは
未宣言に見える状態だった。knip 自身が「自分の視界に穴がある」と申告していた。

ADR-2472 はこの 3 件を「`project` glob を広げる別変更」に送っている。本 ADR が
その別変更にあたる。

## 決定

**`project` glob に拡張子を名指しして compiled extension をたどらせ、あわせて
`treatConfigHintsAsErrors: true` で configuration hint を失敗として扱う。**

```
packages/app        "src/**/*.{ts,tsx}"  →  "src/**/*.{ts,tsx,css}"
packages/docs-site  "src/**/*.ts"        →  "src/**/*.{ts,astro,mdx}"
```

## 理由

### 拡張子は独立した glob ではなく既存の brace パターンに畳む

`docs/docs-site` に `.mdx` ファイルは 1 件もない。独立した `src/**/*.mdx` を
足すと今回の hint は消えるが、マッチゼロになって `project-empty`
（`Refine project pattern (no matches)`）に置き換わるだけになる。brace
パターンに畳めば拡張子は名指しされ、パターン全体としては `.ts` / `.astro` に
マッチするので `project-empty` は立たない。

### 広げても新規検出はゼロだった

`pnpm knip` は findings も hint もゼロで通る。これが「knip が黙っただけ」で
ないことは、次の 3 つで確認した。

| 確認 | 結果 |
| --- | --- |
| `index.css` から `@import "./components/chat.css"` を外す | `chat.css` が unused files に出る。`main.tsx → index.css → components/*.css` の連鎖をたどっている |
| 参照のない `src/components/Probe.astro` を置く | unused files に出る |
| `src/pages/probe.mdx` を置く | Astro の page entry として扱われ、報告されない |

### docs-site の `ignoreDependencies` は縮まない

Issue #2493 の Notes は「astro/mdx の import をたどれば `ignoreDependencies` を
減らせるかもしれない」と予想していたが、これは成り立たない。
`packages/docs-site/scripts/lib/core.ts` が、tsx でビルドなしに動かすために
core を深い相対パス（`../../../core/src/index.ts`）で import し、
`@karasu-tools/core` の devDependency 宣言のほうを依存グラフ上の正直な辺として
残す、と明記している。ignore を外すと unused devDependency として報告される。
理由は compiled extension と無関係なので、この項目は据え置く。

### hint は exit code に影響しないので、放置すると穴は黙って開き直る

`treatConfigHintsAsErrors` を入れない場合、compiler 拡張子を登録する依存が
増えたり glob が狭められたりしても CI は緑のままで、誰も読まない hint が
1 行増えるだけになる。ADR-2472 が置いた判定軸（赤の原因が upstream の欠陥では
なく自分側の gate なら、先送りせず直してから採用する）をそのまま適用すると、
この状態を機械が保持する側に倒れる。

## 受け入れた blast radius

この設定は hint の種類を選べない（全 18 種が対象）。さらに `lefthook.yml` の
`pre-push` は `pnpm run knip` を `glob:` フィルタなしで走らせるため、CI だけで
なくローカルの push も対象になる。knip は以前から findings で push を止めて
いるので増えるのは hint クラスの分だが、ADR-953 の `paths-ignore` で CI 本体を
回さない docs-only の push でも pre-push は走る、という非対称は残る。

発火しうるのは次の 4 クラスで、いずれも本ブランチで再現を確認した。

| クラス | 発火条件 |
| --- | --- |
| `ignore*` の陳腐化 | `ignoreDependencies` の項目（例: `packages/cli` の `yaml`）が不要になったとき |
| `entry-empty` / `project-empty` | glob にマッチする最後のファイルを削除・改名したとき |
| `project-extension-unregistered` | compiler を登録する依存が外れたとき。`.mdx` を登録しているのは `@astrojs/starlight` である |
| 新しい heuristic | knip の minor bump で hint の判定が増減したとき |

2 番目と 3 番目は直感に反する。無関係なファイル削除や依存変更が、触ったものでは
なく `knip.json` についての苦情で落ちる。それでも受け入れるのは、どのクラスも
「`knip.json` が repo の実態からずれた」状態を指しており、代替が「誰も読まない
hint」だからである。**赤を踏んだら `knip.json` の該当 glob を直す**、が対処法に
なる。

あわせて 2 つの副作用を明示しておく。

- `.mdx` を brace パターンに畳んだ結果、`project-empty` は（パターン単位で
  評価されるため）これを空だと報告できなくなった。docs-site は `.mdx` の
  カバーを主張しながら実ファイルを持たず、その主張が表面化する経路は上表
  3 番目の hard failure だけになる
- app の glob を `.css` に広げたことで、テストが `readFileSync` でパス指定
  でのみ触るスタイルシートが false positive になる経路ができた。現状は 14 件
  すべてが `main.tsx → styles/index.css` の `@import` 連鎖にぶら下がっている
  ので誤検出はないが、連鎖から外れたうえでテストからのみ参照されるものが
  出れば unused file として落ちる

## 却下した案

### glob だけ広げて `treatConfigHintsAsErrors` は入れない

Issue #2493 の Done when（hint を出さないこと）はこれで満たせる。却下したのは、
満たした状態を保持する仕組みが何も残らないため。hint は exit code に影響せず、
CI は緑のままなので、再び穴が開いても気づく契機がない。

### 独立した `src/**/*.mdx` glob を足す

`.mdx` が実ファイルを持たないことを `project-empty` として毎回報告させる形。
情報としては正直だが、Done when の「hint ゼロ」と両立しない。
