# usecase から client の local storage を参照する

- **日付**: 2026-11-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3794](https://github.com/kompiro/karasu/issues/3794)
  - 関連 ADR: [ADR-823](../adr/823-client-mcp-modeling.md)（`client` kind と `resource <storageKind> "<name>"` の導入。Q8 で `resource <kind> "<name>" { ... }` のネストを将来の拡張に予約し、フル階層の案 ii を将来に回した）、[ADR-316](../adr/316-database-as-first-class-node.md)（infra を system 直下に限った。`service` 直下の resource 宣言と ID 参照を却下）、[ADR-2165](../adr/2165-logical-containment-rules.md)（`client` は子ノードを持たない）、[ADR-1046](../adr/1046-resource-crud-operations.md)（`operations`）、[ADR-1062](../adr/1062-crud-matrix-view.md)（CRUD matrix）、[ADR-1870](../adr/1870-domain-entity-modeling.md)（entity による leaf の所有）、[ADR-1895](../adr/1895-reverse-architecture-harness.md)（coverage）、[ADR-2124](../adr/2124-version-vocabulary.md)（言語版の bump 規則）
  - 関連 TPL: [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)（解決先の集合は全 kind を列挙し、重複する集合は 1 つに畳む）、[TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md)（参照サイトは記法と解決規則を共有する）、[TPL-1625](../test-perspectives/TPL-1625-client-vocabulary-structure-not-implementation.md)（client の語彙は構造を名指す）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理した語彙は効果を持つ）、[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)（formatter の round-trip）、[TPL-3752](../test-perspectives/TPL-3752-optional-trailing-token-stops-at-next-statement.md)（省略できる token の読み方）、[TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)（同じ事実の二重表現）
  - コード: `packages/core/src/parser/block-contents.ts`（`parseClientResource`）、`packages/core/src/parser/reference-validation.ts`（`unresolved-resource-ref`）、`packages/core/src/spec/infra-index.ts`（`indexDeclaredInfra`）、`packages/core/src/view/resource-promotion.ts`、`packages/core/src/view/crud-matrix-extract.ts`、`packages/core/src/view/coverage-extract.ts`、`packages/core/src/view/derived-edges.ts`

## 背景・課題

`client` が宣言する storage（`resource opfs "…"` / `resource localStorage "…"` など）を、`usecase` の `resource` が指す先として解決する仕組みがない。usecase の dot-notation（`resource <Parent>.<Child>`）が解決するのは infra の leaf だけで、client の resource は id を持たない文字列の名前である。

`resource WebApp.ApiKey` と書くこと自体は今もできる（下の「現状」）。ただし KRS048（`unresolved-resource-ref`）が「WebApp を宣言する database / queue / storage block が無い」と警告し、client が宣言した storage とは何も結びつかない。綴りを間違えても気づけず、warning を消すために `[external]` を付けると「system の外にある」という逆の意味になる。正しく書く方法がないので、書き手は usecase に `resource` 行を書かない。

karasu 自身を reverse-architecture スキルでモデル化したとき（2026-11-14、13 エージェント）、Issue の集計では 6 つの domain の報告がこの穴に触れた。その run で最も多く報告された記法の穴である。

| Domain | 参照できなかった状態 |
| --- | --- |
| Workspace（app） | OPFS の `/meta/projects.json`、project files、`.snapshots/<rel>/`、`.karasu-paste-compare.krs`。localStorage の `karasu-last-project-id`、tour / welcome のキー、panel 幅 |
| AssistantChat（app） | sessionStorage / localStorage の `karasu.ai.anthropic.apiKey`、localStorage の `karasu.ai.settings.persist` |
| Localization（app） | localStorage の `karasu-locale` |
| Preview（app） | localStorage の `karasu-theme` |
| CommandLine（CLI） | 読む `.krs` / `.krs.style` と書く SVG（`client CliTool { resource file … }`） |
| IdeIntegration（VS Code） | webview のために読み書きする workspace の `.krs` |

その結果:

- `karasu coverage` は、深くモデル化した domain も thin と採点する。AssistantChat は usecase 12 本で 0.16。状態がすべて browser storage と外部 API にあり、usecase に `resource` 行が無いので `resourceRefs`（CLI の `resources` 列）が 0 になる。
- CRUD matrix（`karasu matrix`、`CrudMatrixPanel`）に、API キーの保存・削除、project の保存、snapshot の取得といった操作の column と cell が出ない（usecase の行はある）。レビューする人が最も見たい書き込み（とりわけ API キー）が表に載らない。
- `facets secret` は、キーを保存する usecase には付けられるが、キーが置かれる storage の枠には付けられない。方針の対象はその枠の方である。

reverse モデルの形は次のとおりで、usecase は `service KarasuApp` の domain にあり、storage は `KarasuApp delivers WebApp` の先の `client WebApp` にある。

```krs fragment
client WebApp [web] {
  resource sessionStorage "karasu.ai.anthropic.apiKey (default)"
  resource localStorage "karasu.ai.anthropic.apiKey (opt-in persist)"
}
service KarasuApp {
  delivers WebApp
  domain AssistantChat {
    usecase SaveApiKey { }   // どの storage に書くかを、解決できる形で書けない
  }
}
```

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 構文 | `client` の中で `resource <storageKind> "<name>"`。`<storageKind>` は `localStorage` / `sessionStorage` / `indexedDB` / `opfs` / `file` / `keychain` の 6 つで、それ以外は `client-resource-invalid-kind`（error）。parser は 1 つ目の token が `resource`、2 つ目が Identifier、3 つ目（`peekAt(2)`）が StringLiteral のときにこの形として読む |
| AST | `ClientResource { storageKind, name, loc }`。id も property block も無い。`ClientNode.properties.resources` に入るだけでノードではない |
| 描画 | client カードの `×N` チップ（package glyph）と、`NodeDetailPanel` の "Storage resources" 一覧（[AT 0069-client-resource-badge-and-detail-panel](../acceptance/0069-client-resource-badge-and-detail-panel.md)） |
| infra への dot-notation | `ResourceNode.ref = { parent, child }`。`reference-validation.ts` が `indexDeclaredInfra`（`spec/infra-index.ts`。渡された root を走査する。`validatePhysicalRefs` は全 root を渡すので system をまたいで解決し、import を merge した木でも作り直す）に照らし、無ければ `unresolved-resource-ref`（KRS048、`missing: "block" \| "leaf"`）。entity の `table X.Y` も同じ検査を通る |
| client を指す dot-notation（今日） | `resource WebApp.ApiKey { operations create }` は parse でき、KRS048 が出る。ほかはすでに infra と同じに扱われる。domain view への昇格は `ref` の有無で決まり（`resource-promotion.ts`）、CRUD matrix は usecase の resource をすべて column にし（`WebApp.ApiKey` の column に `CU`）、coverage の `resourceRefs` も 1 と数える。canvas の label は `buildResourceLabelMap` が infra しか見ないので `WebApp.ApiKey` のまま。`[external]` を付けると KRS048 も消える |
| bare の `resource X` | 同名の entity に解決し、無ければ `unassigned-resource`。昇格しない |
| `[read]` / `[write]` | `resource-promotion.ts` の `deriveUsecaseResourceNodes` が `operations` から usecase→resource のエッジに付ける |
| infra かどうかの判定（検証の外） | `buildEntityResolver(...).resolve(res)`（`resolver/resource-entity.ts`）は dotted の参照について `res.ref.parent` をそのまま `infraParentId` として返す。これを読む `deriveInfraEdges`・`shared-infra-fan-in`・`cross-domain-store-access` は、それぞれ自分の scope の infra id の集合に parent があるかを確かめ、`collectPhysical` は宣言した infra の leaf だけを数える。今日 client を infra と取り違えることは無いが、「parent が infra か」の判定は読む側ごとに別々に書かれている。`buildEntityResolver` に渡す root も呼び出し元ごとに違う（system ごと、container の children、`[...systems, ...orphans]`、`file.clients` を含まない組み合わせ） |
| 派生エッジ | `derived-edges.ts` の `deriveInfraEdges` が、infra の id の集合にある `infraParentId` から `service → database / queue / storage` を派生する |
| canvas の label | `buildResourceLabelMap` / `buildResourceInferredTagsMap`（`resource-promotion.ts`）は `system.children` の infra だけを見る。layout は `resourceLabelMap.get(id) ?? 参照の label ?? id` の順に読むので、infra に解決した参照では map の label が参照の側の label より勝つ |
| CRUD matrix | column は `resourceId`・`label`・`infraKind`・`external`。`infraFilter` を指定すると `infraKind` の無い column は落ちる。CLI の `--infra` は database / queue / storage しか受けない。`karasu render` も matrix を作る |
| coverage | domain ごとの `resourceRefs` は `parent.child` をキーにした重複なしの数。`physical` 節は宣言した infra の leaf ごとに mapped / referenced を数える。infra が 1 つも無ければ `collectPhysical` が早く返り、CLI（`cli/src/coverage.ts`）も `physical.infra` が空なら節ごと出さない |
| containment | `client` の `canContain` は空（ADR-2165 が `canContain` を containment 規則の唯一の定義にした。違反は `node-not-in-context`） |
| 同じ id の衝突 | 同じ scope で同じ id を 2 度宣言すると KRS016（error）。scope が違う（system 内の `storage WebApp` とトップレベルの `client WebApp`）と衝突の診断は出ない。同じ id の client は、同じ system に import で 2 度入ると KRS018（error）、別の path にあると KRS030 で、model はそれぞれを別のノード（別のカード、`nodePathIndex` の勝者）として扱う。client は merge されない。同じ id の infra block は leaf を和集合にする（S4.5。先勝ちで、同じ leaf の再宣言は `infra-leaf-redeclared-silently` の info、同じ宣言を複数の import の経路で拾ったものは黙って 1 つにする） |
| 呼び出し元に届く model | `extractCrudMatrix` / `extractCoverage`（CLI の `matrix` / `coverage` / `render`）と `buildResourceLabelMap` は `systems` だけを受け取る。トップレベルの client（KRS059 の orphan）とトップレベルの infra はここに届かない |
| client 内の重複 | `client-capability-duplicate`（KRS097）は resolver の warning（`resolver/warnings.ts` の `detectDuplicateClientCapabilities`）。1 つの client ノードの中だけを見る |
| client の storage を見せる面 | client カードの tooltip（`renderer/node-text.ts`）、`NodeDetailPanel` に渡る node metadata（`compile/compile.ts`） |

つまり、参照する側の形（dot-notation、`operations`、昇格、matrix、coverage の数）は今日すでに動いている。欠けているのは **解決先**であり、そのために KRS048 が誤って出て、宣言した storage との結びつき（綴りの検査、storage の名前と kind の表示）が無い。もう 1 つ、「参照先が infra かどうか」を決める場所が検証（`indexDeclaredInfra`）と読む側（`buildEntityResolver` と、それを読む各所の infra id の集合）に分かれている。client を解決先に足すときに 3 つ目の判定を各所に書き足すと、判定の分岐が増える（TPL-1720）。

## 制約・前提

- 言語版は 2.0（`KRS_LANGUAGE_VERSION`）。今日パースが通るファイルは通り続けること。後方互換を約束する層に載せるかは ADR-1820 の promotion gate で判断する（既定は experimental 据え置きで、昇格に渋い）。昇格するときに後方互換な追加なら minor（v2.1）に載せる（ADR-2124）。
- 論理と物理の分離を崩さない。client の storage は「client が端末で持つ、操作に結びつく storage」（ADR-823）であり、system の共有 infra（ADR-316）ではない。
- ADR-316 は infra を system 直下に限り、`service` 直下に resource を宣言して ID で参照する案を「担当 domain との概念コンフリクト、定義の散在」で却下している。どの案もこの却下に触れるかどうかを確かめる。
- ADR-823 は `client → domain → usecase → resource` のフル階層（案 ii）を将来の別 Issue に回した。
- client の語彙はアクセスパスの構造を名指す（TPL-1625）。storage の中身やスキーマは語彙に入れない。
- out of scope: cookie / credential（#834）、device capability（#837）、client storage の domain 所有と `cross-domain-store-access`、外部 service 呼び出しを usecase に結びつける記法（reverse の NOTES にあるもう 1 つの穴）。

## 検討した選択肢

### 案 A: client の resource に id を与え、`<ClientId>.<ResourceId>` を解決する

```krs fragment
// 提案する構文。今日の parser は通さない
client WebApp [web] {
  resource sessionStorage ApiKeySession "karasu.ai.anthropic.apiKey"
  resource localStorage ApiKeyPersist "karasu.ai.anthropic.apiKey"
  resource opfs Projects "/meta/projects.json"
}
service KarasuApp {
  delivers WebApp
  domain AssistantChat {
    usecase SaveApiKey {
      resource WebApp.ApiKeySession { operations create, update }
      resource WebApp.ApiKeyPersist { operations create, update }
    }
    usecase ForgetApiKey {
      resource WebApp.ApiKeySession { operations delete }
      resource WebApp.ApiKeyPersist { operations delete }
    }
  }
}
```

- id は `<storageKind>` と名前の間に置き、省略できる。id の無い行は今日と同じ意味で、参照されない storage として残る。
- usecase の `resource <Parent>.<Child>` は、`<Parent>` が client なら client の resource の id に解決する。infra への解決は変えない。

**メリット**

- 宣言の場所が変わらない。storage は今も client に書いてあり、id を足すだけで参照できるようになる。既存のファイルは 1 行も変わらない。
- 参照する側は今日すでに書ける形（`resource X.Y { operations … }`）で、昇格・matrix・coverage の数も今日のまま効く。足すのは解決先だけである。
- ADR-316 の却下（service 直下に resource を宣言して参照）とは別物である。却下の理由は、service 直下の resource が「担当 domain」と競合し定義が散ることだった。client の storage は ADR-823 で client に置くと決まっており、新たに宣言の場所を増やさない。

**デメリット**

- dot-notation の `<Parent>` が infra と client の 2 種類になる。解決先の集合を列挙する箇所（parser の検証、昇格の label、coverage、matrix、LSP）を 1 つの index に揃える必要がある（TPL-1720）。
- client resource の構文に 3 つ目の位置（id）が入る。

### 案 B: client の中に infra block を置けるようにする

```krs fragment
client WebApp [web] {
  storage BrowserStorage {
    bucket ApiKey { label "karasu.ai.anthropic.apiKey" }
  }
}
```

既存の `resource <InfraId>.<SubId>` と coverage の `physical` 節がそのまま効く。

**メリット**

- 参照の解決と coverage を変えずに済む。

**デメリット**

- ADR-316 が却下した「infra を system 直下以外に置く」ことそのものである。`infra-not-in-context` の規則と、ADR-2165 の「client は子ノードを持たない」を両方覆す。
- infra block は system view の infra tier に描かれ、`service → storage` の派生エッジが出る。browser の storage が共有 infra と同じ段に並び、backend の service が端末の storage に依存する絵になる。
- client が既に持つ `resource <storageKind> "<name>"` と、同じ事実の表現が 2 つになる（TPL-1415）。

### 案 C: system 直下の infra block として書く（構文を足さない）

```krs fragment
storage WebAppLocal {
  bucket ApiKey { label "karasu.ai.anthropic.apiKey" }
}
```

今日でも書ける。reverse スキルに「client の storage は infra block として書け」と教えるだけで済む。

**メリット**

- 言語の変更が要らない。

**デメリット**

- 端末に閉じた storage が「services が共有する data store」（syntax.md の infra layer の定義）として描かれ、案 B と同じく `service → storage` のエッジが出る。モデルが事実と食い違う。
- coverage の `physical` 節が browser storage を system of record の候補として数える。
- client の `resource` 行と二重になるか、client の `resource` 行を使わなくなる。

### 案 D: client に domain / usecase を持たせる（ADR-823 の案 ii）

`client → domain → usecase → resource` のフル階層にし、client 内の usecase が client 内の resource を持つ。

**メリット**

- 「どの操作が何を保管するか」を構造で表せる。ADR-823 が案 ii を評価した理由そのもの。

**デメリット**

- karasu の reverse モデルでは、usecase は `service KarasuApp` 側の domain にあり、client は配信物として別ノードになっている。案 D はこの形を表せない（usecase を client に移す必要がある）。BFF / SSR で service が client を `delivers` する形（ADR-823）とも噛み合わない。
- containment の規則、domain の配置（`unassigned-domain`）、同名 domain の二重宣言（ADR-823 Q9）を開き直す。変更量が最も大きい。
- 案 A と排他ではない。案 D を後で採っても、client 内の usecase が `resource WebApp.ApiKey` で参照できればよく、案 A の参照形はそのまま使える。

### 案 E: 今日の書き方のまま運用する（`resource WebApp.X` を書き、KRS048 を受け入れるか `[external]` を付ける）

言語を変えず、reverse スキルと guide に「client の storage は `resource <ClientId>.<名前>` と書く」と教える。matrix・coverage の数は今日でも効く。

**メリット**

- 言語の変更が要らない。matrix の column と coverage の `resourceRefs` は今日でも得られる。

**デメリット**

- KRS048 が常に出る。warning が正しいモデルに出続けると、本物の未解決参照が埋もれる。`[external]` で消すと「system の外にある」という逆の意味を書くことになる。
- 宣言した storage と結びつかない。`WebApp.ApiKy` のような綴りの誤りを検出できず、canvas の label も storage の名前や kind を出せない。client の `resource` 行と参照の側が、同じ storage を別々に書く二重の表現になる（TPL-1415）。
- 受理した語彙（client の `resource` 行）が参照の解決に効かないまま残る（TPL-1503）。

## 比較

| 観点 | 案 A | 案 B | 案 C | 案 D | 案 E |
| --- | --- | --- | --- | --- | --- |
| 言語の変更 | additive（experimental で入れる） | 既存規則を覆す | なし | 既存規則を覆す | なし |
| 過去の決定との衝突 | なし | ADR-316 / ADR-2165 | なし（ただし infra の定義に反する） | ADR-823 の先送り、ADR-2165 | なし |
| 端末に閉じていることが図に残る | 残る | 残らない（infra tier） | 残らない（infra tier） | 残る | 残るが、宣言とは結びつかない |
| service と client が分かれたモデル（BFF、reverse の形）で使える | 使える | 使える | 使える | 使えない | 使える |
| 誤った warning と綴りの検査 | 解消 | 解消 | 解消 | 解消 | KRS048 が残り、綴りを検査できない |

## 現時点の方針

**案 A を採用する。** storage の宣言の場所を変えず、今日すでに書ける参照の形に解決先を足すだけの最小の変更で、過去の決定とも衝突しない。案 B / C は端末の storage を共有 infra として描くのでモデルが事実と食い違い、案 D は reverse で実際に出た「service が client を配信する」形を表せない。案 E は warning と二重の表現が残る。

以下、案 A の細部の決定。kompiro の確認が要るものは「未解決の問い」に回した。

### 1. 宣言の構文

```
resource <storageKind> [<Id>] "<name>"
```

- `<Id>` は省略できる。名前（文字列）は省略不可のまま。storage のキーやパスは事実として残したい。
- **client の storage の形として読む条件**: client の中の `resource` で、次の token が 6 つの storage kind のどれかであるか、3 つ目の token が StringLiteral である（今日の条件）とき。どちらでもなければ今日どおり通常の `resource` の宣言として読み、KRS010 になる（`resource Foo { }` の扱いは変わらない）。
- この形として読んだ後、id の位置には Identifier を置く。キーワードとして字句解析される語（`table`、`storage` など）がそこにあれば、id に使えない語の error を出す。名前が無い（`resource opfs Projects` で行が終わる）ときは、名前が無い error を出す。どちらも今日は KRS010 + KRS100 になる。
- 名前は TPL-3752 の共有の読み手（`opensEdgeOnLaterLine` / `readValueAfter` / `reportMissingValue`）で読み、今日の 3 token の判定もこれに揃える。後の行の文字列は、今日どおり名前として読む（今日パースが通るファイルを通し続けるため）。ただしその行がエッジを始める（`"WebApp" -> A`）なら名前として読まず、名前が無い error を出す。これは ADR-3752 が省略できる token に定めた「次の行のエッジで止まる」と同じ規則で、今日 KRS100 になっている形だけが変わる。後の行の名前そのものを error にするかは、edge の label について同じ問いを扱う #3766 の決定に合わせ、本 Design Doc では決めない。client の block は明示した source のエッジを受け付けるので、今日 `resource opfs` の次の行に `"WebApp" -> A` を書くと、文字列が名前として読まれて `->` で KRS100 になる。TPL-3752 のチェックリストは「client の `resource` の名前」を `ctx.expect` でよい箇所に挙げているので、同じ PR でこの例を添えて直す。
- formatter は id を含めて round-trip する（TPL-1101）。

### 2. 参照の解決

**到達状態**: 「`<Parent>.<Child>` が infra の leaf か、client の storage か、どちらでもないか」を決める関数が 1 つだけあり、検証・昇格の label・派生エッジ・matrix・coverage・`shared-infra-fan-in`・`cross-domain-store-access`・LSP がその結果だけを読む（TPL-1720）。今日の読む側は、それぞれ自分で infra の id の集合を確かめていて、client を取り違えてはいない。この節は取り違えを直すのではなく、判定を 1 つに畳んで client を足すためのものである。

- **index は model 全体で 1 つ**作り、解決の関数に渡す（TPL-2088）。`spec/infra-index.ts` に client の storage の index を足し、全 root（トップレベルの client と、どの system の中の client も）を走査する。import を merge した木でも作り直す。`buildEntityResolver` は呼び出し元ごとに違う root で作られるので、client の storage を自分の root から探させず、この index を受け取る。
- 解決結果は `{ kind: "infra", infraId, leafId } | { kind: "client", clientId, storageId } | { kind: "unresolved" }` の形で返す。`buildEntityResolver` の `resolve()` もこの関数を通し、client に解決した参照では `infraParentId` を undefined にする。`unresolved` のときは今日どおり `infraParentId = parent` を返す（ほかの scope に宣言された infra を各所が今日どおりに扱うため）。
- usecase の `resource <Parent>.<Child>` で、`<Parent>` が client なら、その client の storage のうち id が `<Child>` のものに解決する。
- **同じ id の client が複数のノードとしてある**とき（KRS030 の場合。同じ system に 2 度入る場合は KRS018 の error）、model はそれらを別のノードとして扱うので、storage を和集合にはしない。index は client の id ごとに、各ノードの storage を宣言の単位で持つ（同じ宣言を複数の import の経路で拾ったものは 1 つに数える）。`<Child>` を持つ宣言が 1 つだけならそれに解決し、2 つ以上なら解決せず `resource-target-ambiguous` を出す。
- **同じ client の中で storage の id が重なった**ら `client-resource-duplicate-id`（warning）を出し、2 つ目以降を解決先にしない。`client-capability-duplicate` と同じく 1 つの client ノードの中だけを見る resolver の warning で、LSP の `SINGLE_DOCUMENT_CONTEXT` の行も `client-capability-duplicate` と同じ（`LOCAL`）にする。
- **infra block と client が同じ id**（scope が違うので KRS016 にならない場合）: 解決先は今日どおり infra とする。その client の storage は index・matrix・label の map・`clientStores` のどれにも入れず、`resource-target-ambiguous`（warning）でだけ示す。infra を優先するのは、今日 infra に解決しているファイルの意味を変えないためである。同じ scope での衝突は今日すでに KRS016 になる。
- `resource-target-ambiguous` は KRS048 と同じく parser 側の診断にし、`MERGED_SPACE_REFERENCE_CODES` に入れる（`owns-target-ambiguous` / `realizes-target-ambiguous` と同じく、merge した宣言の空間で決める）。
- `<Parent>` が client で `<Child>` が見つからないときは、既存の `unresolved-resource-ref` を `missing: "leaf"` で出す。params の `infraId` は名前を変えずに残し（`unresolved-table-ref` と揃え、JSON の出力を変えない）、`parentKind: "infra" | "client"` を足す（`missing: "leaf"` のときだけ持つ）。メッセージを「client "WebApp" に id "X" の storage resource が無い」と言い分ける。`missing: "block"` のメッセージは「database / queue / storage block も client も宣言していない」に直す（en / ja）。
- entity の `table X.Y` は同じ検査の関数（`validatePhysicalRefs`）を通るが、client の storage には解決させない。`table WebApp.ApiKey` は今日どおり未解決にし、テストで固定する（domain の所有は Q3 で決めない）。
- 参照の側の `[external]` は今日の意味のまま変えない（`validatePhysicalRefs` は `[external]` の参照を検査せず、matrix の `external` は参照の tags から付く）。新しい診断は足さない。KRS048 よけに `[external]` を付けていた参照は、id を足した後に `[external]` を外すよう guide に書く。
- usecase と client の関係（`delivers` / `handles` / エッジ）は検査しない（未解決の問い Q1）。

### 3. 派生エッジ（system view）

派生しない。infra への参照は `deriveInfraEdges` が `service → database` を派生するが、client の storage への参照から `service → client` を派生すると、service が client に依存する向きの絵になる。BFF の配信関係は既に `delivers` が描いている。`deriveInfraEdges` は今日も client を拾わないが、§2 の関数に畳んだ後もそうであることを、infra block と client が同じ id の fixture も含めてテストで固定する。

### 4. 描画

- 昇格・`[read]` / `[write]`（`resource-promotion.ts`）は今日すでに効いているので変えない。shape tag は推論しない（infra の `table → [table]` のような対応を client の storage kind に持たせない）。
- canvas の label は infra と同じ優先順にする（TPL-2088）。`buildResourceLabelMap` に client の storage を足し、その label を `<name> (<storageKind>)`（例: `karasu.ai.anthropic.apiKey (sessionStorage)`）にする。引用符を入れないので SVG / draw.io の escape を気にしなくてよく、同じ名前の storage が kind 違いで 2 つあっても区別できる。参照の側に書いた `label` は infra の場合と同じく map に負ける。この優先順を infra と client の両方で変えるかは、本 Design Doc では決めない。
- `buildResourceLabelMap` / `buildResourceInferredTagsMap` は今日 `systems` の `system.children` しか見ないので、§2 の model 全体の index から引くように直す。その結果、トップレベルの infra に解決した参照も infra の label で描かれるようになる（影響範囲に書く）。
- `NodeDetailPanel`: client の "Storage resources" 一覧に id を出し、そのノードの storage を参照している usecase を並べる（`compile/compile.ts` の node metadata に足す）。resource 側の detail には「client WebApp の sessionStorage」と出す。client カードの tooltip（`renderer/node-text.ts`）にも id を出す。

### 5. CRUD matrix

- 参照された client の storage は今日すでに column になっている。`CrudMatrixColumn` に `clientId` と `storageKind` を足す（`infraKind` は undefined のまま）。column の key は `<ClientId>.<Id>` で、infra の leaf と同じ形である。infra と id が重なる client の storage は §2 で index に入らないので、key はぶつからない。
- id を持つ client の storage は、参照されていなくても column にする（参照されていない infra の leaf と同じ扱い）。id の無い storage は column にしない。
- column の identity は key の文字列 `<ClientId>.<Id>` で、同じ key の storage が 2 つあっても column は 1 つにする（matrix は今日も column を文字列の key で持ち、参照の cell も参照の文字列で引く）。同じ client の中の重複は、§2 で解決先にならない 2 つ目以降を column の宣言元に数えない（`client-resource-duplicate-id` で示す）。同じ id の client ノードが別々に同じ id の storage を持つ場合は、§2 で参照が解決しない（`resource-target-ambiguous`）が、その参照の cell は今日どおりその key の column に入る。`clientId` / `storageKind` は宣言が 1 つに決まるときだけ埋め、決まらなければ空にする。
- `infraFilter` は infra の種類で絞る機能のままにし、指定したときに client の storage の column が落ちる今日の挙動を変えない。CLI の `--infra` も変えない。client の storage で絞る option は、要望が出たら別に足す。
- `extractCrudMatrix` は今日 `systems` だけを受け取るので、トップレベルの client の storage が届かない。model 全体（または §2 の index）を受け取るように signature を変え、CLI の `matrix` / `render` の呼び出しも直す。

### 6. coverage

- domain の `resourceRefs` は今日すでに client を指す参照を数えているので変えない。
- report の最上位に `clientStores` を足す（`physical` の中には入れない）。client は論理のノードで、`physical` は共有の data store と system of record の回収を測る節なので、端末の storage はその対象ではない。client ごとに「id のある storage」「参照された storage」「参照されていない storage」「id の無い storage（参照できない）」を出す。最後の 1 つは reverse の harness が「id を付ければ参照できる storage」を見つけるために要る。
- `clientStores` は infra の有無と独立に出す。`collectPhysical` の早い return、CLI の markdown の `physical.infra.length > 0` の条件、`CoverageReport.physical` の docstring は `physical` の節の中の話なので変えず、`clientStores` 用の出力を CLI に足す。
- `extractCoverage` も `systems` だけを受け取るので、matrix と同じく model 全体を受け取るように変える。

### 7. 言語版と promotion gate

client の storage の id と、それを解決先にする規則を `docs/roadmap.md` の「watch 対象の experimental notation」に登録し、ADR-1820 の promotion gate で評価する。登録する行には、昇格のトリガー（karasu-nest の corpus での利用、混乱や bug の Issue、この記法に触れるリリースの直前）を書く。gate の既定（experimental 据え置き）に従い、`KRS_LANGUAGE_VERSION` は 2.0 のまま変えない。昇格すると決めたら、そのときに v2.1 に載せる（後方互換な追加。ADR-2124）。v2.1 に上げる PR は、`language-version.test.ts` が見る 4 つの spec（`docs/spec/syntax.md` / `.ja.md`、`docs/spec/style.md` / `.ja.md`）の `.krs language v<version>` と、changeset・CHANGELOG での言語版の移行の記載を含む。

stable（v2.1）として今すぐ入れるかは未解決の問い Q4 で kompiro に確かめる。

### 実装の指針

1 PR で出す（parser から coverage まで揃わないと、受理した語彙が効果を持たない。TPL-1503）。

1. core: `ClientResource` に `id?: string`。`parseClientResource` で id を読み、§1 の条件で形を決め、TPL-3752 の共有の読み手を通す。名前の無い場合と id に使えない語の場合の error を足す。TPL-3752 のチェックリストを §1 の例を添えて直す。
2. core: formatter の round-trip。
3. core: `spec/infra-index.ts` に client の storage の index と、§2 の解決の関数。`reference-validation.ts`（`validatePhysicalRefs`）と `resolver/resource-entity.ts`（`buildEntityResolver`、index を受け取る）をそこに通す。`unresolved-resource-ref` の `parentKind` とメッセージ、`resource-target-ambiguous`（parser の診断、`MERGED_SPACE_REFERENCE_CODES`）、`client-resource-duplicate-id`（resolver の warning、`SINGLE_DOCUMENT_CONTEXT` は `LOCAL`）。それぞれ diagnostic id、i18n（en / ja）、`docs/spec/diagnostics.md` / `.ja.md`。entity の `table` は client に解決させない。
4. core: `deriveInfraEdges`・`collectPhysical`・`shared-infra-fan-in`・`cross-domain-store-access` が §2 の関数を読み、client への解決を infra と扱わないことを、infra block と client が同じ id の fixture も含めてテストで固定する。`resource-promotion.ts` の `buildResourceLabelMap` / `buildResourceInferredTagsMap` を §2 の index から引く。
5. core: `crud-matrix-extract.ts` / `crud-matrix-format.ts`、`coverage-extract.ts`（`clientStores`）。`extractCrudMatrix` / `extractCoverage` が model 全体を受け取るよう signature を変え、CLI の `karasu matrix` / `karasu coverage` / `karasu render` の呼び出しと出力を直す。
6. テスト: import で client を別ファイルに置いた場合（`examples/*/ec-platform/02.5-clients.krs` の形）の解決。トップレベルの client。system をまたぐ解決。同じ id の client が別のノードとしてある場合（同じ宣言を複数の経路で拾った場合は 1 つに数える）。同じ client の中の storage の id の重複。
7. app: `NodeDetailPanel` の client の storage 一覧と resource 側の表示（`compile/compile.ts` の node metadata）。client カードの tooltip（`renderer/node-text.ts`）。`CrudMatrixPanel`。
8. lsp: infra の leaf と同じ引き方にする（TPL-2088）。infra の leaf は今日、カーソルの下の語（`getWordAtPosition` は `.` を含まない）をそのまま id として `findRangeOfNode` / `getNodeDescription` で引かれ、補完も `collectAllIdentifiers` の平たい id の一覧から出る。client の storage も同じく、id を一覧と検索の対象に足す（`packages/lsp/src/position-resolver.ts`）。client の storage はノードではないので、列挙の側に足す。同じ id が他のノードや他の client の storage にもあるときの扱いは infra の leaf と同じ（今日の挙動を変えない）。
9. docs: `docs/spec/syntax.md` / `.ja.md`（client resource の節、infra layer の dot-notation の節と「promotion is what resolving the reference buys」の行、§S6 の dot-notation の検証規則。experimental であることを明記する）、`docs/spec/tags-annotations.md` / `.ja.md`（client resource の形と、system-assigned の `[read]` / `[write]` の節）、`docs/concepts.md` / `.ja.md`（`resource` の行）、`docs/spec/diagnostics.md` / `.ja.md`、`docs/guide/04-access-paths.md` / `.ja.md`（client resource の書き方の節）、`docs/guide/notation-cookbook.md` / `.ja.md`（usecase から client の storage を参照する書き方と、`[external]` を外す話。skill の reference に同梱される）、`docs/roadmap.md`（watch 対象の experimental notation）。skill の reference bundle を `pnpm run lint:skill-reference-bundle-sync --write` で揃え、reverse-architecture / karasu-author スキルの本文に書き方を足す。
10. TPL: 新しい spec の節には既存の TPL-1720・TPL-2088・TPL-1625 を `> Related TPLs:` で back-ref し、各 TPL の「派生元 spec」に節を足す。この設計が破りうる原則（解決先の列挙の分岐、参照サイト間の解決規則のずれ、client の語彙の実装への滑り落ち）は 3 つの TPL が既に持っているので、新しい proactive TPL は起こさない。TPL-3752 の修正は手順 1。
11. examples: `examples/en/ec-platform/02.5-clients.krs` と ja 版に、id のある storage と参照の例を足すか、実装の PR で決める（足すなら `pnpm gen:examples`）。
12. AT: `docs/acceptance/` に新規。TC は次のとおり（人間の確認が要るものだけ）:
    - app で、client の storage を参照する usecase の domain view に `<name> (<storageKind>)` の label で resource が出て、detail panel に client と storage kind が出る
    - CRUD matrix panel に client の storage の column が出る
13. changeset: `@karasu-tools/core` / `karasu` を minor、`karasu-skills` を patch。experimental のあいだは言語版の移行を書かない。`karasu-vscode` は core の cascade で patch になるが、LSP の補完が変わるので、拡張の利用者に見える変更として名指すかを実装の PR で確かめる。
14. ADR 昇格: 実装の PR がマージされたら `docs/adr/3794-client-local-store-reference.md` に昇格し、本 Design Doc を同じ PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: id の無い client resource は今日と同じに読まれ、描かれる。今日 `resource <ClientId>.<X>` と書いているファイルは、client の storage に id `X` を足すと KRS048 が消える。足さなければ今日どおり KRS048 が出る（メッセージは client を含む形に変わる）。infra block と client が同じ id のファイルは、解決先は変わらず `resource-target-ambiguous` が増える。
- トップレベルの infra に解決した参照は、canvas の label が参照の id から infra の label に変わる（§4）。描画が変わるので、実装の PR は before / after を添える。
- `extractCrudMatrix` / `extractCoverage` の signature が変わる（core の公開 API）。changeset に書く。
- ドキュメント更新: 実装の指針 9 を参照。
- テスト・examples への影響: 既存の examples は変わらない（トップレベルの infra を参照する example があれば label が変わるので、実装の PR で確かめる）。

## 未解決の問い / 決めないこと

- **Q1. usecase と client の関係を検査するか。** 方針は「検査しない」。純粋な SPA は `delivers` する service を持たず（ADR-823）、domain が system 直下やトップレベルにあることもあるので、`delivers` / `handles` を前提にすると正しいモデルを警告してしまう。kompiro の判断を仰ぎたい。
- **Q2. client の storage に `facets` を付けられるようにするか。** Issue の 3 つ目の帰結（`facets secret` を storage の枠に付けたい）。ADR-823 Q8 は安全属性のために `resource <kind> "<name>" { ... }` のネストを予約している。property block を足すと、facet の解決先にノードでないもの（client の storage）が入る。本 Design Doc では決めず、案 A が入ったあとに別 Issue で扱う。
- **Q3. client の storage を domain が所有するか。** entity の `table` 対応（ADR-1870）を client の storage に広げるかどうか。`cross-domain-store-access` は対象外のまま。
- **Q4. experimental で入れるか、stable（v2.1）で入れるか。** 方針は ADR-1820 の gate の既定どおり experimental で登録する。reverse で 6 つの domain が同じ穴に触れたことを、すでに十分な利用の証拠とみなして stable にする選択肢もある。kompiro の判断を仰ぎたい。
- 案 D（client のフル階層）は引き続き将来の検討に残す。案 A はそれを妨げない。
