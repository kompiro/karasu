# karasu CLI authoring skill（AI authoring の primary path）

- **日付**: 2026-09-26
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2901](https://github.com/kompiro/karasu/issues/2901)（#638 を置き換え）
  - 方針の出典: [keystone PRD 追記 2026-09-26](../prd/keystone-primary-path.md#追記-2026-09-26-ai-authoring-の経路)
  - 関連 ADR: [ADR-1895](../adr/1895-reverse-architecture-harness.md)（reverse-architecture harness）/ [ADR-1084](../adr/1084-skills-plugin-portability.md)（portable skill は hane plugin へ）/ [ADR-420](../adr/420-chat-ui-phase3-structured-interview.md)（Chat のレベル別インタビュー）
  - 関連 TPL: [TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md)（skill ↔ CLI コマンド名 drift）
  - 先行 Issue: [#2574](https://github.com/kompiro/karasu/issues/2574)（reference bundle）/ [#2093](https://github.com/kompiro/karasu/issues/2093)（skill-cli-refs guard）/ [#2084](https://github.com/kompiro/karasu/issues/2084)（`lint-style` を検証に使った事故）
  - コード: `packages/cli/src/index.ts`, `.claude/skills/reverse-architecture/`, `scripts/lint/skill-cli-refs.ts`, `scripts/lint/skill-reference-bundle-sync.ts`, `scripts/lint/krs-fences.ts`

## 背景・課題

AI authoring の primary path は「利用者自身のエージェントセッション + karasu CLI skill」に決まった（keystone PRD 追記）。app 内 Chat は凍結する。残っているのは、その skill を実際に作ることと、次の 2 つの未決事項:

1. **配布**: 利用者の repo にどう届けるか。reverse-architecture は karasu repo の `.claude/skills/` に置かれていて、karasu 以外の repo で使うには手でコピーするしかない。#2574 は「コピーした先でも動く」（reference の同梱）を解いたが、「どうやって届くか」は解いていない。
2. **drift guard**: skill と CLI のずれは過去に 2 回、CI に見えない形で出荷された（#2084 / #2090）。新 skill にも同じ guard が要る。

加えて、この設計の調査中に **CLI 自身の `--help` が不正な構文を教えている** ことが分かった。`append` / `apply` / `insert` の Examples は `service NewService { label: "New Service" }` と書くが、パーサは `label: "…"` を受け付けない（`Expected string literal after "label"`）。authoring skill は CLI を駆動するエージェントに `--help` を読ませる経路そのものなので、これは skill の前提を壊す。

reverse-architecture との役割分担は PRD の通り: reverse は「知らないシステムを**読む**」、本 skill は「自分のシステムを**残す**」。reverse の再配布ではない。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 編集コマンド | `append`（stdin → ファイル末尾に top-level block）/ `insert <parent-id>`（stdin → 指定ノードの最後の子）/ `apply`（同 ID があれば置換、無ければ追記）/ `remove <node-id>` / `fmt` |
| 検証 | 専用コマンドなし。`render` が error-severity の診断で非ゼロ終了するので、reverse-architecture は `render` を validator として使っている。出力（SVG）は捨てる前提 |
| 表示 | `render -o <file>.svg`、`serve`（ブラウザで live preview） |
| 既存 skill | `.claude/skills/reverse-architecture/`（SKILL.md 892 行 + `reference/` に `syntax.md` / `notation-cookbook.md` / `tags-annotations.md` / `diagnostics.md` の byte-identical コピー） |
| drift guard | `skill-cli-refs`（`.claude/skills/**` の `karasu <cmd>` がすべて登録済みコマンドか）/ `skill-reference-bundle-sync`（reverse の `reference/` が docs と一致するか。対象ディレクトリは reverse 固定）/ `krs-fences`（docs 内の ```krs フェンスをパース。`.claude/skills/` は対象外） |
| npm package | `karasu`（`packages/cli`）。`files` は `dist/index.js` と `THIRD_PARTY_NOTICES.md` のみ |
| Chat の資産 | `packages/app/src/hooks/useChatSession/prompt.ts` のレベル別インタビューガイド（system → service → domain → usecase で「次に何を聞くか」）。凍結するが、中身は skill の interview protocol に移植できる |

## 制約・前提

- **エージェント非依存に寄せる**。Issue の言い方は「Claude Code or similar」。SKILL.md 形式（front matter + 本文）は Claude Code 以外のエージェントも読めるが、配布機構まで Claude Code 専用にすると「similar」を切り捨てる。
- **skill は利用者が手元に持っている CLI のバージョンと一致しているべき**。skill が新しい CLI 機能を前提にし、利用者の CLI が古い（またはその逆）と、エージェントは存在しないコマンドや構文を試す。drift は「repo 内の skill ↔ repo 内の CLI」だけでなく「利用者の skill ↔ 利用者の CLI」でも起きる。
- **`.krs` が唯一の状態**。reverse と同じく、エージェントは会話履歴ではなく毎回 `.krs` を読み直す。
- Chat panel には手を入れない（凍結）。
- out of scope: reverse-architecture の配布方法の変更（同じ仕組みに乗せられるが別 Issue）、Chat の削除。

## 検討した選択肢

### 論点 1: 配布

#### 案 1-A: karasu repo の `.claude/skills/` に置くだけ（reverse と同じ）

**メリット**: 追加実装ゼロ。既存 guard がそのまま効く。

**デメリット**: 利用者の repo に届く手段がない（手コピー）。コピーした瞬間に CLI とのバージョン対応が切れる。Issue の受け入れ条件「karasu 以外の repo で動く」を、手順書で満たすだけになる。

#### 案 1-B: Claude Code plugin marketplace（karasu repo に `.claude-plugin/marketplace.json`、または hane / `kompiro/claude-skills`）

**メリット**: Claude Code 利用者は `/plugin` でインストールでき、更新も plugin 機構で届く。

**デメリット**: Claude Code 専用。plugin のバージョンは CLI のバージョンと独立に進むので、「利用者の skill ↔ 利用者の CLI」の drift を構造的に防げない。hane に入れる案は ADR-1084 の線引き（hane は karasu 非依存の汎用ワークフロー）に反する。

#### 案 1-C: npm package に同梱し、CLI から取り出す（推奨）

<!-- absent-path-next-line: the directory this design proposes to create (#2901 slice C) -->
skill の正本を `packages/cli/skills/karasu-author/` に置き、`files` に含めて npm tarball に同梱する。CLI に取り出しコマンドを 1 つ足す:

```
karasu skill install [--dir <path>]   # 既定: ./.claude/skills/karasu-author/
karasu skill path                     # 同梱 skill の絶対パスを表示（他エージェント向け）
```

**メリット**: skill のバージョン = CLI のバージョン。`npx karasu@<ver> skill install` すれば、その CLI で確実に動く skill が入る。エージェント非依存（ファイルを置くだけ。`--dir` で任意の場所へ）。repo 内では正本が CLI と同じ package にあるので、CLI を変える PR と skill を変える PR が同じ `packages/cli/**` の変更として見える。

**デメリット**: CLI にコマンドが 1 つ増える。skill の文言修正だけでも CLI の release が要る（release は changesets で既に日常化しているので許容）。

案 1-C を採っても、Claude Code 向け plugin（1-B）は後から「同じ正本を指す marketplace entry」として足せる。逆向き（1-B を正本にして npm に載せる）は version lock を失う。

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
| `skill-cli-refs` | 走査対象に `packages/cli/skills/**` を追加 |
| `skill-reference-bundle-sync` | bundle を「reverse 固定」から「(bundle dir, 収録 docs) の表」に一般化し、`karasu-author/reference/` を登録 |
| `krs-fences` | 走査 root に `.claude/skills/` と skill の正本ディレクトリ（案 1-C）を追加（skill 本文の ```krs 例がパースできること） |
| **新設: skill pipeline e2e**（`packages/cli` の vitest） | skill が規定する編集ループ（`append` → `insert` → `fmt` → `check`）を fixture で実行し、正常系で `check` が 0、壊した入力で非ゼロになることを assert。#2084 は「名前は正しいが用途違い」だったので、名前の照合では原理的に捕まらない。実行して初めて捕まる |
| CLI `--help` の Examples | `krs-fences` と同じパーサ検査を help text 内のスニペットにも掛ける（上記の `label:` バグの再発防止）。help 文字列はコード内なので、CLI 側の vitest で各コマンドの help 出力（`addHelpText` の Examples を含む）から `echo '…'` / heredoc の本体を抜いてパースする |

### 論点 4: skill の中身（interview protocol）

reverse の 4 phase pipeline とは形が違う。こちらは会話駆動で、1 往復ごとに `.krs` が少しずつ育つ:

1. **Orient**: 既存 `.krs` があれば読む（`karasu check` で現状の診断も取る）。無ければ `system` 1 つから始める。
2. **Interview（層ごと、上から）**: system → user / client / 外部 service → service → domain → usecase → resource / entity → 物理（database / queue / storage、`deploy` と `realizes`）。各層で聞く内容は Chat の `interviewGuideForLevel*` を出発点に書き直す。1 回に聞くのは 1 層だけ。利用者が知らない層は飛ばしてよい（空の domain を捏造しない）。
3. **Write**: 1 回答 = 1 編集。`insert <parent-id>` / `append` / `apply` / `remove` を使い、ファイルを丸ごと書き直さない。
4. **Verify**: 毎編集後に `karasu fmt` → `karasu check`。error が出たら次の質問に進む前に直す。
5. **Show**: 節目で `karasu render -o` または `karasu serve` を案内する。

reverse と同じく reference（`syntax.md` / `notation-cookbook.md` / `tags-annotations.md` / `diagnostics.md`）を同梱する。利用者の repo に `docs/` は無いので。コードベースが手元にある場合は「聞く前に読む」（エージェントが自分で確かめられることは利用者に聞かない）を明記する。これが Chat との能力差の本体。

## 比較（配布）

| 観点 | 1-A repo のみ | 1-B plugin | 1-C npm 同梱 |
| --- | --- | --- | --- |
| karasu 以外の repo に届くか | 手コピー | Claude Code のみ | どのエージェントでも |
| 利用者の skill ↔ CLI のバージョン一致 | 保証なし | 保証なし | 構造的に一致 |
| 追加実装 | なし | marketplace 定義 | `skill install` / `skill path` |
| 後から他の方式を足せるか | — | 1-C を足すと正本が 2 つ | 1-B を「同じ正本を指す entry」として足せる |

## 現時点の方針

**案 1-C（npm 同梱 + `karasu skill install`）、案 2-B（`karasu check`）、論点 3 の guard 拡張 + 実行型 e2e を採用する** — 「利用者の skill と利用者の CLI が同じバージョンである」ことを配布の仕組みで保証できるのは 1-C だけで、drift の既往（#2084 / #2090）を踏まえるとこれが最重要の性質。`check` は skill の検証指示を 1 語にし、#2084 型の取り違えを起こりにくくする。

skill 名は `karasu-author`（reverse-architecture と対になる動詞名）。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** CLI help の不正スニペット修正 + help スニペットのパース検査 | — | 現行 CLI の bug fix。skill が無くても `--help` を読む人とエージェントに効く |
| **B** `karasu check <file>` | — | 単独で有用な validate-only コマンド。reverse-architecture も乗り換え可能 |
| **C** `karasu-author` skill 本体 + `skill install` / `skill path` + guard 拡張 + pipeline e2e | A, B | skill が `check` と正しい help を前提にするため A・B の後。guard は skill と同じ PR で入れないと、入った瞬間から無防備になる |
| **D** AT 記録（作者以外のセッションを含む） | C（npm release 後） | 受け入れ条件。外部の人に `npx karasu skill install` してもらう必要があるので release 後 |

## 未解決の問い

- `skill install` の既定ディレクトリを `.claude/skills/` にするか、エージェント非依存の名前（例: `.agents/skills/`）にするか。現時点では利用者の大半が Claude Code なので `.claude/skills/` を既定にし、`--dir` で逃がす。
- reverse-architecture も同じ仕組み（`karasu skill install reverse-architecture`）に載せるか。載せれば reverse の手コピー問題も消えるが、本 Issue の範囲外として別 Issue にする。
- AT の「作者以外の被験者」をどう募るか（karasu-nest 利用者、知人、など）。D の着手時に決める。
