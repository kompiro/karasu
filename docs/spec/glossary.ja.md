# 用語集

> [English](glossary.md) · **日本語**（このファイル）

karasu のコアな語彙のクイックリファレンスです。karasu は
[C4 Model](../concepts.ja.md#c4-model-との違い) に着想を得つつ独自の語彙を持ち、
システムの **論理**・**物理**・**組織** の構造を分離して表現します。

このページは **正典ではなくインデックス** です。各項目は 1 行の定義と、正典と
なるドキュメント（[コアコンセプト](../concepts.ja.md)・[構文](syntax.ja.md)・
[スタイル](style.ja.md)・[タグ・アノテーション](tags-annotations.ja.md)・
[診断](diagnostics.ja.md)）へのリンクを示します。ここの定義と正典が食い違う場合は
正典が優先されます — リンク先を参照してください。

> Related TPLs: [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) — この用語集は他所に正典がある定義の再掲であり、各項目はリンク先の正典と矛盾してはならない。

## コアコンセプト

- **三面構造** — karasu はアーキテクチャを 3 つの独立した面で記述する。論理
  （何を / なぜ）・物理（どのように）・組織（誰が）。別々のファイルに書きつつ
  まとめてナビゲートできる。
  [Concepts](../concepts.ja.md#論理物理組織の三面構造)
- **論理構造** — *何を / なぜ* の面。アクセス経路（誰がどのクライアント経由で
  どのサービスに到達するか）とサービス階層（各サービスが含む業務機能）。
  [Concepts](../concepts.ja.md#論理構造what--why)
- **物理構造** — *どのように* の面。論理サービスを実際に動かすデプロイユニット。
  論理モデルとは別の `.krs` ファイルに書く。
  [Concepts](../concepts.ja.md#物理構造how)
- **組織構造** — *誰が* の面。どのチームがどのサービス / ドメインを所有するかを
  アーキテクチャと並べて明示する。
  [Concepts](../concepts.ja.md#組織構造who)
- **ドリルダウン** — モデルを理解する方法。限定された俯瞰から始め、子を持つ
  ノードへ降りて詳細を見る。
  [Concepts](../concepts.ja.md#ドリルダウン型アーキテクチャ把握)
- **scoped glance** — ドリルダウンの背後にある認知設計の原則。一度にすべてを
  描くのではなく、限定された視野を提示する。
  [Concepts](../concepts.ja.md#一度に見せる範囲を限定しドリルダウンで詳細へ降りるscoped-glance)
- **ghost** — 現在の視点の外にありながら依存に参加するノードの半透明プレース
  ホルダー。視野が狭まっても境界を保つ。
  [Concepts](../concepts.ja.md#ghost--drill-down-で視野が狭まっても境界を失わない)
- **テキストが正典** — 図やバイナリではなく `.krs` テキストが正典のモデル。
  すべての入力経路はテキストに収束する。
  [Concepts](../concepts.ja.md#karasu-はアーキテクチャをテキストで記述する)

## 論理要素の種別

- **system** — 所有サービス・外部サービス・クライアント・到達するユーザーを
  含む境界。 [Concepts](../concepts.ja.md#論理構造what--why)
- **service** — 業務能力の独立した単位。アクセス経路とサービス階層の中間層。
  [Concepts](../concepts.ja.md#論理構造what--why)
- **domain** — サービス内の業務関心の境界。DDD の Bounded Context に近く、
  サービス間依存を論じる粒度。 [Concepts](../concepts.ja.md#論理構造what--why)
- **usecase** — ドメイン内の業務操作 / タスク。リソースへの CRUD 操作を宣言する
  粒度。 [Concepts](../concepts.ja.md#論理構造what--why)
- **resource** — usecase が操作する対象。テーブル・外部 API・ファイルなど。
  [Concepts](../concepts.ja.md#論理構造what--why)
- **user** — システムを駆動するアクター。`[human]` / `[ai]` でタグ付けする。
  [Syntax](syntax.ja.md#user-ノードの例)
- **client** — プロジェクト自身がユーザーの代理として出荷するソフトウェア
  （mobile / web / desktop / cli / device / extension / embed）。サードパーティの
  ブラウザやエージェントとは区別する。
  [Concepts](../concepts.ja.md#実装ではなく構造--テストケースとしての-client-サブ言語)
- **form-factor タグ** — `client` に付く 7 つの認識されるタグ（`[mobile]`・
  `[web]`・`[desktop]`・`[cli]`・`[device]`・`[extension]`・`[embed]`）。
  ユーザーがシステムに到達する面を分類する。
  [Syntax](syntax.ja.md#client-の-form-factor-タグ認識されるもの)
- **infra** — サービスが共有するデータストア。system レベルで宣言する:
  `database`（`table` の集まり）・`queue`（メッセージ）・`storage`（バケット）。
  サービスが infra に依存し、逆はない。
  [Syntax](syntax.ja.md#インフラ層共有データストア-system-図に描画される)

## 関係

- **エッジ** — 論理ノード間の有向の関係。`->` は同期、`-->` は非同期の通信 /
  依存。 [Concepts](../concepts.ja.md#エッジ--関係の表現と集約)
- **explicit / implicit エッジ** — explicit は手で書くエッジ。implicit はドメイン
  レベルのエッジがサービス境界をまたぐときに service レベルで合成される
  （`[implicit]` タグ付き）。
  [Concepts](../concepts.ja.md#explicit-と-implicit--書き手と読み手の非対称性)
- **集約** — 同じサービス対の間の複数のドメインエッジを、system ビュー上で
  同期 / 非同期ごとに 1 本の implicit エッジにまとめること。
  [Concepts](../concepts.ja.md#集約--俯瞰時の情報量を絞る)
- **realizes** — 物理のデプロイユニット（具体）から、それが実装する論理の
  service / domain / client / infra ノード（抽象）へ向かう関係。
  [Concepts](../concepts.ja.md#realizes-による論理と物理の対応付け)
- **owns** — `team` の中で宣言する、チームが service / domain などの論理ノードを
  所有するという関係。
  [Concepts](../concepts.ja.md#owns-による組織と論理物理の対応付け)
- **handles** — `client` / `service` が呼び出し側に公開する domain id を宣言する
  プロパティ。one-hop の expose 規則で検証される。
  [Syntax](syntax.ja.md#handles-プロパティ--client--service-が呼び出し側に公開するもの)
- **delivers** — `service` から、それが出荷する `client` への関係（BFF / SSR
  パターン）。ビルドパイプラインではなく所有と出荷の関係。
  [Syntax](syntax.ja.md#deliversservice--client)

## 物理 / デプロイの語彙

- **デプロイユニット** — 論理ノードを realize する物理の形態。種別:
  `war`・`jar`・`oci`・`lambda`・`function`・`assets`・`job`（単発、または
  `schedule` 付きで定期実行）・`artifact`（その他全般）。
  [Syntax](syntax.ja.md#物理図の記述)
- **store** — マネージドなデータストア（Aurora・SQS・S3 など）を realize する
  専用のデプロイ種別。`type` と `realizes` を持つが `runtime` / `schedule` は
  持たない。 [Syntax](syntax.ja.md#共有-infra-を-realize-するstore-kind)

## 組織の語彙

- **organization** — 組織階層のルート。ネストした team を含む。
  [Syntax](syntax.ja.md#組織図の記述)
- **team** — 責任を持つグループ。service / domain を所有し、member を含み、親 team
  の下にネストできる。 [Syntax](syntax.ja.md#team-ノード)
- **member** — team に属する個人。連絡先プロパティ（`slack`・`github` など）を
  任意で持つ。 [Syntax](syntax.ja.md#member-ノード)
- **role** — user がシステム内で何をするかの短い記述。アクターの類型であり、
  **認可の仕組みではない**（RBAC ではない）。
  [Syntax](syntax.ja.md#user-ノードの例)

## タグとアノテーション

- **タグ** — アーキテクチャ上の位置や役割を表す `[name]` 宣言（例: `[external]`）。
  スタイルが反応する。 [Tags & annotations](tags-annotations.ja.md#タグ)
- **アノテーション** — ライフサイクル / 開発状態を表す `@name` 宣言。上書きされ
  ない限り子ノードに継承される。
  [Tags & annotations](tags-annotations.ja.md#アノテーション)
- **タグとアノテーションの違い** — タグは *ノードが何であるか*（位置 / 役割）、
  アノテーションは *ライフサイクル上のどこにいるか* を表す。
  [Tags & annotations](tags-annotations.ja.md#タグとアノテーションの違い)
- **`[external]`** — システム境界の外にあるノードに付くタグ。破線の枠と
  グレー基調で描画される。 [Tags & annotations](tags-annotations.ja.md#タグ)
- **システム自動付与タグ** — karasu がエッジに自動で付けるタグ: `[implicit]`・
  `[cyclic]`・`[read]` / `[write]`（usecase の CRUD 操作から）。
  [Tags & annotations](tags-annotations.ja.md#エッジへの自動タグ)
- **ライフサイクルアノテーション** — `@deprecated`・`@new`・`@experimental`・
  `@migration_target`。一部はパラメータ（`until`・`from`）を取る。
  [Tags & annotations](tags-annotations.ja.md#アノテーション)
- **アノテーションの継承** — 親のアノテーションは、子が自前のものを持つまで
  子へ流れ、drill-down をまたいでライフサイクルの文脈を保つ。
  [Concepts](../concepts.ja.md#アノテーションの継承--drill-down-で文脈を保つ)
- **capability** — `client` が要求するデバイス / ブラウザの権限（オープンセットの
  識別子）。ストレージである resource とは区別する。
  [Tags & annotations](tags-annotations.ja.md#client-capability)

## CRUD

- **operations** — usecase が resource に対して行う CRUD 動詞
  （`create` / `read` / `update` / `delete`）。
  [Syntax](syntax.ja.md#operations-プロパティ--usecase-が-resource-に対して行う-crud-動作)
- **verb-decoration** — ドメインの動詞を CRUD 意図に対応づける `verb:crud` 記法
  （例: `list:read`・`enqueue:create`）。独自の語彙を保ちつつ CRUD マトリクスに
  反映できる。
  [Syntax](syntax.ja.md#verb-decoration-記法1n-crud-マッピング)
- **CRUD マトリクス** — 宣言された operations から導出される usecase × resource の
  読み書きマトリクス（ビュー、または `karasu matrix` で出力）。
  [Syntax](syntax.ja.md#operations-プロパティ--usecase-が-resource-に対して行う-crud-動作)

## スタイル

- **`.krs.style`** — セレクタを視覚プロパティに対応づけるスタイルシート。CSS の
  ようにモデルにカスケードする。 [Style](style.ja.md#セレクタの種類)
- **セレクタ** — 種別・タグ・アノテーション・id、またはそれらの複合でノードや
  エッジを対象にする CSS 風のパターン。 [Style](style.ja.md#セレクタの種類)
- **詳細度** — 複数のセレクタが同じノードに一致したときどのルールが勝つかを
  決めるスコア（種別 = 1 … id = 100）。
  [Style](style.ja.md#詳細度ルールカスケード)
- **レイアウトヒント** — レイアウトを誘導する escape-hatch プロパティ（`column`・
  `direction`・`label-position`・`label-offset`）。エンジンは強制しない。
  [Style](style.ja.md#レイアウトヒントescape-hatch)
- **凡例（legend）** — 色と意味の対応を宣言するトップレベルブロック。フッター帯
  として描画される。項目は `swatch`（リテラルの hex）か `ref`（スタイルカスケード
  で解決）。 [Syntax](syntax.ja.md#図の凡例legend-ブロック)

## 診断

- **規則（rule）** — 言語が何を許し何を禁じるかの言明（例:「エッジはそれを囲む
  ブロック内から発する」）。 [Diagnostics](diagnostics.ja.md)
- **診断（diagnostic）** — 規則違反を報告する名前付きの仕組み。**診断コード**
  （例: `edge-source-mismatch`）で識別される。
  [Diagnostics](diagnostics.ja.md)
- **診断コード** — 診断の安定した（リネームされない）文字列 id。LSP・アプリ・
  ツールが消費する。 [Diagnostics](diagnostics.ja.md)
- **重大度（severity）** — 診断のレベル: `error`（モデルが不正で構文が拒否される）・
  `warning`（直すべき実害のある欠陥）・`info`（欠陥ではない事実）。
  [Diagnostics](diagnostics.ja.md)
- **warn-don't-error** — 未解決の参照は warning として報告し、source ノードを
  残す。リンク切れがあっても構造的事実が生き残る。
  [Diagnostics](diagnostics.ja.md)
- **ドメイン分散** — 同じ domain id が 1 つの system 内の複数 service に現れること。
  error ではなく `info` として提示される。
  [Concepts](../concepts.ja.md#ドメイン分散の検出)
- **循環依存** — 同期（`->`）エッジが作るサイクル。静的に検出され、`[cyclic]` を
  付与し赤で描画される。非同期エッジは意図的な疎結合として除外される。
  [Concepts](../concepts.ja.md#自動検査--循環依存)

## マルチファイル

- **import** — 別の `.krs` ファイルの内容を取り込むこと。named
  （`import { Foo } from "p.krs"`）・whole-file（`import "p.krs"`）・directory
  （`import "dir/"`）。 [Syntax](syntax.ja.md#マルチファイル-import-の意味論)
- **system 再オープン** — 同じ `system` id が複数ファイルに現れると、重複ではなく
  1 つのブロックに merge される（衝突時はルートに近いファイルのプロパティが勝つ）。
  [Syntax](syntax.ja.md#s3-同名-system-ブロックの-mergesystem-再オープン)

## プロジェクト運営の語彙

これらはモデリング言語ではなく、karasu **プロジェクトの運営** に関する用語です。
コントリビュート時に役立ちます。出典はサイトではなくリポジトリにあります。

- **Design Doc（設計ドキュメント）** — 「どう作るか」の詳細設計（制約・代替案・
  実装方針）。決定が下りるまで `docs/design/` に置く。決定後は ADR に昇格させ、
  Design Doc は削除する。 [process.md](../process.md)
- **ADR（Architecture Decision Record）** — *確定した* 設計判断（採用・見送り）の
  簡潔な記録、すなわち「なぜそうしたか」。`docs/adr/` に置く。
  [docs/adr/](../adr/)
- **TPL（Test Perspective Library / テスト観点ライブラリ）** — 再発しうる失敗
  パターンを検証可能な観点として構造化した記録。`docs/test-perspectives/` に置く。
  各観点は **proactive（原則・非目標から事前に予測）** か
  **retrospective（過去の bug から事後に一般化）**。ADR が *過去の判断* を残すのに
  対し、TPL は *未来の検証* を促す。
  [docs/test-perspectives/](../test-perspectives/README.md)
- **受け入れテスト（AT）** — 変更の受け入れ基準の記録。`docs/acceptance/` に置き、
  どの基準が自動化済みか / 手動確認かを示す。 [process.md](../process.md)
- **ロードマップ** — karasu の全体方針と Syntax v1.0 readiness を記す living
  ドキュメント。`docs/roadmap.md` に置く。 [roadmap.md](../roadmap.md)

## 関連項目

- [コアコンセプト](../concepts.ja.md) — 語彙の背後にある面と原則。
- [構文リファレンス](syntax.ja.md) · [スタイルリファレンス](style.ja.md) ·
  [タグ・アノテーション](tags-annotations.ja.md) · [診断](diagnostics.ja.md) —
  正典となる仕様。
