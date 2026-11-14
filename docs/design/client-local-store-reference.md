# usecase から client の local storage を参照する

- **日付**: 2026-11-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3794](https://github.com/kompiro/karasu/issues/3794)
  - 関連 ADR: [ADR-823](../adr/823-client-mcp-modeling.md)（`client` kind と `resource <storageKind> "<name>"` の導入。フル階層の案 ii を将来に回した）、[ADR-316](../adr/316-database-as-first-class-node.md)（infra を system 直下に限った。`service` 直下の resource 宣言と ID 参照を却下）、[ADR-2165](../adr/2165-logical-containment-rules.md)（`client` は子ノードを持たない）、[ADR-1046](../adr/1046-resource-crud-operations.md)（`operations`）、[ADR-1062](../adr/1062-crud-matrix-view.md)（CRUD matrix）、[ADR-1870](../adr/1870-domain-entity-modeling.md)（entity による leaf の所有）、[ADR-1895](../adr/1895-reverse-architecture-harness.md)（coverage）、[ADR-2124](../adr/2124-version-vocabulary.md)（言語版の bump 規則）
  - 関連 TPL: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理した語彙は効果を持つ）、[TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)（同じ語彙の二重表現）、[TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)（解決先の集合は全 kind を列挙する）、[TPL-2157](../test-perspectives/TPL-2157-resolved-relation-rendered-for-every-kind.md)（解決した関係を提示する側の kind gate）
  - コード: `packages/core/src/parser/block-contents.ts`（`parseClientResource`）、`packages/core/src/parser/reference-validation.ts`（`unresolved-resource-ref`）、`packages/core/src/resolver/resource-entity.ts`、`packages/core/src/view/crud-matrix-extract.ts`、`packages/core/src/view/coverage-extract.ts`、`packages/core/src/view/derived-edges.ts`

## 背景・課題

`client` が宣言する storage（`resource opfs "…"` / `resource localStorage "…"` など）を、`usecase` から参照する書き方がない。usecase の `resource` が dot-notation で解決できるのは infra の leaf（`resource <InfraId>.<SubId>`）だけで、client の resource は id を持たない文字列の名前である。操作が読み書きする状態が client 側にあると、どの usecase がそれに触るかをモデルで言えず、usecase は `resource` 行を 1 本も持たない。

karasu 自身を reverse-architecture スキルでモデル化したとき（2026-11-14、13 エージェント）、6 つの domain が独立にこの穴を報告した。その run で最も多く報告された記法の穴である。

| Domain | 参照できなかった状態 |
| --- | --- |
| Workspace（app） | OPFS の `/meta/projects.json`、project files、`.snapshots/<rel>/`、`.karasu-paste-compare.krs`。localStorage の `karasu-last-project-id`、tour / welcome のキー、panel 幅 |
| AssistantChat（app） | sessionStorage / localStorage の `karasu.ai.anthropic.apiKey`、localStorage の `karasu.ai.settings.persist` |
| Localization（app） | localStorage の `karasu-locale` |
| Preview（app） | localStorage の `karasu-theme` |
| CommandLine（CLI） | 読む `.krs` / `.krs.style` と書く SVG（`client CliTool { resource file … }`） |
| IdeIntegration（VS Code） | webview のために読み書きする workspace の `.krs` |

その結果:

- `karasu coverage` は、深くモデル化した domain も thin と採点する。AssistantChat は usecase 12 本で 0.16。状態がすべて browser storage と外部 API にあるため、`res` が 0 になる。
- CRUD matrix（`karasu matrix`、`CrudMatrixPanel`）に、API キーの保存・削除、project の保存、snapshot の取得といった操作の行が出ない。レビューする人が最も見たい書き込み（とりわけ API キー）が表に載らない。
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
    usecase SaveApiKey { }   // どの storage に書くかを書けない
  }
}
```

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 構文 | `client` の中で `resource <storageKind> "<name>"`。`<storageKind>` は `localStorage` / `sessionStorage` / `indexedDB` / `opfs` / `file` / `keychain` の 6 つで、それ以外は `client-resource-invalid-kind`（error） |
| AST | `ClientResource { storageKind, name, loc }`。id も property block も無い。`ClientNode.properties.resources` に入るだけでノードではない |
| 描画 | client カードの `×N` チップ（package glyph）と、`NodeDetailPanel` の "Storage resources" 一覧（AT-0069） |
| usecase の参照 | `ResourceNode.ref = { parent, child }`。`reference-validation.ts` が infra の block / leaf に解決し、無ければ `unresolved-resource-ref`（`missing: "block" \| "leaf"`）。bare の `resource X` は同名 entity に解決し、無ければ `unassigned-resource` |
| 派生エッジ | infra に解決した参照から `service → database / queue / storage` を派生し、usecase→resource のエッジに `[read]` / `[write]` を付ける（`derived-edges.ts`） |
| CRUD matrix | column は `resourceId` と `infraKind`。`infraFilter` で infra の種類を絞る |
| coverage | domain ごとの `res` は usecase の resource 数。`physical` 節は宣言した infra の leaf ごとに mapped / referenced を数え、infra が 1 つも無ければ空 |
| containment | `client` は子ノードを持たない（ADR-2165、`node-not-in-context`） |

## 制約・前提

- 言語版は 2.0（`KRS_LANGUAGE_VERSION`）。今日パースが通るファイルは通り続けること。後方互換な追加は minor（v2.1）として扱う（ADR-2124）。
- 論理と物理の分離を崩さない。client の storage は「client が端末で持つ、操作に結びつく storage」（ADR-823）であり、system の共有 infra（ADR-316）ではない。
- ADR-316 は infra を system 直下に限り、`service` 直下に resource を宣言して ID で参照する案を「担当 domain との概念コンフリクト、定義の散在」で却下している。どの案もこの却下に触れるかどうかを確かめる。
- ADR-823 は `client → domain → usecase → resource` のフル階層（案 ii）を将来の別 Issue に回した。
- out of scope: cookie / credential（#834）、device capability（#837）、client storage の domain 所有と `cross-domain-store-access`、外部 service 呼び出しを usecase に結びつける記法（reverse の NOTES にあるもう 1 つの穴）。

## 検討した選択肢

### 案 A: client の resource に id を与え、usecase から `<ClientId>.<ResourceId>` で参照する

```krs
system Karasu {
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
}
```

- id は `<storageKind>` と名前の間に置き、省略できる。id の無い行は今日と同じ意味で、参照されない storage として残る。
- usecase の `resource <Parent>.<Child>` は、`<Parent>` が client なら client の resource の id に解決する。infra への解決は変えない。

**メリット**

- 宣言の場所が変わらない。storage は今も client に書いてあり、id を足すだけで参照できるようになる。既存のファイルは 1 行も変わらない。
- 参照側の形が infra と同じ（`resource X.Y { operations … }`）なので、`operations`、`[read]` / `[write]`、CRUD matrix、coverage の `res` をそのまま載せられる。
- ADR-316 の却下（service 直下に resource を宣言して参照）とは別物である。却下の理由は、service 直下の resource が「担当 domain」と競合し定義が散ることだった。client の storage は ADR-823 で client に置くと決まっており、新たに宣言の場所を増やさない。

**デメリット**

- dot-notation の `<Parent>` が infra と client の 2 種類になる。解決先の集合を列挙する箇所（parser の検証、resolver、coverage、matrix、LSP）を揃えて直す必要がある（TPL-1720）。
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

- 端末に閉じた storage が「services が共有する data store」（syntax.md の infra layer の定義）として描かれ、案 B と同じく `service → storage` のエッジが出る。モデルが嘘をつく。
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

## 比較

| 観点 | 案 A | 案 B | 案 C | 案 D |
| --- | --- | --- | --- | --- |
| 言語の変更 | additive（v2.1） | 既存規則を覆す | なし | 既存規則を覆す |
| 過去の決定との衝突 | なし | ADR-316 / ADR-2165 | なし（ただし infra の定義に反する） | ADR-823 の先送り、ADR-2165 |
| 端末に閉じていることが図に残る | 残る | 残らない（infra tier） | 残らない（infra tier） | 残る |
| service と client が分かれたモデル（BFF、reverse の形）で使える | 使える | 使える | 使える | 使えない |
| operations / matrix / coverage | 解決先を足す | そのまま | そのまま | 解決先を足す |

## 現時点の方針

**案 A を採用する。** storage の宣言の場所を変えず、参照の口だけを足す最小の変更で、過去の決定とも衝突しない。案 B / C は端末の storage を共有 infra として描くのでモデルが事実と食い違い、案 D は reverse で実際に出た「service が client を配信する」形を表せない。

以下、案 A の細部の決定。kompiro の確認が要るものは「未解決の問い」に回した。

### 1. 宣言の構文

```
resource <storageKind> [<Id>] "<name>"
```

- `<Id>` は省略できる。parser は `resource` / Identifier（kind）/ Identifier（id）/ StringLiteral の並びを新しい形として読む。今の判定（2 番目が StringLiteral）はそのまま残す。
- 同じ client 内で id が重なったら `client-resource-duplicate-id`（warning）。2 つ目は参照の解決先にしない。
- 名前（文字列）は省略不可のまま。storage のキーやパスは事実として残したい。
- formatter は id を含めて round-trip する。

### 2. 参照の解決

- usecase の `resource <Parent>.<Child>` で、`<Parent>` が同じ system の `client` なら、その client の resource のうち id が `<Child>` のものに解決する。
- `<Parent>` が client で `<Child>` が見つからないときは、既存の `unresolved-resource-ref` を `missing: "leaf"` で出す。params に `parentKind: "infra" | "client"` を足し、メッセージを「client "WebApp" に id "X" の storage resource が無い」と言い分ける。
- usecase と client の関係（`delivers` / `handles` / エッジ）は検査しない（未解決の問い Q1）。
- `[read]` / `[write]` の合成は infra と同じ規則で付ける。

### 3. 派生エッジ（system view）

派生しない。infra への参照は `service → database` を派生するが、client の storage への参照から `service → client` を派生すると、service が client に依存する向きの絵になる。BFF の配信関係は既に `delivers` が描いている。

### 4. 描画

- domain view / usecase drill-down: 解決した参照は、infra に解決した resource と同じく domain view に昇格させる（`unassigned-resource` にならないので）。shape tag は推論しない（infra の `table → [table]` のような対応を client の storage kind に持たせない）。
- `NodeDetailPanel`: client の "Storage resources" 一覧に id を出し、参照している usecase を並べる。resource 側の detail には「client WebApp の localStorage」と出す。

### 5. CRUD matrix

client の storage を column に含める。`CrudMatrixColumn` に `clientId` と `storageKind` を足し、`infraKind` は undefined。`infraFilter` に client の storage を絞る値を足すかは実装の PR で決める（既定は含める）。

### 6. coverage

- domain の `res` は、client の storage に解決した参照も数える。数えないと AssistantChat のような domain は thin のままになる。
- `physical` 節に `clientStores` を足し、client ごとに「id のある storage」「参照された storage」「参照されていない storage」を出す。`infra` には混ぜない。`infra` は共有の data store と system of record の回収を測る節で、端末の storage はその対象ではない。
- `physical` 節が「infra が 1 つも無ければ空」という規則は `infra` にだけ掛け、`clientStores` は infra の有無と独立に出す。

### 7. 言語版

v2.1 に上げる（後方互換な追加。ADR-2124）。`KRS_LANGUAGE_VERSION` と spec の `.krs language v<version>` を同じ PR で更新する。

### 実装の指針

1 PR で出す（parser から coverage まで揃わないと、受理した語彙が効果を持たない。TPL-1503）。

1. core: `ClientResource` に `id?: string`。`parseClientResource` で id を読む。`client-resource-duplicate-id` を追加（diagnostic id、i18n en / ja、`docs/spec/diagnostics.md`）。
2. core: formatter の round-trip。
3. core: `reference-validation.ts` と `resource-entity.ts` で client の storage に解決する。解決結果は infra とは別の形（`clientId` / `clientResourceId`）で持ち、`infraParentId` に混ぜない。`unresolved-resource-ref` の params に `parentKind`。
4. core: `derived-edges.ts` は client への解決から service エッジを派生しないことをテストで固定する。`[read]` / `[write]` は付ける。
5. core: `crud-matrix-extract.ts` / `crud-matrix-format.ts`、`coverage-extract.ts`（`res` と `physical.clientStores`）。CLI の `karasu matrix` / `karasu coverage` の出力。
6. app: `NodeDetailPanel` の client の storage 一覧と resource 側の表示。`CrudMatrixPanel`。
7. lsp: dot-notation の補完と go-to-definition で client の storage を候補に含める。
8. docs: `docs/spec/syntax.md` / `.ja.md`（client resource の節と infra layer の dot-notation の節）、`docs/spec/diagnostics.md`、skill の reference bundle（`pnpm run lint:skill-reference-bundle-sync --write`）。reverse-architecture / karasu-author スキルの本文に、client の storage を usecase から参照する書き方を足す。
9. TPL: proactive TPL を 1 件起こす。観点は「dot-notation の解決先（infra と client）を列挙する箇所が全部そろっている」（parser の検証、resolver、派生エッジ、matrix、coverage、LSP）。TPL-1720 の back-ref も張る。
10. AT: `docs/acceptance/` に新規。TC は次のとおり（人間の確認が要るものだけ）:
    - app で、client の storage を参照する usecase の domain view に resource が出て、detail panel に client と storage kind が出る
    - CRUD matrix panel に client の storage の column が出る
11. changeset: `@karasu-tools/core` / `karasu` を minor、`karasu-skills` を patch。
12. ADR 昇格: 実装の PR がマージされたら `docs/adr/3794-client-local-store-reference.md` に昇格し、本 Design Doc を同じ PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし。id の無い client resource は今日と同じに読まれ、描かれる。
- ドキュメント更新: `docs/spec/syntax.md` / `.ja.md`、`docs/spec/diagnostics.md`、skill の reference bundle と本文。
- テスト・examples への影響: 既存の examples は変わらない。`examples/client-mcp/` に参照の例を足すかは実装の PR で決める（足すなら `pnpm gen:examples`）。

## 未解決の問い / 決めないこと

- **Q1. usecase と client の関係を検査するか。** 方針は「検査しない」。純粋な SPA は `delivers` する service を持たず（ADR-823）、domain が system 直下やトップレベルにあることもあるので、`delivers` / `handles` を前提にすると正しいモデルを警告してしまう。kompiro の判断を仰ぎたい。
- **Q2. client の storage に `facets` を付けられるようにするか。** Issue の 3 つ目の帰結（`facets secret` を storage の枠に付けたい）。`resource localStorage ApiKey "…" { facets secret }` のように property block を足すと、facet の解決先にノードでないもの（client の storage）が入る。本 Design Doc では決めず、案 A が入ったあとに別 Issue で扱う。
- **Q3. client の storage を domain が所有するか。** entity の `table` 対応（ADR-1870）を client の storage に広げるかどうか。`cross-domain-store-access` は対象外のまま。
- 案 D（client のフル階層）は引き続き将来の検討に残す。案 A はそれを妨げない。
