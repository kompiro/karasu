---
id: ADR-2901
title: AI authoring は利用者のエージェントセッションと karasu CLI skill で行い、skill は karasu-skills パッケージから plugin と karasu skill install の両方で配る
status: accepted
date: 2026-10-03
topic: chat-ai
depends_on:
  - ADR-1315
  - ADR-1758
related_to:
  - ADR-1363
  - ADR-1895
  - ADR-1084
  - ADR-420
  - ADR-2939
scope:
  packages: [cli]
  concerns: [dependencies, deployment]
assumptions:
  - "file: packages/skills/skills/karasu-author/SKILL.md"
  - "file: packages/skills/skills/reverse-architecture/SKILL.md"
  - "file: packages/skills/.claude-plugin/plugin.json"
  - "file: .claude-plugin/marketplace.json"
  - "file: packages/skills/scripts/stamp-version.mjs"
  - "symbol: packages/cli/src/skill.ts :: skillInstall"
  - "symbol: packages/cli/src/capabilities.ts :: buildCapabilities"
  - "symbol: packages/cli/src/deprecations.ts :: DEPRECATIONS"
  - "grep: packages/cli/package.json :: \"karasu-skills\": \"workspace:\\*\""
  - "grep: packages/cli/src/index.ts :: \\.command\\(\"check <file>\"\\)"
  - "file: packages/cli/src/author-pipeline.e2e.test.ts"
  - "file: scripts/lint/skill-reference-bundle-sync.ts"
---

# ADR-2901: AI authoring は利用者のエージェントセッションと karasu CLI skill で行い、skill は karasu-skills パッケージから plugin と karasu skill install の両方で配る

- **日付**: 2026-10-03
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2901](https://github.com/kompiro/karasu/issues/2901)（[#638](https://github.com/kompiro/karasu/issues/638) を置き換え）。スライスは A [#2910](https://github.com/kompiro/karasu/issues/2910) / B [#2911](https://github.com/kompiro/karasu/issues/2911) / C1 [#2932](https://github.com/kompiro/karasu/issues/2932) / E [#2961](https://github.com/kompiro/karasu/issues/2961) / C2 [#2912](https://github.com/kompiro/karasu/issues/2912) / D [#2913](https://github.com/kompiro/karasu/issues/2913)
  - 設計 PR: [#2907](https://github.com/kompiro/karasu/pull/2907)、配布方針の改訂 [#2931](https://github.com/kompiro/karasu/pull/2931)
  - 実装 PR: C1 [#2965](https://github.com/kompiro/karasu/pull/2965)、E [#2963](https://github.com/kompiro/karasu/pull/2963)、C2 [#3019](https://github.com/kompiro/karasu/pull/3019)、公開対象への追加 [#2980](https://github.com/kompiro/karasu/pull/2980)
  - 方針の出典: [keystone PRD 追記 2026-09-26](../prd/keystone-primary-path.md#追記-2026-09-26-ai-authoring-の経路)
  - 関連 ADR: [ADR-1315](1315-release-automation-changesets.md) / [ADR-1758](1758-vscode-changeset-versioning.md)（パッケージごとに独立した版）/ [ADR-1363](1363-publish-core-package.md)（CLI はバンドルを維持。本 ADR はコンテンツの依存だけ例外にする）/ [ADR-1895](1895-reverse-architecture-harness.md)（reverse-architecture harness）/ [ADR-1084](1084-skills-plugin-portability.md)（portable skill は hane へ）/ [ADR-420](420-chat-ui-phase3-structured-interview.md)（Chat のレベル別インタビュー）/ [ADR-2939](2939-release-record-tags-and-github-release.md)（リリースの記録）
  - 関連 TPL: [TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md)（skill ↔ CLI コマンド名の drift）/ [TPL-2047](../test-perspectives/TPL-2047-doc-embedded-krs-is-parsed-not-prose.md)（文書に埋めた `.krs` は parse する）/ [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)（公開 tarball の過不足）/ [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)（repo 内の開発と公開物の一致）/ [TPL-1716](../test-perspectives/TPL-1716-user-facing-surface-docs-sync.md)（CLI の表面と docs の一致）
  - AT: [2932-karasu-skills-package](../acceptance/2932-karasu-skills-package.md) / [2912-karasu-author](../acceptance/2912-karasu-author.md)

## 背景

#638 は、karasu の構文を知らない開発者が app 内の Chat パネルでアーキテクチャを書けるかを問うていた。`reverse-architecture` skill を使った経験から、強い経路は別にあると分かった。利用者自身のコーディングエージェントのセッション（Claude Code など）が karasu CLI を駆動する経路である。そのセッションはコードベースを読め、CLI を実行して自分の出力を確かめられる。app 内の Chat（BYOK）はどちらもできない。好みの差ではなく能力の差である。

2026-09-26 に、AI authoring の primary path を「利用者のエージェントセッション + karasu CLI skill」とし、Chat パネルは凍結すると決めた（keystone PRD 追記）。`reverse-architecture` は「知らないシステムを**読む**」側で、#638 が求めていた「自分のシステムを**残す**」側は空いていた。残る論点は 2 つだった。

1. **配布**: skill を利用者の repo にどう届けるか。`reverse-architecture` は karasu repo の `.claude/skills/` にあり、ほかの repo では手でコピーするしかなかった。#2574 は「コピーした先でも動く」（reference の同梱）を解いたが、「どう届くか」は解いていなかった。
2. **drift**: skill と CLI のずれは過去に 2 回、CI に見えない形で出荷された（#2084 / #2090）。さらに、利用者の手元では skill と CLI が別々に更新されるので、「利用者の skill ↔ 利用者の CLI」のずれも起きる。

設計の調査中に、CLI 自身の `--help` が不正な構文（`label: "…"`）を教えていたことも分かった。CLI を駆動するエージェントは `--help` を読むので、これは skill の前提を壊す。

## 決定

自分のシステムを会話で `.krs` に残す skill `karasu-author` を新設し、`reverse-architecture` と一緒に npm パッケージ `karasu-skills` から配る。Claude Code には plugin marketplace、ほかのエージェントには CLI の `karasu skill install` で届ける。skill と CLI のずれは、repo 内では drift guard で、利用者の手元では版の下限の照合と CLI 側の後方互換で扱う。

### 1. 配布: `karasu-skills` パッケージを正本にし、2 つの経路で配る（案 1-D）

skill の正本は karasu repo の workspace package `packages/skills/`（npm 名 `karasu-skills`）に置く。中身は Claude Code plugin の形をそのまま取る。

```
packages/skills/
├── package.json                 # name: karasu-skills
├── .claude-plugin/plugin.json   # name: karasu
└── skills/
    ├── karasu-author/           # SKILL.md + reference/
    └── reverse-architecture/    # SKILL.md + reference/
```

| 利用者 | 経路 | 入れ方 |
| --- | --- | --- |
| Claude Code | repo ルートの `.claude-plugin/marketplace.json`（`"source": "npm", "package": "karasu-skills"`、版は固定しない） | `/plugin marketplace add kompiro/karasu` の後に `/plugin install karasu@karasu` |
| その他のエージェント | CLI が `karasu-skills` を dependency に持ち、`karasu skill install [name] [--dir <path>] [--force]` が同梱の skill を `<dir>/<name>/` に複写する（既定 `.claude/skills/`）。`karasu skill path [name]` は場所を表示する | `npx karasu skill install --dir <エージェントの skill ディレクトリ>` |

- karasu repo 内では `.claude/skills/<name>` を `packages/skills/skills/<name>` への symlink として残し、karasu の開発者自身も使う。drift guard と CI・lefthook の path filter は実体側を見る。
- `karasu-skills` も他のパッケージと同じく独立した版で管理する（ADR-1315 / ADR-1758）。CLI は `karasu-skills` を `dependencies` に `workspace:*` で持つので、公開時にその時点の版へ完全一致で書き換わり、`npx karasu@<ver> skill install` はその CLI と同じリリースの skill を入れる。changesets の cascade により、`karasu-skills` だけの変更でも `karasu` が patch で一緒に出る。
- **[ADR-1363](1363-publish-core-package.md) の例外**: ADR-1363 は「CLI は公開 core に依存せずバンドルを維持する」と決めた。`karasu-skills` は Markdown と JSON で、バンドルできない。そこで `karasu-skills` だけは実 dependency にし、`skill install` が実行時に `createRequire(import.meta.url).resolve("karasu-skills/package.json")` で場所を解決する。コードの依存は引き続きバンドルする。この例外は「CLI が実行時に読むコンテンツを運ぶ依存」に限る。
- 公開される `karasu` は `karasu-skills` の版を完全一致で指すので、同じリリースで `karasu-skills` の publish が失敗すると `npm i karasu` が解決できなくなる。リリース時に両方が公開されたことを確かめる（`docs/release.md`）。

### 2. 利用者の手元でのずれ: 下限の照合と CLI の後方互換

- **版の下限**: `karasu-skills` の `prepack` が、その時点の CLI の版を各 SKILL.md の front matter（`metadata.karasu-version`）と本文 Step 0 のプレースホルダ `{{KARASU_MIN_VERSION}}` に刻み、`postpack` で元に戻す。front matter はエージェントの文脈に渡らないことがあるので、本文にも刻む。
- **Step 0**: 各 SKILL.md の最初の節で、エージェントが次を行う。
  1. CLI の呼び方を 1 つに決める（プロジェクトの `package.json` に `karasu` があれば `npx --no-install karasu`、無ければ `karasu`）
  2. 本文の版がプレースホルダのままなら karasu repo 内の未公開版なので、版の照合を飛ばす
  3. `karasu --version` が刻まれた版より古いか、CLI が無ければ、`.krs` に触れる前に更新を案内して止まる。新しければ何も言わずに進む
  4. `karasu capabilities --json` を 1 回呼び、自分が使うコマンドが廃止・削除されていれば代わりを使い、skill が古いことを利用者に伝える
- **CLI の後方互換**（スライス E、詳細は `docs/release.md`「CLI の後方互換」）: Claude Code はサードパーティ marketplace の plugin を既定で自動更新しないので、新しい CLI と古い skill の組み合わせは普通に起きる。その互換の責任を CLI が持つ。
  - skill が使う面（コマンド名、フラグ、stdout / stderr の形式、終了コード）を壊さない。名前を変える・廃止するものは隠した別名として動かし続け、別名を消すのは major のリリースだけにする（0.x の間は 1.0 まで消さない）。
  - 廃止した別名を呼ぶと、処理したうえで stderr に固定形式の 1 行（`karasu: deprecated: 'old' -> 'new' (since X, removal Y)`）を出す。削除した項目は表に墓標として残し、`karasu: removed:` で代わりを示して失敗する。
  - 廃止の表は `packages/cli/src/deprecations.ts` の 1 か所に置き、別名・通知・`karasu capabilities --json` の出力をそこから作る。エージェント向けの面は `agent-surface.json` に記録し、表に無いまま消えるとテストが落ちる。
  - `capabilities --json` は下にコマンドを持つコマンド（`skill install` など）を `subcommands` に並べる。フィールドの追加では `schemaVersion` を上げない。

### 3. 検証コマンド: `karasu check <file>`（案 2-B）

`check` は `render` と同じコンパイル（全ビュー、import 解決込み）を行い、出力を捨てる。診断を位置付きで出し、error があれば終了コード 1 にする。「`check` が通れば `render` も通る」を保つため、parse だけの検査にはしない。skill の検証の指示は「毎回 `karasu check`」の 1 行になる。

### 4. `karasu-author` の中身

- 同梱の reference（`syntax.md` / `notation-cookbook.md` / `tags-annotations.md` / `diagnostics.md` のバイト単位のコピー）を読み、**エージェントが `.krs` を自分のファイル編集ツールで書く**。CLI の編集コマンド（`append` / `insert` / `apply` / `remove`）は、ファイルを直接編集できないときやノード単位で置換・削除するときの補助にする。
- 1 回の往復で扱うのは 1 層だけ（system の境界 → service → 所有 → domain → usecase → resource / entity → 物理）で、各往復は検証の通ったファイルで終わる。
- 書くたびに `karasu check` → `karasu fmt` を必ず実行する。`insert` などの編集コマンドは parse できない入力でも終了コード 0 で書き込み、`fmt` は parse エラーのあるファイルを位置を示さずに拒否する。止めるのは `check` だけなので、`check` を `fmt` より先に置く。
- コードベースが手元にあれば、コードで分かることは聞かずに確認を求める（Chat との能力差の本体）。構造を捏造しない（空の domain や推測の usecase を作らない）。不確かなものは `@draft` を付ける。

### 5. drift guard

| guard | 何を防ぐか |
| --- | --- |
| `skill-cli-refs` | `packages/skills/skills/**` が呼ぶ `karasu <cmd>` とフラグがすべて登録済みで、廃止済みの呼び方を使っていない |
| `skill-reference-bundle-sync` | 同梱する skill ごとの `reference/` が `docs/` の原本とバイト単位で一致し、編集禁止の README を持つ |
| `krs-fences` | skill 本文の ` ```krs ` fence が現行文法で parse できる |
| `--help` のスニペット検査 | `--help` の Examples が教える `.krs` が parse できる（`label:` の再発防止） |
| `karasu-skills-package.test.ts` | pack 後の tarball に全 skill と plugin manifest が入り、プレースホルダが残らず、作業ツリーが元に戻る。Step 0 が最初の節で、dev symlink が実体を指す |
| `author-pipeline.e2e.test.ts` | `karasu-author` が教える出発点のモデルと `insert` の例が `check` と `fmt --check` を通る。壊した入力は `check` で落ちる（#2084 型の「名前は正しいが使い方が違う」は名前の照合では捕まらず、実行して初めて捕まる） |
| `compat.test.ts` | `agent-surface.json` のコマンドとフラグが消えるなら deprecation 表に項目がある |

skill が前提にする CLI の挙動（コマンド、フラグ、出力、診断）を変える PR は、skill 本文も同じ PR で直し、changeset で `karasu` と `karasu-skills` を名指す（`.claude/rules/changesets.md`）。

## 理由

- Claude Code の利用者が plugin として任意に入れて更新でき（1-B の性質）、ほかのエージェントにも届き公開時に CLI と skill の版が揃う（1-C の性質）を両立できるのは 1-D だけだった。
- 正本を CLI と同じ repo に置くので、CLI を変える PR と skill を直す PR を同じ CI の drift guard が見る。別 repo（例 `kompiro/karasu-skills`）に切り出すと guard が karasu の CI から外れる。
- 利用者の手元のずれは向きで扱いを分けた。CLI が古い方は skill 側の下限の照合で止める。CLI が新しい方は、plugin が自動更新されない以上 skill 側では防げないので、CLI が後方互換を保ち、何が変わったかを機械で読める形で返す。廃止情報を返せば、古い skill でも代わりの呼び方で作業を続けられる。
- `karasu-author` は `.krs` の書き方を `reference/` の文法から生成させる。1 回答ごとに CLI の編集コマンドを組み立てさせるより、エージェントの得意な形（文法を読んでテキストを書く）に合い、まとまった変更も 1 回で書ける。正しさは書いた後の `check` で担保する。
- 検証専用の `check` を置くことで、#2084（`lint-style` を `.krs` の検証に使った事故）のような「正しいコマンドを知らないと間違ったコマンドを選ぶ」穴が小さくなる。

## 却下した案

- **案 1-A: karasu repo の `.claude/skills/` に置くだけ**: 利用者の repo に届く手段が手コピーしかなく、コピーした瞬間に CLI との版の対応が切れる。
- **案 1-B: plugin marketplace だけ**: Claude Code 専用になる。hane に入れる案は、hane を karasu 非依存の汎用ワークフローに限る ADR-1084 の線引きに反する。
- **案 1-C: skill を CLI パッケージ（`packages/cli/skills/`）に同梱するだけ**: エージェント非依存で版も揃うが、Claude Code 利用者が `/plugin` から入れて更新を受け取れない。1-C の `skill install` と版の刻印は 1-D にそのまま残した。
- **全パッケージを同じ版に揃える**: 検討したうえで採らなかった（#2936）。リリーストレインに乗せることと、各パッケージの版をどう上げるかは別の判断で、版はリリースごとに決めればよい。
- **案 2-A: 検証に `render` を使い続ける**: 検証のたびに SVG を作って捨てる。skill に「`render` は validator を兼ねる」という但し書きが要り、#2084 と同じ穴が残る。
- **利用者の手元のずれについて、下限の照合だけで穴を受け入れる**: plugin が自動更新されないので、CLI の後方非互換な変更がそのまま古い skill を壊す。
- **CLI に「動作を保証する最も古い skill の版」を持たせる**: 判定は正確だが、何が変わったかを skill に伝えられない。
- **skill に CLI の版の上限を刻む**: 0.x では CLI の minor のたびに警告が出る。
- **`karasu-author` を「1 回答 = 1 編集」で CLI の編集コマンドだけで書かせる**（設計時の案）: 実装時に、skill はすでに文法を同梱しているので、エージェントに直接書かせる方が自然だと判断した（#2912）。編集コマンドは補助として残した。CLI 自身が文法を返す案は別 Issue [#3015](https://github.com/kompiro/karasu/issues/3015) で扱う。

## 未解決のこと

- 作者以外の利用者による検証（スライス D、#2913）は、`karasu` と `karasu-skills` の公開後に行う。被験者の募り方は D の着手時に決める。
- `skill install` の既定ディレクトリは、利用者の大半が Claude Code なので `.claude/skills/` にした。エージェント非依存の名前（例 `.agents/skills/`）は `--dir` で指定する。
- Claude Code に入れた plugin への新しい版の届き方（自動か `/plugin` からの手動か）は、`karasu-skills` の次のリリースで確かめる（`docs/release.md`）。
