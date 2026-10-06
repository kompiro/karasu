# karasu CLI authoring skill（AI authoring の primary path）

- **日付**: 2026-09-26
- **ステータス**: 検討中（2026-09-27 論点 1 を改訂）
- **関連**:
  - 引き金 Issue: [#2901](https://github.com/kompiro/karasu/issues/2901)（#638 を置き換え）
  - 改訂: 2026-09-27 配布方針を案 1-C から案 1-D（skills パッケージ + plugin marketplace + `karasu skill install` の組み合わせ）に改めた。[#2901 のコメント](https://github.com/kompiro/karasu/issues/2901#issuecomment-5853291677)（別 repo 案。後続のコメントで karasu repo 内に改めた）と後続の議論による
  - 方針の出典: [keystone PRD 追記 2026-09-26](../prd/keystone-primary-path.md#追記-2026-09-26-ai-authoring-の経路)
  - 関連 ADR: [ADR-1315](../adr/1315-release-automation-changesets.md) / [ADR-1758](../adr/1758-vscode-changeset-versioning.md)（パッケージごとに独立した版。案 1-D もこれに従う）/ [ADR-1363](../adr/1363-publish-core-package.md)（CLI はバンドルを維持。案 1-D はコンテンツの依存だけ例外にする）/ [ADR-1895](../adr/1895-reverse-architecture-harness.md)（reverse-architecture harness）/ [ADR-1084](../adr/1084-skills-plugin-portability.md)（portable skill は hane plugin へ）/ [ADR-420](../adr/420-chat-ui-phase3-structured-interview.md)（Chat のレベル別インタビュー）
  - 関連 TPL: [TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md)（skill ↔ CLI コマンド名 drift）
  - 関連 TPL（案 1-D で追加）: [TPL-1681](../test-perspectives/TPL-1681-publishable-tarball-completeness.md)（publish する tarball に `skills/` / `.claude-plugin/` / `reference/` が揃っているか）/ [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)（repo 内の symlink 経由の開発と、npm から入れた plugin で挙動が揃うか）
  - 先行 Issue: [#2574](https://github.com/kompiro/karasu/issues/2574)（reference bundle）/ [#2093](https://github.com/kompiro/karasu/issues/2093)（skill-cli-refs guard）/ [#2084](https://github.com/kompiro/karasu/issues/2084)（`lint-style` を検証に使った事故）
  - コード: `packages/cli/src/index.ts`, `.claude/skills/reverse-architecture/`, `scripts/lint/skill-cli-refs.ts`, `scripts/lint/skill-reference-bundle-sync.ts`, `scripts/lint/krs-fences.ts`

## 背景・課題

AI authoring の primary path は「利用者自身のエージェントセッション + karasu CLI skill」に決まった（keystone PRD 追記）。app 内 Chat は凍結する。残っているのは、その skill を実際に作ることと、次の 2 つの未決事項:

1. **配布**: 利用者の repo にどう届けるか。reverse-architecture は karasu repo の `.claude/skills/` に置かれていて、karasu 以外の repo で使うには手でコピーするしかない。#2574 は「コピーした先でも動く」（reference の同梱）を解いたが、「どうやって届くか」は解いていない。
2. **drift guard**: skill と CLI のずれは過去に 2 回、CI に見えない形で出荷された（#2084 / #2090）。新 skill にも同じ guard が要る。

加えて、この設計の調査中に **CLI 自身の `--help` が不正な構文を教えている** ことが分かった。`append` / `apply` / `insert` の Examples は `service NewService { label: "New Service" }` と書くが、パーサは `label: "…"` を受け付けない（`Expected string literal after "label"`）。authoring skill は CLI を駆動するエージェントに `--help` を読ませる経路そのものなので、これは skill の前提を壊す。

reverse-architecture との役割分担は PRD の通り: reverse は「知らないシステムを**読む**」、本 skill は「自分のシステムを**残す**」。本設計は次の 2 つを行う:

1. **`karasu-author` を新しく追加する。** reverse とは役割が別の skill で、reverse を置き換えるものではない。
2. **既存の reverse-architecture も配布する。** これまで手コピーでしか karasu 以外の repo に持ち出せなかったので、`karasu-author` と同じ `karasu-skills` パッケージに入れ、plugin と `karasu skill install` の両方で配る（案 1-D、スライス C1）。reverse-architecture は廃止しない。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 編集コマンド | `append`（stdin → ファイル末尾に top-level block）/ `insert <parent-id>`（stdin → 指定ノードの最後の子）/ `apply`（同 ID があれば置換、無ければ追記）/ `remove <node-id>` / `fmt` |
| 編集コマンドの入力検査 | しない。`echo 'service X { label: "x" }' \| karasu append` のような不正スニペットも 0 終了で書き込まれ、`render` まで誰も気づかない |
| 検証 | 専用コマンドなし。`render` が error-severity の診断で非ゼロ終了するので、reverse-architecture は `render` を validator として使っている。出力（SVG）は捨てる前提 |
| 表示 | `render -o <file>.svg`、`serve`（ブラウザで live preview） |
| 既存 skill | `.claude/skills/reverse-architecture/`（SKILL.md 892 行 + `reference/` に `syntax.md` / `notation-cookbook.md` / `tags-annotations.md` / `diagnostics.md` の byte-identical コピー） |
| drift guard | `skill-cli-refs`（`.claude/skills/**` の `karasu <cmd>` がすべて登録済みコマンドか）/ `skill-reference-bundle-sync`（reverse の `reference/` が docs と一致するか。対象ディレクトリは reverse 固定）/ `krs-fences`（docs 内の ```krs フェンスをパース。`.claude/skills/` は対象外） |
| npm package | `karasu`（`packages/cli`）。`files` は `dist/index.js` と `THIRD_PARTY_NOTICES.md` のみ |
| Chat の資産 | `packages/app/src/hooks/useChatSession/prompt.ts` のレベル別インタビューガイド（system → service → domain → usecase で「次に何を聞くか」）。凍結するが、中身は skill の interview protocol に移植できる |

## 制約・前提

- **エージェント非依存に寄せる**。Issue の言い方は「Claude Code or similar」。SKILL.md 形式（front matter + 本文）は Claude Code 以外のエージェントも読めるが、配布機構まで Claude Code 専用にすると「similar」を切り捨てる。
- **skill は利用者が手元に持っている CLI のバージョンと食い違ってはいけない**。skill が新しい CLI 機能を前提にし、利用者の CLI が古い（またはその逆）と、エージェントは存在しないコマンドや構文を試す。drift は「repo 内の skill ↔ repo 内の CLI」だけでなく「利用者の skill ↔ 利用者の CLI」でも起きる。
  > 2026-09-27 改訂: 案 1-D は独立した版で出すので、完全一致ではなく「CLI が skill の刻んだ版以上」で判定する。逆向き（CLI の方が新しい）は、skill が前提にする CLI の挙動を変えるリリースでは changeset の名指しで skill も再公開されるので、実際に食い違うのは CLI が挙動を後方非互換に変えたのに名指しを忘れた場合に限られる。これは repo 内の drift guard（論点 3）と名指しルールで防ぐ。ただし plugin は既定で自動更新されないので、再公開した skill が利用者に届く保証はない。そこで新しい CLI と古い skill の組み合わせは、CLI 側の後方互換と、CLI が廃止情報を skill に返す仕組みで扱う（論点 5）。
- **`.krs` が唯一の状態**。reverse と同じく、エージェントは会話履歴ではなく毎回 `.krs` を読み直す。
- Chat panel には手を入れない（凍結）。
- **skill の正本は karasu repo に置く**（2026-09-27 決定）。別 repo（例: `kompiro/karasu-skills`）に切り出すと、`skill-cli-refs` / `skill-reference-bundle-sync` / `krs-fences` といった drift guard が karasu の CI から外れる。正本が CLI と同じ repo にあれば、CLI を変える PR と skill を直す PR を同じ CI が見る。
- **Claude Code 利用者は plugin として入れられる**（2026-09-27 決定）。利用者が任意に `/plugin` から入れ、更新も plugin 機構で受け取れること。
- out of scope: Chat の削除。

## 検討した選択肢

### 論点 1: 配布

#### 案 1-A: karasu repo の `.claude/skills/` に置くだけ（reverse と同じ）

**メリット**: 追加実装ゼロ。既存 guard がそのまま効く。

**デメリット**: 利用者の repo に届く手段がない（手コピー）。コピーした瞬間に CLI とのバージョン対応が切れる。Issue の受け入れ条件「karasu 以外の repo で動く」を、手順書で満たすだけになる。

#### 案 1-B: Claude Code plugin marketplace（karasu repo に `.claude-plugin/marketplace.json`、または hane / `kompiro/claude-skills`）

**メリット**: Claude Code 利用者は `/plugin` でインストールでき、更新も plugin 機構で届く。

**デメリット**: Claude Code 専用。plugin のバージョンは CLI のバージョンと独立に進むので、「利用者の skill ↔ 利用者の CLI」の drift を構造的に防げない。hane に入れる案は ADR-1084 の線引き（hane は karasu 非依存の汎用ワークフロー）に反する。

#### 案 1-C: npm package に同梱し、CLI から取り出す

<!-- absent-path-next-line: the directory this design proposes to create (#2901 slice C) -->
skill の正本を `packages/cli/skills/karasu-author/` に置き、`files` に含めて npm tarball に同梱する。CLI に取り出しコマンドを 1 つ足す:

```
karasu skill install [--dir <path>]   # 既定: ./.claude/skills/karasu-author/
karasu skill path                     # 同梱 skill の絶対パスを表示（他エージェント向け）
```

**メリット**: skill のバージョン = CLI のバージョン。`npx karasu@<ver> skill install` すれば、その CLI で確実に動く skill が入る。エージェント非依存（ファイルを置くだけ。`--dir` で任意の場所へ）。repo 内では正本が CLI と同じ package にあるので、CLI を変える PR と skill を変える PR が同じ `packages/cli/**` の変更として見える。

**更新の契約**: 一致が保証されるのは install した時点だけ。後から CLI だけを上げると、配置済みの古い skill が残る。これを放置しないため、`skill install` は書き出す SKILL.md に CLI のバージョン（`karasu-version: <ver>`）を刻み、skill はセッション開始時に `karasu --version` と照合する。食い違っていれば、エージェントは作業に入る前に `karasu skill install` の再実行を利用者に促す（自動上書きはしない。利用者が skill を手で直している可能性があるため）。

**デメリット**: CLI にコマンドが 1 つ増える。skill の文言修正だけでも CLI の release が要る（release は changesets で既に日常化しているので許容）。

案 1-C を採っても、Claude Code 向け plugin（1-B）は後から「同じ正本を指す marketplace entry」として足せる。逆向き（1-B を正本にして npm に載せる）は version lock を失う。

> 2026-09-27 改訂: 当初は 1-C を推奨していた。その後、Claude Code 利用者には plugin として任意に入れられる形が望ましい、という要件が加わり、1-C の正本を独立した npm package に切り出して 1-B と 1-C の両方の経路から配る案 1-D に改めた。1-C の `skill install` と更新の契約は 1-D にそのまま残る。

#### 案 1-D: skills パッケージを正本にし、plugin marketplace と `karasu skill install` の両方から配る（推奨）

skill の正本を karasu repo の新しい workspace package `packages/skills/` に置き、npm に `karasu-skills` として公開する。package の中身は Claude Code plugin の形をそのまま取る:

```
packages/skills/
├── package.json                 # name: karasu-skills
├── .claude-plugin/plugin.json   # name: karasu
└── skills/
    ├── karasu-author/           # SKILL.md + reference/
    └── reverse-architecture/    # .claude/skills/ から移す
```

配る経路は 2 つで、どちらも同じ tarball を読む:

| 利用者 | 経路 | 入れ方 |
| --- | --- | --- |
| Claude Code | karasu repo ルートの `.claude-plugin/marketplace.json` の entry（`"source": "npm", "package": "karasu-skills"`） | `/plugin marketplace add kompiro/karasu` の後に `/plugin install karasu@karasu` |
| その他のエージェント | CLI が `karasu-skills` を dependency に持ち、`karasu skill install [name] [--dir <path>]` が同梱の skill をファイルとして配置する | `npx karasu skill install karasu-author` |

**バージョンの揃え方**:

- 公開側: `karasu-skills` は他のパッケージと同じく独立した版で管理する（ADR-1315 / ADR-1758 の independent versioning。全パッケージを同じ版に揃える案は検討したうえで採らなかった。#2936）。CLI と同じリリースで出ることは changesets の cascade（CLI が `karasu-skills` を実 dependency に持つので、`karasu-skills` の bump が CLI の patch bump を起こす）で保証される。定期的なリリースの cadence は月次リリーストレイン（#2922、設計中）で決める予定で、本設計はそれに依存しない。CLI は `karasu-skills` を `workspace:*` で依存し、publish 時にその時点の正確な版へ書き換わるので、`npx karasu@<ver>` は必ず、その CLI と同じリリースで repo にあった skill を持つ。
- changeset の名指し: skill が前提にする CLI の挙動（コマンド、フラグ、出力、診断）を変える PR は、skill 本文も同じ PR で直し、changeset で `karasu-skills` も名指す。skill の食い違いチェック（論点 3）が repo 内の一致を保証し、名指しが公開物の一致を保証する。このルールが編集時に読み込まれるよう、C1 で `.claude/rules/changesets.md` の版管理対象パッケージの一覧に `karasu-skills` を足し、`paths:` に skills パッケージ（Markdown / JSON を含む）を加える。
- CLI からの読み方: 今の CLI は `@karasu-tools/core` などを esbuild で `dist/index.js` に内包し、tarball には `dist/index.js` と `THIRD_PARTY_NOTICES.md` しか載せない（`packaging.test.ts` が固定）。`karasu-skills` は Markdown と JSON なのでバンドルできない。そこで CLI の `package.json` の `dependencies`（devDependencies ではない）に `karasu-skills` を置き、esbuild では external にし、`skill install` は実行時に `import.meta.resolve("karasu-skills/package.json")` などで `node_modules` 内のパッケージの場所を解決してファイルを複写する。これは [ADR-1363](../adr/1363-publish-core-package.md) の「CLI は公開 core に依存せずバンドルを維持する（可動部を減らす）」に対する例外になる。バンドルできないコンテンツを運ぶ依存は `karasu-skills` だけに限り、コードの依存は引き続きバンドルする。実装時（C2）に `packaging.test.ts` の期待値を `dependencies` を含む形へ更新し、ADR-1363 との関係を ADR 昇格時に記録する。
- 利用者側: plugin と CLI は別々に入るので、手元で一致する保証はない。1-C の「更新の契約」を両経路に共通で適用する。pack 時（`prepack`）に、その時点の CLI の版（`packages/cli/package.json` の version）を各 SKILL.md の front matter へ `karasu-version: <ver>` として刻む。版は独立しているので、これは「この skill はこの版以降の CLI を前提に書かれた」という下限の意味になる。skill はセッション開始時に `karasu --version` と比べ、CLI がこれより古ければ作業に入る前に利用者へ知らせる（CLI の更新を促す）。CLI の方が新しい場合は、CLI だけが上がって skill が再公開されなかったリリースでも起きる正常な状態なので止めない（skill が前提にする挙動を変えるリリースでは、上の名指しで skill も再公開される）。repo 内の正本には値が入っておらず、照合は「karasu repo 内で開発中」として飛ばす。
- 照合の実行経路: skill はエージェントが読む文章で、実行される処理を持たない。そこで照合は **各 SKILL.md 本文の最初の手順（Step 0）** としてエージェントに行わせ、両経路で同じ本文を使う（plugin 経路も `skill install` 経路も配置されるのは同じ SKILL.md）。
  - 値の置き場: front matter はエージェントの文脈に渡されないことがあるので、`prepack` は front matter の `karasu-version` に加えて、本文の Step 0 に置いたプレースホルダ（例 `{{KARASU_MIN_VERSION}}`）も同じ版に置き換える。エージェントは本文に書かれた版を読むだけでよい。repo 内の正本ではプレースホルダが残っており、Step 0 は「置き換わっていなければ開発中なので飛ばす」と書く。
  - CLI の呼び方: Step 0 の最初に、以後の全手順で使う CLI の呼び方を 1 つに決める。プロジェクトの `package.json` の dependencies / devDependencies に `karasu` があれば `npx --no-install karasu`（npm はローカルの `node_modules/.bin` を `npm exec` の実行時だけ PATH に入れるので、裸の `karasu` ではローカル版を見つけられない）、無ければグローバルの `karasu`。以下の `karasu` はこの呼び方を指す。
  - 手順: エージェントは `karasu --version` を実行し、1 行目のパッケージ版を Step 0 の版と semver で比べる。コマンドが見つからない、または古い場合は、`.krs` に触れる前に利用者へ「この skill は karasu <版> 以降向け。karasu を更新してから続けてほしい」と伝えて止まる。更新方法は skill が CLI を呼ぶ方法と揃える: グローバルの `karasu` を呼ぶなら `npm i -g karasu@latest`、プロジェクトの devDependency の karasu を `npx --no-install karasu` で呼ぶなら `npm i -D karasu@latest`。`npx karasu@latest` はその場で実行するだけで、以後の `karasu` の解決先は変わらないので、更新方法としては案内しない。新しい場合は何も言わず進む。
  - 検査: 論点 3 の「バージョン刻印」テストで、pack 後の tarball の全 SKILL.md にプレースホルダが残っていないことと、Step 0 が本文の先頭の手順であることを確かめる。
- marketplace entry には `version` を書かず、最新の `karasu-skills` を追う。release のたびに `marketplace.json` を書き換えずに済み、利用者の CLI が古い場合は上の照合が拾う。

**karasu repo 内での開発**: reverse-architecture は今も karasu 開発者自身が使うので、`.claude/skills/reverse-architecture` は skills パッケージ内の実体を指す symlink として残す。drift guard（`skill-cli-refs` / `skill-reference-bundle-sync` / `krs-fences`、`reverse-skill-adr-sync.test.ts`）と `reference-docs-check.yml` / 対になる `reference-docs-check-skip.yml`（`paths-ignore:` を `paths:` と一致させる約束がある）/ lefthook の path filter は、実体のある skills パッケージ側を見るように付け替える。スクリプト自体は symlink をたどれるので読み取りは壊れないが、CI と lefthook の path filter（`.claude/skills/reverse-architecture/**`）は実体側のファイルの変更では起動しない。検査対象と起動条件を実体に揃えないと、skill を直した PR でガードが走らない。

**メリット**: 1-B（Claude Code 利用者は `/plugin` で入れて更新を受け取れる）と 1-C（エージェント非依存、公開時の version lock）の両方が取れる。正本は 1 か所で、drift guard は karasu の CI に残る。reverse-architecture も同じ経路に乗り、手コピー問題が消える。

**デメリット**:

- publish する package が 1 つ増える。`release.yml` の header が公開対象を `karasu` と `@karasu-tools/core` だけと書いているので、C1 でそこにも `karasu-skills` を足す。npm の Trusted Publishing は package が存在してからでないと登録できないので、`karasu-skills` の初回だけは token による手動 publish で bootstrap し、その後 npmjs.com で Trusted Publisher（repo `kompiro/karasu` / `release.yml`）を登録する必要がある（人手の作業）。
- marketplace の npm source は Claude Code の docs に記載があるが、karasu ではまだ試していない。実際に `/plugin install` できるか、更新がどう届くかは配布スライスの最初に確かめる。
- plugin 経路では、利用者の CLI とのバージョン一致を公開の仕組みで保証できない（照合で検出するだけ）。

### 論点 2: 検証コマンド

#### 案 2-A: reverse と同じく `render` を validator として使う

**デメリット**: 検証のたびに SVG を生成して捨てる。skill の本文に「`render` は validator を兼ねる、出力は捨てよ」という但し書きが要り、#2084 と同じ「正しいコマンドを知らないと間違ったコマンドを選ぶ」穴が残る。

#### 案 2-B: `karasu check <file>` を追加する（推奨）

パースと validation だけを行い、全診断（warning 含む）を `file:line:col: severity code message` で stderr に出し、error があれば非ゼロ終了する。render のレイアウト計算を走らせない。

**メリット**: 1 編集 1 検証のループが速く、skill の指示が「毎回 `karasu check`」の 1 行になる。reverse-architecture も後で乗り換えられる。

**デメリット**: コマンドが 1 つ増える（render と診断経路を共有するので実装は薄い）。

### 論点 3: drift guard

既存 guard の射程を新 skill に広げ、#2084 型（「コマンド名は正しいが使い方が違う」）を閉じる実行型の guard を 1 本足す:

| guard | 変更 |
| --- | --- |
| `skill-cli-refs` | 走査対象を skills パッケージ（案 1-D）に付け替える（`.claude/skills/reverse-architecture` は symlink になるので、実体側を見る） |
| `skill-reference-bundle-sync` | bundle を「reverse 固定」から「(bundle dir, 収録 docs) の表」に一般化し、skills パッケージ内の reverse-architecture と karasu-author の `reference/` を登録 |
| `krs-fences` | 走査 root に skills パッケージ（案 1-D）を追加（skill 本文の ```krs 例がパースできること） |
| バージョン刻印 | skills パッケージの `prepack` が全 SKILL.md の front matter に `karasu-version` を刻み、本文 Step 0 のプレースホルダを置き換えること（pack 後の tarball にプレースホルダが残らない）、`plugin.json` と `package.json` の名前・バージョンが食い違わないことを vitest で確かめる |
| **新設: skill pipeline e2e**（`packages/cli` の vitest） | skill が規定する編集ループ（`append` → `insert` → `check` → `fmt`）を fixture で実行し、正常系で `check` が 0、壊した入力で非ゼロになることを assert。編集コマンドは不正入力も 0 終了で書き込み、`fmt` はパースエラーのあるファイルを exit 2 で拒否する。だから `check` を `fmt` より先に置き、壊した入力が `check` の段で（診断付きで）落ちることを確かめる。#2084 は「名前は正しいが用途違い」だったので、名前の照合では原理的に捕まらない。実行して初めて捕まる |
| CLI `--help` の Examples | `krs-fences` と同じパーサ検査を help text 内のスニペットにも掛ける（上記の `label:` バグの再発防止）。help 文字列はコード内なので、CLI 側の vitest で各コマンドの help 出力（`addHelpText` の Examples を含む）から `echo '…'` / heredoc の本体を抜いてパースする |

### 論点 4: skill の中身（interview protocol）

reverse の 4 phase pipeline とは形が違う。こちらは会話駆動で、1 往復ごとに `.krs` が少しずつ育つ:

1. **Orient**: Step 0 として、本文に刻まれた版と `karasu --version` を照合する（案 1-D「照合の実行経路」）。既存 `.krs` があれば読む（`karasu check` で現状の診断も取る）。無ければ `system` 1 つから始める。
2. **Interview（層ごと、上から）**: system → user / client / 外部 service → service → domain → usecase → resource / entity → 物理（database / queue / storage、`deploy` と `realizes`）。各層で聞く内容は Chat の `interviewGuideForLevel*` を出発点に書き直す。1 回に聞くのは 1 層だけ。利用者が知らない層は飛ばしてよい（空の domain を捏造しない）。
3. **Write**: 1 回答 = 1 編集。`insert <parent-id>` / `append` / `apply` / `remove` を使い、ファイルを丸ごと書き直さない。
4. **Verify**: 毎編集後に `karasu check` → `karasu fmt`。`fmt` はパースエラーのあるファイルを診断なしで拒否する（exit 2）ので、先に `check` で位置付きの診断を得る。error が出たら次の質問に進む前に直す。
5. **Show**: 節目で `karasu render -o` または `karasu serve` を案内する。

reverse と同じく reference（`syntax.md` / `notation-cookbook.md` / `tags-annotations.md` / `diagnostics.md`）を同梱する。利用者の repo に `docs/` は無いので。コードベースが手元にある場合は「聞く前に読む」（エージェントが自分で確かめられることは利用者に聞かない）を明記する。これが Chat との能力差の本体。

### 論点 5: 新しい CLI と古い skill（CLI の後方互換と capability）

> 2026-09-28 追加（PR #2931 の CodeRabbit 指摘と maintainer の判断による）。

**問題**: skill に刻むのは CLI の版の下限だけで、CLI の方が新しい組み合わせは照合しない。skill が前提にする CLI の挙動を変えたリリースでは changeset の名指しで skill も再公開するが、Claude Code はサードパーティ marketplace の plugin を既定で自動更新しない。再公開しても利用者の手元の skill が古いまま残りうる。

**参考にした先行例（CodeRabbit）**: CodeRabbit の plugin（`coderabbit` 1.1.1、[coderabbitai/skills](https://github.com/coderabbitai/skills)）は skill に CLI の版を刻まない。skill は `coderabbit --version` で CLI の有無だけを見て、個々の機能は `--help` や CLI の `--agent` 出力に含まれる `protocolVersion` で確かめる。新しい CLI と古い skill の組み合わせは skill 側では検査せず、CLI 側が古い呼び方を隠した別名として残す（`-t/--type` を「hidden compatibility syntax」として保持）ことで吸収している。

**方針**: 互換の責任を CLI に持たせる。CLI は次の 2 つを約束する。

1. **後方互換**: skill が使うエージェント向けの面（コマンド名、フラグ、stdout / stderr の形式、終了コード）を壊さない。名前を変える・廃止するものは、隠した別名として動かし続ける。別名を削除してよいのは **次の major のリリースだけ**（0.x の間は 1.0 まで削除しない）で、削除は CHANGELOG で予告する。plugin は自動更新されないので、minor 単位で消すと、更新していない利用者の skill が次の minor で止まる。
2. **廃止情報を skill に返す**: 廃止した呼び方について、代わりに何を使うかを CLI が機械で読める形で返す。返し方は 2 つ:
   - **実行時の通知**: 廃止した別名が呼ばれたら、処理は行ったうえで stderr に固定形式の 1 行を出す（例 `karasu: deprecated: 'lint-style' -> 'check' (since 0.8.0, removal 1.0.0)`）。削除まで済んだ呼び方は、未知のコマンドとして失敗させる代わりに、同じ形式で代わりを示して失敗する。削除した項目は表から消さず、**墓標として恒久的に残す**。
   - **問い合わせ**: `karasu capabilities --json` が、CLI の版、登録済みのコマンドとフラグ、廃止・削除した項目（代わり、廃止した版、削除する版）を返す。

廃止の表は CLI のコード内に 1 か所だけ置き（例 `packages/cli` の deprecation 表）、commander の隠した別名、実行時の通知、`capabilities` の出力をすべてそこから作る。

**古い skill のサポート終了**: 論点 5 の Step 0 を持たない古い skill（E より前に公開されたもの）も、エージェントは CLI の stderr を読むので、廃止通知と削除の墓標は skill の版に関係なく届く。別名が生きている間は古い skill の手順のまま動き、major で別名を消した後も「消えた、代わりは X」という失敗としてエージェントに届くので、黙って壊れることはない。サポート終了は「major で別名を消した時点」と定め、それ以降の古い skill は、墓標の案内に従うか skill を更新することで作業を続ける。

**skill 側（Step 0 の続き）**: 下限の照合（案 1-D）の後、`karasu capabilities --json` を 1 回呼ぶ。skill は自分が使うコマンドを知っているので、その中に廃止・削除された項目があれば、表の代わりを使って進め、利用者には「この skill は古い。更新を勧める」と伝える。`capabilities` が無い CLI は、下限の照合で既に止まっている。実行中に廃止通知の行を見た場合も同じ扱いにする。

**repo 内の guard（論点 3 に追加）**:

- deprecation 表の各項目について、別名がまだ動き、通知の行を出すこと（削除済みなら代わりを示して失敗すること）を CLI の vitest で確かめる。
- `skill-cli-refs` を拡張し、repo 内の skill が廃止済みの呼び方を使っていたら落とす（repo 内の skill は常に最新の呼び方を使う。古い呼び方は利用者の手元の古い skill のためだけにある）。

**却下した案**:

- **下限だけのまま穴を受け入れる**: plugin が自動更新されない以上、CLI の後方非互換な変更がそのまま古い skill を壊す。
- **CLI に「動作を保証する最も古い skill の版」の定数を持たせる**: 判定は正確だが、何が変わったかを skill に伝えられない。廃止情報を返せば、古い skill でも代わりの呼び方で作業を続けられる。
- **skill に CLI の版の上限を刻む**: 0.x では CLI の minor ごとに警告が出る。

## 比較（配布）

| 観点 | 1-A repo のみ | 1-B plugin | 1-C npm 同梱 | 1-D 組み合わせ |
| --- | --- | --- | --- | --- |
| karasu 以外の repo に届くか | 手コピー | Claude Code のみ | どのエージェントでも | どのエージェントでも |
| Claude Code で `/plugin` から入れて更新できるか | できない | できる | できない | できる |
| 利用者の skill ↔ CLI のバージョン一致 | 保証なし | 保証なし | install 時点で一致 + 照合 | `skill install` 経路は 1-C と同じ、plugin 経路は照合のみ |
| drift guard が karasu CI に残るか | 残る | 正本の置き場次第 | 残る | 残る |
| 追加実装 | なし | marketplace 定義 | `skill install` / `skill path` | skills パッケージ + marketplace 定義 + `skill install` / `skill path` |
| 人手の作業 | なし | なし | なし | `karasu-skills` の初回 publish と Trusted Publisher 登録 |

## 現時点の方針

**案 1-D（skills パッケージ + plugin marketplace + `karasu skill install`）、案 2-B（`karasu check`）、論点 3 の guard 拡張 + 実行型 e2e、論点 5 の CLI 後方互換 + 廃止情報の返却を採用する** — Claude Code 利用者が plugin として任意に入れられることと、どのエージェントにも届き公開時にバージョンが揃うこと（1-C の性質）を両立できるのは 1-D だけ。正本が karasu repo にあるので drift の既往（#2084 / #2090）に対する guard も CI に残る。利用者の手元で起きるずれのうち、CLI が古い方は両経路共通の下限の照合で、CLI が新しい方は CLI の後方互換と `karasu capabilities` が返す廃止情報で扱う。`check` は skill の検証指示を 1 語にし、#2084 型の取り違えを起こりにくくする。

skill 名は `karasu-author`（reverse-architecture と対になる動詞名）。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** CLI help の不正スニペット修正 + help スニペットのパース検査 | — | 現行 CLI の bug fix。skill が無くても `--help` を読む人とエージェントに効く |
| **B** `karasu check <file>` | — | 単独で有用な validate-only コマンド。reverse-architecture も乗り換え可能 |
| **C1** skills パッケージ新設 + reverse-architecture の移設（symlink）+ guard の付け替え + `marketplace.json` + バージョン刻印（front matter と本文 Step 0）+ reverse-architecture の SKILL.md への Step 0 追加 + changesets の名指しルール（CLI の挙動変更で `karasu-skills` も名指す）| — | reverse-architecture だけで配布経路を先に通せる。初回 publish の bootstrap と Trusted Publisher 登録（人手）、`/plugin install` が npm source で実際に動くことの確認までを含む |
| **E** CLI の後方互換方針 + deprecation 表 + 廃止通知 + `karasu capabilities --json` + guard（論点 5） | — | skill が無くても、CLI をスクリプトやエージェントから使う人に効く。以後の CLI 変更がこの方針に乗る |
| **C2** `karasu-author` skill 本体 + `karasu skill install` / `skill path` + guard 拡張 + pipeline e2e + Step 0 の capability 確認（reverse-architecture にも追加） | A, B, C1, E | skill が `check` と正しい help を前提にし、置き場が C1 の skills パッケージのため。guard は skill と同じ PR で入れないと、入った瞬間から無防備になる |
| **D** AT 記録（作者以外のセッションを含む） | C2（npm release 後） | 受け入れ条件。外部の人に plugin か `npx karasu skill install` で入れてもらう必要があるので release 後 |

## 未解決の問い

- `skill install` の既定ディレクトリを `.claude/skills/` にするか、エージェント非依存の名前（例: `.agents/skills/`）にするか。現時点では利用者の大半が Claude Code なので `.claude/skills/` を既定にし、`--dir` で逃がす。
- AT の「作者以外の被験者」をどう募るか（karasu-nest 利用者、知人、など）。D の着手時に決める。
