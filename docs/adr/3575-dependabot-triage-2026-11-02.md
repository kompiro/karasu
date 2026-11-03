---
id: ADR-3575
title: Dependabot トリアージ 2026-11-02：npm 8 件をすべて採用し、LSP 11 と SDK 1.x は ADR の assumptions を次の major に上げる差し替え PR で入れる
status: accepted
date: 2026-11-03
topic: build
related_to:
  - ADR-3381
  - ADR-2337
  - ADR-2671
  - ADR-2628
  - ADR-2474
  - ADR-2152
  - ADR-2623
  - ADR-2447
  - ADR-1642
scope:
  packages: [app, lsp, vscode, docs-site]
  concerns: [ci, dependencies, security]
---

# ADR-3575: Dependabot トリアージ 2026-11-02：npm 8 件をすべて採用し、LSP 11 と SDK 1.x は ADR の assumptions を次の major に上げる差し替え PR で入れる

- **日付**: 2026-11-03
- **ステータス**: 決定済み
- **関連**:
  - Design Doc PR: [#3575](https://github.com/kompiro/karasu/pull/3575)（本 ADR に昇格し削除）
  - 対象 Dependabot PR: [#3552](https://github.com/kompiro/karasu/pull/3552) / [#3553](https://github.com/kompiro/karasu/pull/3553) / [#3554](https://github.com/kompiro/karasu/pull/3554) / [#3555](https://github.com/kompiro/karasu/pull/3555) / [#3556](https://github.com/kompiro/karasu/pull/3556) / [#3557](https://github.com/kompiro/karasu/pull/3557) / [#3558](https://github.com/kompiro/karasu/pull/3558) / [#3559](https://github.com/kompiro/karasu/pull/3559)
  - 差し替え PR: [#3580](https://github.com/kompiro/karasu/pull/3580)（LSP 11）/ [#3581](https://github.com/kompiro/karasu/pull/3581)（`@anthropic-ai/sdk` 1.3.0）
  - 前回トリアージ: [ADR-3381](./3381-dependabot-triage-2026-10-26.md)
  - LSP の対 upgrade と protocol 一致の不変条件: [ADR-2337](./2337-lsp-pair-upgrade-protocol-parity.md)
  - SDK を bundle 増を承知で採用した回: [ADR-2671](./2671-dependabot-triage-2026-08-31.md)
  - assumptions は major で止める: [ADR-2628](./2628-adr-assumption-version-policy.md)、`.claude/rules/adr.md`「assumptions に書くこと」
  - bump と assumptions 緩和を 1 本で入れた前例: [#2626](https://github.com/kompiro/karasu/pull/2626)（oxfmt と ADR-2447）
  - 判定語彙: [ADR-2474](./2474-dependabot-replacement-pr-vocabulary.md)、rebase は差し替えの理由にならない: [ADR-2152](./2152-dependabot-triage-2026-07-27.md)

## 背景

2026-11-02（月）21:46–21:49 UTC に週次の Dependabot PR が npm から 8 件起票された。security update ではない
（`security` ラベル無し。open な Dependabot alert は 3 件（#102 / #104 / #105）あるが、どれも今回の PR が bump する
パッケージではない。後述「対象外の観測」）。

6 件は CI green。major の 2 件（#3552 の LSP group、#3555 の `@anthropic-ai/sdk`）は CI / Check と ADR validate が
落ちている。どちらも落ちたのはテストではなく **ADR の assumptions**（ADR-2337 が `^10\.`、ADR-2671 が `^0\.` を
grep で固定）で、major を上げたら判断し直せ、という柵が意図どおりに働いた結果である。

**供給側（配布主体・改ざん）の懸念は見つからなかった。** 確認したこと:

- **依存エッジ**: lock の snapshot を peer suffix を落として merge-base（`739abdfa`）と各 PR ヘッドで突き合わせた
  （`security-alert` skill の edges 手順）。8 件を通して、main の lock に無い**パッケージ名**が新しく入るものはゼロ。
  動くのはすべて既存パッケージの版で、新しく解決される版は計 72 個（うち 68 個は rolldown / oxc-parser の platform binding）
- **publisher / provenance**: 72 個すべてで、from 版と to 版の publisher の種類が同じ。GitHub Actions OIDC + provenance の
  ものは to 版も同じ。provenance なしは従来どおりで、`vscode-*`（`microsoft1es`）、`knip`（`webpro`）、
  unified 系（`wooorm`）、`i18next`（`adrai`）、`postcss-selector-parser`（`moox`）
- **lifecycle script**: to 版で追加・変更されたものはゼロ。既存の `prepare` を持つのは `i18next`（`husky`）と
  `postcss-selector-parser`（`npm run build`）で、どちらも registry install では走らない
- **コード差分**: `npm diff` で from…to の tarball を比べ、追加行を `child_process` / `eval(` / `new Function` /
  `process.env` / `fetch(` / `atob(` / base64 decode / `fromCharCode` / `spawn` / `execSync` / `writeFileSync` /
  `homedir` / 外部 URL で grep し、該当行を読んだ。
  - 追加行が数千行を超える 5 件（`@anthropic-ai/sdk` / `lucide-react` / `rolldown` / `@opentelemetry/api` / `oxc-parser`）は
    tarball 全体で各パターンの出現数を数え、from と to で全パターン同数だった。URL のドメインも、SDK に `www.apache.org`
    （LICENSE 文）が増えた以外は同じ
  - `vite` の追加行の `child_process` / `execSync` / `spawn` / `homedir` は open-in-editor と設定ファイル探索の既存コードで、
    bundler の変数名の付け替え（`childProcess$1` → `childProcess`、`os$3` → `os`）による「移動」。8.3.4 の dist にも同じ行がある
  - `vscode-languageserver` の `spawnSync`（`npm config get prefix` / `yarn global dir`）は global module path 解決の既存処理で、
    upstream の「Windows の DEP0190 警告を避ける」修正による書き換え（削除側に旧実装がある）
  - 他の URL は各プロジェクトの docs・`github.com`・README のバッジだけ
- **既知 advisory**: 新しく解決される 72 版すべてで該当ゼロ（GitHub Advisory API の `affects=`。クエリが効いていることは
  `undici@7.30.0` で 8 件返ることで確かめた）
- **公開からの経過**: すべて起票時点で 7 日を越えている。最も新しいのは transitive の `postcss@8.5.32`（10-26 20:36 公開、
  起票まで 7 日 1 時間）、直接 bump で最も新しいのは `marked@18.1.2`（10-26 14:54）
- **`pnpm-workspace.yaml` の `overrides:`**: 衝突なし（`vite@8: ^8.3.3`、`postcss: ^8.5.18` は新版を含む）

## 決定

**8 件すべてを採用した。却下・保留はゼロ。** 6 件は bot PR をそのままマージし、major の 2 件（#3552 / #3555）は
bot PR を close して、**bump と、それを止めていた ADR の assumptions を次の major に上げる変更を 1 コミットにした
差し替え PR** で入れる。判定は「採用」なので `@dependabot ignore` は設定していない。

| PR    | 依存                 | from → to            | 種別      | 対象             | リスク | 判断                    | 反映                                                                                                                                              |
| ----- | -------------------- | -------------------- | --------- | ---------------- | ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| #3557 | `marked`             | 18.1.1 → 18.1.2      | patch     | app（runtime）   | low    | 採用                    | そのままマージ                                                                                                                                    |
| #3554 | `knip`               | 6.42.1 → 6.43.0      | minor     | root（dev）      | low    | 採用                    | そのままマージ                                                                                                                                    |
| #3556 | `vite`               | 8.3.4 → 8.3.5        | patch     | app（dev）       | low    | 採用                    | そのままマージ                                                                                                                                    |
| #3558 | `lucide-react`       | 1.60.0 → **1.62.0**  | minor     | app（runtime）   | low    | 採用                    | そのままマージ（rebase 1 回。rebase で対象版が 1.61.0 から繰り上がった。後述「結果」）                                                            |
| #3553 | `@astrojs/starlight` | 0.42.6 → 0.42.7      | patch     | docs-site（dev） | low    | 採用                    | そのままマージ（rebase 1 回）                                                                                                                     |
| #3559 | `astro`              | 7.4.1 → 7.4.2        | patch     | docs-site（dev） | low    | 採用                    | そのままマージ（rebase 2 回）                                                                                                                     |
| #3552 | `lsp` group（4 件）  | 10.1.2 → 11.0.0 ほか | **major** | lsp / vscode     | medium | 採用（bot PR は close） | 差し替え PR [#3580](https://github.com/kompiro/karasu/pull/3580)（ADR-2337 の assumptions を `^11.`、`karasu-vscode` の patch changeset）         |
| #3555 | `@anthropic-ai/sdk`  | 0.135.0 → 1.3.0      | **major** | app（runtime）   | medium | 採用（bot PR は close） | 差し替え PR [#3581](https://github.com/kompiro/karasu/pull/3581)（ADR-2671 の assumptions を `^1.`、preview での実キー往復を checklist に置いた） |

## 理由（PR ごとの分析）

### #3552 `lsp` group: `vscode-languageserver` / `vscode-languageclient` 10.1.2 → 11.0.0

同時に `vscode-languageserver-protocol` 3.18.4 → 3.18.5、`vscode-languageserver-textdocument` 1.0.15 → 1.0.16、
transitive の `vscode-jsonrpc` 9.0.3 → 10.0.0、`vscode-languageserver-types` 3.18.4 → 3.18.5。

**ADR-2337 の不変条件は守られている。** ADR-2337 が決めたのは「client と server を同時に上げ、両側の protocol を
1 版に揃える」ことで、group がそれを構造的に担保している。#3552 の lock では protocol / jsonrpc / types /
textdocument がいずれも 1 版に畳まれ（3.18.4 / 9.0.3 / 1.0.15 は消える）、server（lsp）と client（vscode）が同じ
`vscode-languageserver-protocol@3.18.5` を指す。落ちている assumption は「10.x の対」を表す
`"vscode-languageserver": "\^10\.` と `"vscode-languageclient": "\^10\.` の 2 行だけで、ADR の決定そのものではなく、
決定が適用された major を指している。

upstream の History（README）が挙げる互換性の変更は 3 点で、いずれも karasu に当たらない:

| 変更                                                    | karasu                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| JSON-RPC が Node.js 14.17.0 以上を要求                  | server は VS Code 拡張にだけ同梱され、拡張ホストの Node で満たす                                |
| `PipeTransport` / `SocketTransport` に `close()` が必須 | 自前の transport 実装なし。`packages/vscode/src/extension.ts` は `TransportKind.ipc` だけを使う |
| UUID 生成を `RAL` に集約、外部の `RAL` 実装は非対応     | `RAL` を実装・参照していない（`packages/lsp/src`・`packages/vscode/src` を grep）               |

protocol 3.18.5 は patch で、「request / notification / response は変わっていない」と明記されている。`engines.vscode` は
11.0.0 も `^1.91.0` のままで、karasu の floor（`^1.140.0`）に影響しない。

修正の中には ADR-2337 が積み残した position drift（[#2456](https://github.com/kompiro/karasu/issues/2456)）に近いものがある
（textdocument 1.0.16「incremental edit が境界をまたいで CRLF を作るときの行オフセットを修正」）。ただし #2456 の機構は
未特定のままで、本 bump で直ったとは言えない。

**CI で確かめられていること / いないこと。** CI / Check は assumptions の段で止まっており、その後ろの Typecheck・Test・
Build は skip されている。走ったのは VS Code E2E（extension host と ExTester）と Playwright で、どちらも green。
ExTester には ADR-2337 で落ちた 3 件（AT-0037-9 / AT-0038 TC-04 / AT-0039 TC-03）が含まれる。skip された分は手元で
PR ヘッドを検証した:

```
pnpm install --frozen-lockfile        # PASS
pnpm run typecheck                    # PASS
pnpm --filter @karasu-tools/lsp run test   # PASS（6 files / 72 tests）
pnpm --filter karasu-vscode run test       # PASS（9 files / 125 tests）
pnpm --filter karasu-vscode run build      # PASS
```

**反映は差し替え PR にする。** bot の diff には ADR-2337 の assumptions 更新が入らないので、bot PR のままでは CI を通せない。
bot ブランチに commit を足す形は次の recreate で失われる（`.claude/rules/dependabot.md`）。差し替え PR は次の 3 点を
1 コミットに含める:

1. #3552 と同じ 4 宣言の bump と lock
2. ADR-2337 の assumptions を `\^10\.` → `\^11\.` に上げる（本文は書き換えない。コメントで本トリアージ ADR を指す。
   #2626 / ADR-1642 と同じ「assumptions だけを更新する」形）
3. `karasu-vscode` の patch changeset（拡張に同梱される client / server の修正が利用者に届くため。ADR-2337 と同じ扱い）

### #3555 `@anthropic-ai/sdk` 0.135.0 → 1.3.0

0.x から 1.x への major で、CHANGELOG の `⚠ BREAKING CHANGES` は 1.0.0 の「new API version 2026-10-21 のサポート」1 項目だけ。
変わるものは 2 種類ある。**実通信では SDK が送る `anthropic-version` と認証ヘッダが変わり**、SDK の TypeScript の型も
変わる（下表の下 2 行）。型の変更が app の呼び出しに効くかは typecheck で、実通信の変更が効くかは API の versioning と
preflight で、分けて確かめた。

|                                      | 0.135.0          | 1.3.0                                                                        |
| ------------------------------------ | ---------------- | ---------------------------------------------------------------------------- |
| `anthropic-version` の既定           | `2023-06-01`     | `2026-10-21`                                                                 |
| API キーの送り方                     | `X-Api-Key`      | `Authorization: Bearer`                                                      |
| `MessageCreateParams` から消えた引数 |                  | `temperature` / `top_k` / `top_p`                                            |
| `MessageParam`                       | 1 つの interface | `UserMessageParam` / `AssistantMessageParam` / `SystemMessageParam` の union |

公式の [Versions](https://platform.claude.com/docs/en/api/versioning) が挙げる 2026-10-21 の Messages API の変更は 3 点で、
app はどれも送っていない:

- `assistant` メッセージに直接置いた `document` ブロックは 400 → app の assistant メッセージは API が返した
  `text` / `tool_use` をそのまま戻すだけ
- `user` メッセージの `text` ブロックに空でない `citations` を付けると 400 → app は citations を作らない
- `temperature` / `top_p` / `top_k` は全モデルで 400 → app は使っていない（`packages/app/src` を grep）

app の呼び出し（`packages/app/src/hooks/useChatSession.ts`）は `model` / `max_tokens` / `system` / `tools` / `messages` の
5 引数だけで、1.3.0 の `MessageCreateParamsBase` にすべて残っている。`MODEL` の `claude-sonnet-4-6` も 1.3.0 の `Model`
union にある。2026-10-21 の提供範囲で制約があるのは Amazon Bedrock だけで、app が使う Claude API は対象。

API キーの送り方が変わる点は、app がブラウザから直接呼ぶ（`dangerouslyAllowBrowser: true`）ため CORS に効く。
キーを付けずに preflight だけ送って確かめた:

```
$ curl -X OPTIONS https://api.anthropic.com/v1/messages \
    -H "Origin: https://karasu-preview.pages.dev" -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: authorization,anthropic-version,content-type,anthropic-dangerous-direct-browser-access,x-stainless-lang"
HTTP/2 200
access-control-allow-headers: authorization,anthropic-version,content-type,anthropic-dangerous-direct-browser-access,x-stainless-lang
access-control-allow-origin: *
```

**CI と手元で確かめられていること / いないこと。** #3552 と同じく Typecheck・Test・Build は skip されていたので、PR ヘッドで
回した:

```
pnpm install --frozen-lockfile        # PASS
pnpm run typecheck                    # PASS（MessageParam の union 化を含めて型が通る）
pnpm --filter @karasu-tools/app run test   # PASS（128 files / 1640 tests）
pnpm --filter @karasu-tools/app run build  # PASS
```

ただし app の test は SDK を通した実通信をしない。**実キーで 2026-10-21 に対して 1 往復するのは手元ではできない**（キーを
持たない）。差し替え PR の preview で、kompiro が Chat に 1 回質問し、`apply_krs_patch` か `navigate_view` を使う応答が
返ることを確かめる。bot PR では preview の deploy が skip されるので、この確認にも差し替え PR が要る。

**bundle は小さく増える。** merge-base と PR ヘッドで `packages/app` を production build し、SDK を含む chunk を比べた:

| build       | raw          | gzip        |
| ----------- | ------------ | ----------- |
| SDK 0.135.0 | 11,556,006 B | 2,465,815 B |
| SDK 1.3.0   | 11,649,736 B | 2,481,464 B |

**+93.7 kB raw / +15.6 kB gzip**。ADR-2671 が SDK を「bundle 増を承知で」採用したときの増分（+46 kB gzip）より小さい。

**反映は差し替え PR にする。** 理由は #3552 と同じで、ADR-2671 の assumption `"@anthropic-ai/sdk": "\^0\.` を
`\^1\.` に上げる更新を bump と 1 コミットにする。`@karasu-tools/app` は changeset の ignore 対象で、Chat の挙動も
変わらないので changeset は付けない（ADR-2671 の #2668 と同じ）。

なお 1.4.0 が 11-02 に出ているが、cooldown 前なので対象外。

### #3557 `marked` 18.1.1 → 18.1.2（`packages/app`、runtime）

CommonMark 準拠の修正 3 件（type 6 HTML block の終端、emphasis の flanking 規則 9–10、CLI の config 読み込み）。app は
`ChatPane` / `NodeDetailPanel` / `EdgeDetailPanel` で使う。強調記号が連続する入力の解釈が仕様側に寄るだけで、Playwright は green。
lock に `marked@18.1.1` が残るのは `@vscode/vsce@4.0.0` の exact pin（拡張のパッケージング用 dev ツール）で、配布物には入らない。

### #3558 `lucide-react` 1.60.0 → 1.61.0（rebase 後 1.62.0、`packages/app`、runtime）

1.61.0 はアイコン 4 個の追加だけで、dependencies はゼロのまま。rebase で対象が 1.62.0 に繰り上がった分は「結果」に書く。

### #3554 `knip` 6.42.1 → 6.43.0（root、dev）

検出規則の改善（ambient module の re-export 追跡、Tailwind の `@reference`、拡張子なし config を entry にしない など）。
CI の Knip は green で、新しい未使用検出は出ていない。transitive は `oxc-parser` 0.154.0 → 0.155.0 と
`@napi-rs/wasm-runtime` 1.2.5 → 1.2.6。

### #3556 `vite` 8.3.4 → 8.3.5（`packages/app`、dev）

build の chunk import map と bundled-dev の修正。transitive は `rolldown` 1.2.14 → 1.2.15（と platform binding 16 個）、
`postcss` は vite 経由で 8.5.32 が入り、`@vue/compiler-sfc` などの消費側が lock に既にあった 8.5.30 へ乗り換える
（集合比較では見えない種類の移動。edges で確認）。

### #3553 `@astrojs/starlight` 0.42.6 → 0.42.7 / #3559 `astro` 7.4.1 → 7.4.2（`packages/docs-site`、dev）

どちらも patch。starlight は TOC のレイアウトシフト修正などで、transitive に `@astrojs/mdx` 8.0.3 → 8.1.1、
`expressive-code` 系 0.44.2 → 0.44.3、`i18next` 26.4.4 → 26.5.11 などが動く。astro は content sync の高速化などで、
`vite` 8.3.5 / `rolldown` 1.2.15 を連れてくる（#3556 と同じ版）。両 PR とも Deploy Docs（docs-site の build）が green。
2 本とも `packages/docs-site/package.json` と lock を触るので、先にマージした方の後でもう一方は rebase になる見込み。

## 結果

マージ順は ADR-2671 の学び（clean なものを先に流し、conflict したものを最後にまとめて rebase する）に従った。
全 PR が `pnpm-lock.yaml` を触るので直列になる。

1. #3557 をマージした直後に #3558 が conflict し、#3554 のマージ後に #3553、#3556 のマージ後に #3559 が conflict した。
   clean だった #3554 → #3556 を先に流し、conflict した 3 本に `@dependabot rebase` を頼んでから #3558 → #3553 → #3559 の順に
   マージした。#3559 は #3553 のマージで再び conflict したので rebase が 2 回要った
2. #3552 と #3555 を close し、差し替え PR [#3580](https://github.com/kompiro/karasu/pull/3580)（LSP 11）と
   [#3581](https://github.com/kompiro/karasu/pull/3581)（SDK 1.3.0）を出した。どちらも CodeRabbit のラウンドが収束し
   （#3580 は Minor 1 件を却下、#3581 は指摘なし）、CI green で 11-03 にマージされた。bot の 6 件のマージで lock が
   conflict したので main を取り込んだ。#3580 は収束の後に取り込み、PR の変更が変わっていないこと（`tier.ts same-change`）を
   確かめて再レビューを頼まなかった。#3581 はレビューを頼む前に取り込んだ。#3581 の「preview の Chat で実キー 1 往復」の項目は、PR の checklist ではチェックされない
   ままマージされた

**rebase で対象版が 1 件繰り上がった。** #3558 は rebase 後のタイトルが `lucide-react` 1.60.0 → **1.62.0** になった
（[ADR-2623](./2623-dependabot-triage-2026-08-25.md) で astro が繰り上がったのと同じ形）。1.62.0 を同じ手順で確かめ、採用を続けた。

- 公開は 10-27 06:14 で rebase の時点で 7 日を越えている。publisher は GitHub Actions OIDC + provenance のまま。
  lifecycle script と dependencies はゼロ、advisory もゼロ、tarball 全体で不審パターンは 0 件
- 中身はアイコン 5 個の追加と、package.json への `exports` の追加（upstream #4822）。`exports["."]` の `import` は
  従来の `module` フィールドと同じ `dist/esm/lucide-react.mjs` を指し、app は `"lucide-react"` 本体しか import しないので
  解決先は変わらない。build と Playwright は green

rebase で transitive の版も 2 つ増えた（#3553 の `magic-string` 1.4.5 と `mdast-util-to-markdown` 2.2.1。#3559 も
`magic-string` 1.4.5）。どちらも 10-27 公開で 7 日を越え、publisher の種類は旧版と同じ（前者は GitHub Actions OIDC +
provenance、後者は `wooorm`）、advisory はゼロで、追加行のヒットは README と警告文の URL だけだった。

**差し替え PR の lock は、bot の 6 件をマージした後の main から作り直した。** どちらも main を取り込んでから、
main の lock に自分の manifest を当てて `pnpm install` した。

- LSP の依存エッジの差分は #3552 の 14 行とちょうど一致する
- SDK の差分は `@anthropic-ai/sdk` の 4 行だけで、`@opentelemetry/api` は 1.9.1 のまま残る（`^1.4.1` を満たすので
  再解決されない。bot PR は 1.10.0 へ動かしていた）。lock は 1.3.0 に固定し、specifier は `^1.3.0` にした。
  1.4.0（11-02 公開）は cooldown 前
- 最初は bot の 6 件より前の main から作ったので、`@napi-rs/wasm-runtime` の乗り換えと、誰からも参照されない
  `vite@8.3.4` 向け snapshot の除去が混ざっていた。どちらも 6 件のマージで main 側に入り、取り込み後は消えた

**CI が見ないものは手元で回した。** major 2 件の bot PR は、CI / Check が ADR assumptions の段で止まり、その後ろの
Typecheck・Test・Build が skip されていた。bot PR のヘッドと差し替え PR の両方で手元で回し、すべて通った
（LSP: lsp 72 件・vscode 125 件、SDK: app 1640 件 / 差し替え後 1670 件）。**assumptions で止まった major の PR は、
CI の見た目より確かめられていることが少ない。** 次回以降も、この段で落ちた PR はヘッドで Typecheck・Test・Build を回す。

## 却下した案

### bot ブランチに assumptions 更新の commit を足す

**却下**。次の `@dependabot recreate` / rebase で失われ、bot も以後その PR を更新しなくなる（`.claude/rules/dependabot.md`）。
「bot が作れる diff の形では正しい変更にならない」ケースなので差し替え PR が該当する。

### assumptions から major を外す（`\^10\.` を `\^` などに緩める）

**却下**。major を上げたら ADR の前提を読み直させる、という柵として今回まさに働いた。ADR-2628 の方針（caret は major で止める）
とも合う形をそのまま 1 つ上げる。

### SDK を 0.x に留める（`@dependabot ignore this major version`）

**却下**。0.x の最終は 0.137.0（10-20）で、それ以降の版は 1.x だけである。2023-06-01 に終了日は告知されていないが、
留めると Chat の SDK 更新が止まる。app が送る引数はどれも 2026-10-21 で変わらず、確かめられていないのは実キーでの往復だけなので、
保留ではなく preview での確認付きで採用する。

## 対象外の観測

- **open alert 3 件は本バッチでは解決しない**。#102（`@azure/msal-node`、high、既知）に加え、10-31 に #104（`glob` `>= 9.0.0, <= 14.0.1`、
  GHSA-3g3m-2fjr-6pw4）と #105（`minimatch` `< 11.0.1`、GHSA-g3hv-75wg-m249）が起票されている。lock の解決は `glob` 10.5.0 / 13.0.6、
  `minimatch` 9.0.9 / 10.2.6 で、どれも脆弱範囲の内側。#3552 の `vscode-languageclient@11.0.0` も `minimatch ^10.2.6` のままなので、
  #3552 の差し替え PR は #105 の脆弱範囲を含んだままだが、解決も悪化もしない（脆弱版が lock に残る経路は main と同じ）。
  `/hane:security-alert` で別に扱い、差し替え PR のマージの前提にはしない
