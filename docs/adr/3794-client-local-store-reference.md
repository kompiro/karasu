---
id: ADR-3794
title: usecase から client の local storage を参照する
status: accepted
date: 2026-11-18
topic: core-concepts
related_to:
  - ADR-823
  - ADR-316
  - ADR-2165
  - ADR-1046
  - ADR-1062
  - ADR-1870
  - ADR-1895
  - ADR-1820
  - ADR-2124
  - ADR-3752
scope:
  packages: [core, app, cli, lsp]
assumptions:
  - "symbol: packages/core/src/spec/infra-index.ts :: indexPhysicalTargets"
  - "symbol: packages/core/src/spec/infra-index.ts :: resolvePhysicalRef"
  - "symbol: packages/core/src/spec/infra-index.ts :: clientStorageLabel"
  - "symbol: packages/core/src/parser/physical-ref-validation.ts :: validatePhysicalRefs"
  - "symbol: packages/core/src/resolver/resource-entity.ts :: buildEntityResolver"
  - "symbol: packages/core/src/view/coverage-extract.ts :: ClientStoreCoverage"
  - "symbol: packages/core/src/view/deploy-view-extract.ts :: extractModelDeployView"
  - "symbol: packages/core/src/renderer/layout-measure.ts :: drawnLabel"
  - "symbol: packages/lsp/src/definition-imports.ts :: resolveDefinition"
  - "file: docs/acceptance/3794-client-storage-reference.md"
---

# ADR-3794: usecase から client の local storage を参照する

- **日付**: 2026-11-18
- **ステータス**: 決定済み・実装完了（experimental）
- **関連**:
  - Issue: [#3794](https://github.com/kompiro/karasu/issues/3794)
  - PR: [#3843](https://github.com/kompiro/karasu/pull/3843)（Design Doc）, [#3869](https://github.com/kompiro/karasu/pull/3869)（実装）
  - 関連 ADR: [ADR-823](./823-client-mcp-modeling.md)（`client` と `resource <storageKind> "<name>"` の導入）, [ADR-316](./316-database-as-first-class-node.md)（infra を system 直下に限る）, [ADR-2165](./2165-logical-containment-rules.md)（`client` は子ノードを持たない）, [ADR-1046](./1046-resource-crud-operations.md)（`operations`）, [ADR-1062](./1062-crud-matrix-view.md)（CRUD matrix）, [ADR-1870](./1870-domain-entity-modeling.md)（entity による leaf の所有）, [ADR-1895](./1895-reverse-architecture-harness.md)（coverage）, [ADR-1820](./1820-notation-promotion-gate.md)（experimental の昇格の前提条件）, [ADR-2124](./2124-version-vocabulary.md)（言語版の bump 規則）, [ADR-3752](./3752-optional-string-stops-at-next-edge.md)（後の行のエッジで止まる読み手）
  - 関連 TPL: [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md), [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md), [TPL-1625](../test-perspectives/TPL-1625-client-vocabulary-structure-not-implementation.md), [TPL-3752](../test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md), [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md), [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md), [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md), [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)
  - AT: [3794-client-storage-reference](../acceptance/3794-client-storage-reference.md)

## 背景

`client` が宣言する storage（`resource opfs "…"`、`resource localStorage "…"` など）を、`usecase` の `resource` が指す先として解決する仕組みが無かった。usecase の dot 記法 `resource <Parent>.<Child>` が解決するのは infra の leaf だけで、client の storage は id を持たない文字列の名前だった。

`resource WebApp.ApiKey` と書くこと自体はできた。parse でき、domain view に昇格し、CRUD matrix の column になり、coverage の `resourceRefs` にも数えられた。症状は KRS048（`unresolved-resource-ref`）が「WebApp を宣言する database / queue / storage ブロックが無い」と警告することと、宣言した storage と何も結びつかないこと（綴りを検査できない、storage の名前と kind を描けない）だった。`[external]` で warning を消すと「system の外にある」という逆の意味になる。正しく書く方法がないので、書き手は usecase に `resource` 行を書かなかった。

karasu 自身を reverse-architecture スキルでモデル化したとき（2026-11-14）、6 つの domain の報告がこの穴に触れた。その run で最も多く報告された記法の穴だった。`karasu coverage` は深くモデル化した domain も thin と採点し（AssistantChat は usecase 12 本で 0.16）、CRUD matrix には API キーの保存や project の保存の column が出なかった。

足りないのは記法ではなく解決先だった。もう 1 つ、「参照先が infra かどうか」の判定が、検証（`indexDeclaredInfra`）と読む側（`buildEntityResolver` と各所の infra id の集合）に分かれていた。client を解決先に足すときに判定を各所に書き足すと、分岐が増える（TPL-1720）。

## 決定

client の storage の行に省略できる id を与え（`resource <storageKind> [<Id>] "<name>"`）、usecase の `resource <ClientId>.<Id>` をその storage に解決する。解決は、infra の leaf と client の storage を合わせた model 全体の 1 つの index（`indexPhysicalTargets`）と 1 つの関数（`resolvePhysicalRef`）で決め、検証・label・派生エッジ・CRUD matrix・coverage・node metadata・LSP はその結果だけを読む。記法は experimental で、言語版は 2.0 のまま。

### 細部の決定

- **構文**: id は storage kind と名前のあいだに置き、省略できる。id の無い行は今までと同じ意味で、参照できない。名前は省略できない。名前は TPL-3752 の共有の読み手で読み、後の行の名前は名前として読むが、その行がエッジを始めるなら名前にせず、名前が無い error（`expected-string-after`）を出す（ADR-3752 と同じ規則）。id の位置のキーワードは `expected-identifier`。formatter は id を round-trip する
- **引用符付きの id**（kompiro が #3869 で決定）: 素の語で書けない id は引用符で書ける（`resource localStorage "api-key" "…"`）。名前が同じ行に続くときだけ id として読み、1 つの文字列は今までどおり名前として読む。dot 記法の参照はすでに引用符付きの子を受け付けており、formatter が任意の id を書き戻せるようにするため（TPL-2707）。Design Doc は id を素の語に限っていた
- **client の storage の形として読む条件**: client の中の `resource` で、次の token が 6 つの storage kind のどれかであるとき、または名前の文字列が直後か、kind と同じ行の id（またはキーワード）の後に続くとき。綴りを間違えた kind に id が続く行（`resource cookie Session "s"`）も、通常の resource（KRS010）ではなく `client-resource-invalid-kind` として報告する（kompiro が #3869 で決定）
- **解決**: index は全 root（トップレベルの client、どの system の中の client も、import した木も）から作る。`buildEntityResolver` は呼び出し元ごとに違う root で作られるので、client の storage を自分の root から探さず、この index を受け取る。warning の検出器と deploy view も model 全体の index を渡す（deploy view は `extractModelDeployView`）。`deriveInfraEdges` は resolver を必須の引数にし、呼び出し元が自分の children から作らないようにした
- **infra ブロックと client が同じ id**（scope が違う場合）: 参照は今までどおり infra ブロックを指す。その client が id 付きの storage を宣言していれば `resource-target-ambiguous`（KRS115、`infra-and-client`）で衝突を示し、その storage は参照できない
- **同じ id の client ノード**（KRS018 / KRS030）は merge しない。子の id を宣言するものが 2 つ以上あれば解決しない（`resource-target-ambiguous`、`multiple-clients`）。同じ宣言を複数の import の経路で拾ったものは 1 つに数える
- **1 つの client の中の id の重複**: `client-resource-duplicate-id`（KRS116、resolver の warning、LSP の単一ドキュメント文脈では `LOCAL`）。最初のものが解決先になる
- **未解決**: 子が無ければ `unresolved-resource-ref` を `missing: "leaf"`・`parentKind: "client"` で出す。entity の `table WebApp.X` は client の storage に解決しない
- **派生エッジ**: client の storage への参照から `service → client` のエッジは導出しない。配信する service は `delivers` が描く
- **描画**: 昇格した resource の label は `<name> (<storageKind>)`。shape tag は推論しない。カードの幅は、id ではなく描く label で測る（kompiro が #3869 で決定。長い label がカードからはみ出していた。label が id より長い infra の leaf のカードも広くなる）
- **CRUD matrix**: id のある storage ごとに column を持ち、`clientId` と `storageKind` を付ける。column の key は `<ClientId>.<Id>`（infra の leaf と同じ形）。infra の種類で絞るフィルタは今までどおり client の column を落とす
- **coverage**: 最上位に `clientStores` を足す（`physical` の中には入れない）。client ごとに、id のある storage、参照された storage、参照されていない storage、id の無い storage を出す。infra の有無と独立に出す
- **app**: detail panel は client の storage ごとに id と、それを参照する usecase を出す。昇格した resource は、どの client のどの storage かを出す。CRUD matrix panel と view の fingerprint は model 全体の index を読む（TPL-1032）
- **LSP**: storage の id を補完と定義へのジャンプの対象に足す。`<Parent>.<Child>` の子にカーソルがあれば、モデルと同じ規則でその client の storage か infra ブロックの leaf に飛ぶ（同じファイルでも import 先でも）。トップレベルの node も walk し、同じ名前なら node が storage の id より先に見つかる。カーソル同期とプレビューのクリックは storage の id を返さない（kompiro が #3869 で決定・依頼）
- **usecase と client の関係は検査しない**（kompiro が #3843 で決定。Q1）。純粋な SPA は `delivers` する service を持たないので、`delivers` / `handles` を前提にすると正しいモデルを警告してしまう
- **experimental**（kompiro が #3843 で決定。Q4）: `docs/roadmap.md` の watch 対象の experimental notation に登録し、ADR-1820 の前提条件で昇格を判断する。昇格するときは後方互換な追加として v2.1 に載せる（ADR-2124）
- **版**: `@karasu-tools/core` と `karasu` は minor、`karasu-vscode` は LSP の補完と定義へのジャンプが変わるので minor で名指しした（kompiro が #3869 で決定）、`karasu-skills` は patch

## 理由

- storage の宣言の場所を変えず、今日すでに書ける参照の形に解決先を足すだけの最小の変更で済む。既存のファイルは 1 行も変わらない
- ADR-316 が却下したのは service 直下に resource を宣言して参照する形で、理由は担当 domain との競合と定義の散在だった。client の storage は ADR-823 で client に置くと決まっており、宣言の場所を増やさない
- 解決を 1 つの index と 1 つの関数に畳むので、client を足しても「参照先が何か」の判定が読む側ごとに分かれない（TPL-1720、TPL-2088）
- 端末に閉じた storage は system view の共有 infra として描かれず、図が事実と食い違わない
- infra を優先するのは、今日 infra に解決しているファイルの意味を変えないため

## 影響

- id の無い client の storage は今までどおり読まれ、描かれる。`resource <ClientId>.<X>` と書いていたファイルは、client の storage に id `X` を足すと KRS048 が消える。足さなければ KRS048 が残る（メッセージは client を含む形に変わった）
- KRS048 の params に `parentKind` が増えた（`missing: "leaf"` のときだけ）。KRS115 と KRS116 が増えた
- `extractCrudMatrix` / `extractCoverage` / `extractView` / `createViewExtractor` は model 全体の index を省略できる引数で受け取り、compile の結果が `physicalTargets` を持つ。CLI の `matrix` / `coverage` / `render --include-matrix` はそれを渡す。`karasu coverage` は client の storage の表（JSON では `clientStores`）を出す
- 長い label を持つ昇格した resource のカードが広くなる
- 行数の予算のため、client の型・physical の参照の検証・client の warning・compile の結果の型・physical の参照のメッセージを別ファイルに分けた

## 却下した案

- **client の中に infra block を置く**: ADR-316 が却下した「infra を system 直下以外に置く」ことそのもので、`infra-not-in-context` と ADR-2165 の「client は子ノードを持たない」を覆す。browser の storage が system view の infra の段に描かれ、`service → storage` のエッジが出る。client の `resource` 行と同じ事実の表現が 2 つになる（TPL-1415）
- **system 直下の infra block として書く**（構文を足さない）: 端末に閉じた storage が「services が共有する data store」として描かれ、coverage の `physical` が system of record の候補として数える。モデルが事実と食い違う
- **client に domain / usecase を持たせる**（ADR-823 の案 ii）: usecase が service 側の domain にあり、client を配信物として別ノードにする形（reverse のモデル、BFF / SSR の `delivers`）を表せない。containment と domain の配置を開き直し、変更量が最も大きい。案 A と排他ではないので、後で採っても参照の形はそのまま使える
- **今日の書き方のまま運用する**（KRS048 を受け入れるか `[external]` を付ける）: warning が正しいモデルに出続けて本物の未解決参照が埋もれ、`[external]` は逆の意味になる。綴りを検査できず、受理した語彙が参照に効かないまま残る（TPL-1503）
- **v2.1 の stable として入れる**: reverse で 6 つの domain が同じ穴に触れたことを利用の証拠とみなす選択肢もあったが、ADR-1820 の前提条件の既定（experimental で入れて昇格に渋い）に従った

## 決めていないこと

- client の storage に `facets` を付けるか（Issue の 3 つ目の帰結。ADR-823 Q8 は安全属性のために `resource <kind> "<name>" { ... }` のネストを予約している）
- client の storage を domain が所有するか（entity の `table` 対応を client の storage に広げるか）。`cross-domain-store-access` は対象外のまま
- 後の行に書いた名前そのものを error にするか（edge の label について同じ問いを扱う #3766 の決定に合わせる）
- 認証情報の範囲（#834）。この ADR は既存の spec の範囲の文言を変えていない
