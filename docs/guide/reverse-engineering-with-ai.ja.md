# AI エージェントで既存リポジトリを karasu にリバースする

> [English](reverse-engineering-with-ai.md) · **日本語**（このファイル）

見慣れないシステムを理解するために、`.krs` をゼロから書く必要はありません。
`reverse-architecture` skill を使うと、コーディングエージェントがリポジトリを読んで
karasu モデルを作ります。判断に任せるべきでない抽出と検証は karasu CLI が担います。

システムをモデル化する理由は 2 つあり、skill もそれぞれに分かれています:

| やりたいこと | 使う skill |
| --- | --- |
| 知らないシステムを**読む**: 転職先、OSS、引き継いだコードベース | `reverse-architecture`（このガイド） |
| 自分が関わるシステムを**記録する**: コードに現れない判断も含めて | `karasu-author`（1 層ずつインタビューする） |

リバースは利用者自身のエージェントセッションで動きます。karasu がソースを読んだり、
代わりにモデルを呼んだりすることはないので、コードの送り先はエージェントがふだん
送っている先だけです。

リポジトリを読んでコマンドを実行できるエージェントがない場合は、
[単発プロンプト](#コーディングエージェントがない場合-単発プロンプト)を使ってください。
得られるのはより粗い概要です。

## インストール

skill は karasu CLI を使うので、両方を入れます。

```bash
npm i -g karasu
```

Claude Code では plugin を入れます。`/plugin` メニューから更新できます:

```text
/plugin marketplace add kompiro/karasu
/plugin install karasu@karasu
```

ほかのエージェントでは、エージェントが skill を読むディレクトリにコピーします:

```bash
npx karasu skill install reverse-architecture --dir .agents/skills
```

skill は構文リファレンス、[記法クックブック](notation-cookbook.ja.md)、タグ・アノテーション
リファレンス、診断リファレンスの写しを同梱しているので、どのリポジトリでも動きます。
最初に CLI の版を skill が想定する版と比べ、CLI のほうが古ければ更新を求めます。
インストールのオプションは [`karasu skill`](../tools/cli.ja.md#karasu-skill-agent-skill-を入れる)
を参照してください。

## 実行する

リポジトリでエージェントを開き、自分の言葉で頼みます:

```text
このリポジトリを karasu モデルにリバースして
```

skill の Phase 2 は domain ごとに subagent を起動するので、subagent を起動できる
エージェントが必要です。大きなリポジトリでは、起動の前にエージェントが domain の数を
確認してきます。この数でコストが決まるので、ここで確かめてください
（[コストと時間](#コストと時間)）。

## skill がすること

単一のエージェントはシステムのトップレベルをうまく復元しますが、domain の内側に入る
ころには注意が尽きます。skill は domain ごとに subagent を割り当て、判断はエージェントに、
機械的な作業は CLI に分担させます。

| フェーズ | 内容 | 担当 |
| --- | --- | --- |
| 1. Scout | `karasu translate` で物理層を抽出し、bounded context を見つけて id を決める | エージェントと CLI |
| 2. Deep-dive | domain ごとの subagent が自分の domain のソースだけを読み、usecase・entity・resource を書く | subagent（約 5 件ずつ実行） |
| 3. Synthesis | 断片をマージし、domain をまたぐ関連、domain エッジ、チームの所有、観測されたグルーピングを足す | エージェント |
| 4. Validate & repair | `karasu coverage` で深さを測り、`karasu render` で描画し、薄い domain を `karasu subtree` で掘り直す | CLI が検出し、エージェントが直す |

結果を左右するルールが 3 つあります:

- **物理層は抽出する。発明しない。** `karasu translate` は Docker Compose、Kubernetes、
  OpenAPI、SQL DDL、`wrangler.toml` を読みます。エージェントがインフラを手で書くのは、
  adapter のないマニフェストのときだけです。
- **domain は bounded context で分ける。** `Loan`・`Hold`・`Checkout` は 3 つではなく
  1 つの `Lending` domain になります。ディレクトリはヒントにすぎず、チームの所有で
  分割を決めることもありません。
- **推測した箇所をモデル自身が示す。** 境界を決めきれないノードには `@draft` を付け、
  その domain の subagent がソースの証拠をもとに決着を試みます。

## 得られるもの

- **`index.krs`**: 以下すべての真実源です。手で編集できるプレーンテキストで、書いた
  エージェントには依存しません。
- **論理層**: `system` / `service` / `domain`、各 domain の中の `usecase`・`entity`・
  `resource`、domain 間のエッジ。
- **物理層**: `deploy` ユニットと、それが使う `database` / `queue` / `storage` ブロック。
- **domain の分割を変えないオーバーレイ**: `CODEOWNERS` 由来の `organization` と `team`、
  リポジトリに実在するグルーピングの `boundary`、「個人データを持つ」のように
  アーキテクチャの外で定義された集合の `facet`。
- **`@draft`**: 誰も確認していない境界の印。
- **実行の記録**: カバレッジ報告、`@draft` のまま残った境界、決着した境界とその証拠、
  記法のギャップ、実行で確かめられなかったこと。

エージェントが記録をチャットで要約するだけなら、ファイルに書くよう頼んでください。
レビューへの最短の入口になります。

## コストと時間

いちばん高くつくのは fan-out で、domain の数と各 domain のソース量に比例します。
次の数字は skill の開発時に計測したもので、出力トークンだけを数えています:

| リポジトリ | domain 数 | 出力トークン | 時間 |
| --- | --- | --- | --- |
| 85 ファイル | 3 | 約 318k | 約 12 分 |
| 約 7,800 ファイル | 19 | domain あたり約 110〜145k | 未計測 |

従量課金のプランでは特に、始める前に見積もってください。実行中に利用上限に達すると、
その時点で動いている subagent は止まります。終わったバッチの結果は残るので、
残りの domain から再開できます。

## 結果をレビューする

きれいに描画できても、モデルが正しいとは限りません。正解として扱うことが、いちばん
ありがちな誤用です。コードと突き合わせて確かめる地図として、次の順に見てください:

1. **まず `@draft` と決着した境界を読む。** 判断が入っているのはそこです。境界を確認
   したら `@draft` を消します。この削除がレビューそのものです。`@draft` がひとつも
   ないモデルは強い主張をしているので、疑う価値があります。
2. **各 service の drill-down を開く。** entity 層は充実しているのに domain 間に
   エッジがないなら、たいていは domain が独立しているのではなく synthesis の手順が
   抜けています。エージェントに理由を聞いてください。
3. **自分でも測る。**

   ```bash
   karasu check index.krs     # モデルが有効か
   karasu coverage index.krs  # 各 domain の深さと、マージで失われたもの
   ```

   `coverage` は薄い domain を他の domain との比較で判定するので、本当にテーブルを
   1 つしか持たない domain は、正しくても薄いと出ることがあります。その場合は記録に
   理由が書かれているはずです。

これらのコマンドでは見えない欠落もあります。`coverage` はオーバーレイを測らず、
domain エッジも数えません。また、存在しない entity を `Domain.Entity` で指す関連は、
診断なしで entity ビューから落ちます。skill はこの関連を検出する小さなスクリプトを
エージェントに書かせるので、実行されたか確かめてください。

あとでシステムが変わったときや、コードに現れない判断を残したいときは、このモデルから
`karasu-author` で続けられます。

## 結果を見る・共有する

アカウントもアップロードも不要で、手元で drill-down 付きのプレビューができます:

```bash
karasu serve .
```

人に渡すには、`karasu render index.krs -o architecture.svg` で全ビューを 1 つの SVG に
書き出すか、アプリの **Share** ボタンでモデル全体を URL に載せたリンクをコピーします。

ホストされたリンクには符号化後 8,000 文字（フラットな `.krs` で約 15 KB）の上限があり、
domain が複数あるリバースの結果は超える可能性が高いです。超えると Share リンクは開けますが、
貼り付けてもプレビューカードが出ません。下の 2 つの形にも影響します。

- **公開リポジトリの URL。** モデルをリポジトリのルートに `index.krs` か `karasu.krs` で
  コミットすると、`https://karasu.kompiro.dev/<owner>/<repo>` で開けます。上限を超えると、
  サイズと対処を示すエラーを返します。private リポジトリには対応していません。リンクを
  コミットに固定する方法は [ADR permalink](adr-permalinks.ja.md) を参照してください。
- **画像。** `https://karasu.kompiro.dev/render?s=<payload>&view=system` は SVG を返します。
  `<payload>` は Share URL のエンコード済みの値です。ほかのビューは `view=deploy` か
  `view=org`、PNG には `&format=png`（例: `&format=png&width=1200`）を足します。上限を
  超えると、URL が長すぎて受け付けられないことがあります。

## コーディングエージェントがない場合: 単発プロンプト

どの LLM チャットでも、文法とプロジェクトの主要ファイルを渡せば粗い概要を得られます。
リポジトリを読めるエージェントより見える範囲がずっと狭く、結果を確かめる CLI もないので、
品質にはむらがあります。この方法でいくつかの OSS（Dify / Kubernetes / n8n）を
リバースした経験では:

| ビュー | 品質 | 用途 |
| --- | --- | --- |
| `system` トップレベル（サービス・インフラ） | **強い** | 「構成要素は何で、どう通信するか」 |
| `deploy`（`docker-compose` / マニフェスト由来） | **強い** | 「何がどこで動き、どのコンテナが何を実体化するか」 |
| `system` の深い `domain` 分解 | 弱い | 良くて出発点。手で検証が必要 |
| `org`（チーム） | ガバナンスが明示的（k8s 等）でない限り弱い | コードだけからは割に合わないことが多い |

**強い**ビューへ誘導してください。

### Step 1: モデルに構文を渡す

[構文リファレンス](../spec/syntax.ja.md)を Claude Project や Custom GPT の知識に追加するか、
チャットに貼り付けます。[記法クックブック](notation-cookbook.ja.md)も一緒に渡してください。
KV ストア、共有データストア、外部依存などの worked idiom があれば、モデルが独自の形を
発明しなくなります。

### Step 2: モデルにプロジェクトを渡す

リポジトリ全体は通常不要です。構造が分かるものを渡します:

- `README`、トップレベルのディレクトリ構成、サービス名やパッケージ名
- `docker-compose.yml`、Kubernetes マニフェスト、`Procfile`（`deploy` ビュー用）
- API のエントリポイントと主要データストア

### Step 3: プロンプト

```text
あなたはアーキテクチャアナリストです。渡した karasu .krs 構文を使って、
プロジェクト <NAME> の自己完結した .krs ファイルを1つ作成してください。

スコープ:
- トップレベルの service / client / user と共有インフラ（database / queue /
  storage）、およびそれらの間のエッジを含む `system` ブロック。
- docker-compose / マニフェストから導いた `deploy` ブロック。コンテナ/イメージ
  ごとに1ユニットとし、`realizes` で system ノードに紐付ける。

ルール:
- ノード ID は短い英語の識別子にし、表示テキストは `label` に入れる。
- 深い `domain` ネストより、トップレベルの広さを優先する。grouping がコードから
  明白なときだけ `domain` を足す。
- コードから読み取れるものだけをモデル化する。
- 1ファイルに収める（`import` を使わない）。.krs のみを出力し、説明文は不要。
```

出力を [Web アプリ](https://karasu.kompiro.dev/)に貼り付けて確認し、明らかな誤りは
プロンプトで直すか、`.krs` を直接編集します。

## 関連

- [`reverse-architecture` の SKILL.md](../../packages/skills/skills/reverse-architecture/SKILL.md): エージェントが従う指示の全文
- [オンボーディングガイド](02-onboarding.ja.md): `translate` を使い、既存システムを手で図に読み下す
- [CLI の使い方](../tools/cli.ja.md): skill が実行するコマンド
- [タグ・アノテーション](../spec/tags-annotations.ja.md): `@draft`、`facet`、`boundary`
- [構文リファレンス](../spec/syntax.ja.md): `.krs` の文法
