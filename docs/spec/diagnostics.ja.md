> [English](diagnostics.md) · 日本語（このファイル）

# 診断と規則のリファレンス

karasu は問題を 2 つのレイヤーの語彙で報告する。

- **規則**（rule）は *概念* — 言語が何を許し何を禁じるか（「edge はその所属
  ブロックの内側から originate する」）。規則は、著者とこの spec が制約を語る
  ときの単位である。
- **診断**（diagnostic）は *メカニズム* — 規則の具体的な違反 1 つを検出したとき
  に発火する、名前付きの検査（`edge-source-mismatch`）。

1 つの規則はしばしば複数の診断で強制され、1 つの診断はちょうど 1 つの規則に
属する。本書は両者を対応づけるカタログである。

## 本カタログの読み方

- **診断コードは安定 API である。** `code` 文字列（例: `edge-source-mismatch`）
  は LSP・app・下流ツールが消費する。規則の言い回しに合わせてコードを rename
  することはしない。規則名は概念、コードは契約であり、両者は別レイヤー（altitude）
  に位置する。規則がその診断名とは別の言い回しの方が自然なのは想定どおり。
- **すべての診断コードは下記いずれか 1 つの規則ファミリーに属し**、core が定義
  する全コード（`DiagnosticParamsByCode`・`WarningKind`）が本書に現れる。この
  完全性は meta-test で強制される（*カタログの完全性* を参照）ため、新規コードは
  カタログ項目なしには出荷できない。
- `発火条件` 列に具体的なトリガを記す。severity は core が emit する値。

## register と severity

診断は **severity** を持つ: `error` / `warning` / `info`。

- `error` — モデルが不正で、該当構文は拒否される。
- `warning` — 著者が直すべき実際の欠陥（dangling な参照、スタイル衝突など）。
- `info` — 欠陥ではなく **事実**。外部の流派が smell と呼びうる構造（共有
  database、領域分散など）を、誤りと断じずに surface する。これが *事実 vs 流派*
  の register 区別である — [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) を参照。

karasu は未解決参照に対し **warn-don't-error**（spec §S6）に従う。未解決の関係は
落とすが、参照元の node は保存し、レンダー全体を失敗させずに warning として報告
する。

## 規則ファミリー

### 宣言・edge の配置・構造

何をどこに宣言できるか、edge の起点が何でありうるか。`service` / `domain` ブロック
内に書いた edge はそのブロックの id を起点にする。infra ブロックと `legend` は配置
が固定。sync edge は循環してはならない。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `edge-source-mismatch` | error | `service` / `domain` ブロック内の explicit な edge source が所属ブロック id と一致しない（**edge origin scope** 規則）。 |
| `ambiguous-edge-base` | warning | 同じ `from → to` の base を持つ edge が複数あり、識別する author id が無い。 |
| `service-outside-system` | warning | `service` が `system` の外で宣言されている。 |
| `infra-not-in-context` | error | infra ブロック（`database` / `queue` / `storage`）が `system` の直接の子でない。 |
| `legend-not-top-level` | error | `legend` ブロックがトップレベル以外で宣言されている。 |
| `top-level-declaration` | error | `user` またはエッジが `system` ブロック内ではなくトップレベルで宣言されている。 |
| `system-property-conflict` | warning | merge された import 間で `system` の `label` / `description` が衝突する。 |
| `cyclic-dependency` | warning | sync edge（`->`）が依存の循環を形成する。 |

### id の一意性

id は宣言 scope 内で一意であること。ownership は primary owner を高々 1 つに割り
当てる。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `duplicate-edge-id` | error | author 指定の edge id が別の edge id と衝突する。 |
| `duplicate-node-id-parent` | error | node id が直近の親の中で重複する。 |
| `duplicate-node-in-system` | error | node id が `system` 内で重複する。 |
| `duplicate-node-in-deploy` | error | node id が `deploy` ブロック内で重複する。 |
| `duplicate-team-id` | error | team id が重複する。 |
| `duplicate-team-in-organization` | error | team id が `organization` 内で重複する。 |
| `duplicate-resource-operation` | warning | 1 つの resource に CRUD verb が複数回並ぶ。 |
| `duplicate-crud-decoration-target` | warning | CRUD decoration が同じ operation を複数回対象にする。 |
| `duplicate-owner-assignment` | info | node が複数の team に owned として割り当てられる（事実。[ADR-20260615-01](../adr/20260615-01-ownership-during-migration.md) 参照）。 |
| `node-id-multiple-locations` | warning | 同じ node id が複数の場所に現れる。 |

### cross-reference 解決（warn-don't-error, §S6）

参照された id は宣言済み node に解決されること。解決できない場合、参照元 node は
保存し、未解決の関係を報告する（致命的エラーにはしない）— syntax spec §S6 参照。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `owns-target-not-found` | warning | team が存在しない service / domain を `owns` する。 |
| `invalid-owns` | warning | `owns` 先が所有できない種別に解決される。 |
| `import-id-not-found` | error | named import の id パスが解決できない。 |
| `import-path-not-found` | error | import パスがいずれかのセグメントで解決できない。 |
| `unresolved-edge-endpoint` | warning | edge の端点 id が merge 後のモデルのどこにも見つからない。 |
| `unresolved-handles` | warning | `handles` 対象の domain が one-hop expose 規則で到達できない。 |
| `unresolved-realizes` | warning | deploy node が論理層に無い対象を `realizes` する。 |
| `legend-ref-unresolved` | warning | `legend` の `ref` がどのスタイル規則にも node にも一致しない。 |
| `cross-system-ref-unresolved` | warning | cross-system edge（`Sys.Svc`）の対象が見つからない。 |
| `cross-system-ref-implicit-external` | warning | cross-system edge が `[external]` 未付与の system に跨る。 |
| `delivers-target-not-client` | warning | `delivers` の対象が `client` node でない。 |

### infra の単一宣言・fan-in

infra node は 1 度だけ宣言される。複数 service から参照される store は surface
する価値のある事実。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `infra-redeclared-across-files` | info | 同じ `database` / `queue` / `storage` id が複数の merge 対象ファイルで宣言される。 |
| `infra-leaf-redeclared-silently` | info | `table` / `queue-item` / `bucket` の leaf が親 infra 内で再宣言される。 |
| `shared-infra-fan-in` | info | 2 つ以上の service が 1 つの system 内で同じ store に依存する（欠陥ではなく事実）。 |

### CRUD decoration の文法

resource への operation / CRUD decoration の文法。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `invalid-crud-decoration` | error | CRUD decoration が認識されない verb / letter を使う。 |
| `empty-crud-decoration` | warning | `verb:` decoration の右辺が空。 |
| `unknown-resource-operation` | warning | resource operation の verb が create / read / update / delete のいずれでもない。 |

### 割り当てと凝集

構造 node が owner / 親に割り当てられているか、domain と deploy 対象の配線に関する
凝集の事実。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `unassigned-service` | warning | service が team 割り当てなしにトップレベルに置かれる。 |
| `unassigned-domain` | warning | domain が team 割り当てなしにトップレベルに置かれる。 |
| `unassigned-usecase` | warning | usecase が domain の親なしに service の直接の子になる。 |
| `unassigned-client` | warning | client が team 割り当てなしにトップレベルに置かれる。 |
| `unassigned-database` | warning | database が team 割り当てなしにトップレベルに置かれる。 |
| `unassigned-queue` | warning | queue が team 割り当てなしにトップレベルに置かれる。 |
| `unassigned-storage` | warning | storage が team 割り当てなしにトップレベルに置かれる。 |
| `unassigned-resource` | warning | resource が dot-notation の割り当てなしにインラインで宣言される。 |
| `domain-dispersal` | info | 1 つの domain id が scope 内の複数 service にまたがる（事実）。 |
| `missing-realizes` | info | deploy node に `realizes` プロパティが無い。 |
| `missing-runtime` | info | deploy node に `runtime` プロパティが無い。 |

### annotation・lifecycle

annotation パラメータと、削除・非推奨になったプロパティ。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `annotation-param-unsupported` | warning | annotation のパラメータ key がその annotation で認識されない。 |
| `annotation-possible-typo` | info | annotation 名が builtin の near-match（typo の示唆）。 |
| `team-property-removed` | error | 削除済みの `team` プロパティが使われる（[ADR-20260614-01](../adr/20260614-01-remove-team-property.md) 参照）。 |

### import とファイル

`import` 宣言とスタイル import をファイルシステムに対して解決する。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `circular-import` | warning | node `import` が循環を形成する。 |
| `circular-style-import` | warning | スタイル import が循環を形成する。 |
| `file-not-found` | error | import されたファイルが存在しない。 |
| `directory-not-found` | error | import されたディレクトリが存在しない。 |
| `style-file-not-found` | warning | import されたスタイルファイルが存在しない。 |

### スタイル検証

`.krs.style` のプロパティ名と値を検証する。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `style-unknown-property` | warning | スタイルのプロパティ名が認識されない。 |
| `style-invalid-enum-value` | error | スタイル値が許可された enum に無い。 |
| `style-invalid-hex-color` | error | スタイルの hex color が不正。 |
| `style-invalid-length-unit` | error | スタイルの length が許可されない単位を使う。 |
| `style-missing-length-unit` | error | スタイルの length に必要な単位が無い。 |
| `style-out-of-range` | error | スタイルの数値が min / max の範囲外。 |
| `style-token-type-mismatch` | error | スタイルの token が期待された型と一致しない。 |
| `expected-style-property-name` | error | スタイルパーサがプロパティ名を期待した。 |
| `expected-semicolon-between-properties` | error | スタイルパーサがプロパティ間の `;` を期待した。 |
| `unknown-edge-selector-attribute` | error | エッジセレクタが `from` / `to` 以外の属性を使っている（例: `edge[source=X]`）。 |
| `style-conflict` | warning | セレクタが複数のユーザースタイルシートで定義される。 |
| `style-column-invalid-value` | warning | スタイル `column` 値が `left` / `center` / `right` でない。 |
| `style-column-ignored-non-system-view` | warning | `column` ヒントが deploy / org ビューに適用される（無視）。 |
| `style-grid-columns-invalid-value` | warning | スタイル `grid-columns` 値が正の整数でない（ヒントは破棄され、レイアウトは自動バランスにフォールバック）。 |

### client・capability

`client` サブ言語: storage kind と capability。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `client-resource-invalid-kind` | error | client の `resource` storage kind が予約値のいずれでもない。 |
| `client-capability-duplicate` | warning | client が同じ capability 名を 2 度宣言する。 |

### 構文・パースレベルのエラー

token が妥当な構文を成さないときに上がる低レベルのパーサエラー。本質的にメカニズム
レベルであり、「規則」は文法そのもの。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `token-type-mismatch` | error | token がパーサの期待した型と一致しない。 |
| `unexpected-token-root` | error | root レベルに予期しない token。 |
| `unexpected-token-in-block` | error | ブロック内に予期しない token。 |
| `expected-brace-or-string` | error | パーサが `{` か string literal を期待した。 |
| `expected-identifier` | error | パーサが identifier を期待した。 |
| `expected-string-after` | error | パーサがプロパティ keyword の後に string を期待した。 |
| `expected-id-or-string` | error | パーサが id か string を期待した。 |
| `expected-node-id` | error | パーサが node id を期待した。 |
| `expected-property-value` | error | パーサがプロパティ値を期待した。 |
| `expected-id-after` | error | パーサがプロパティ keyword の後に id を期待した。 |
| `invalid-node-kind` | error | node kind の keyword が認識されない。 |
| `property-not-for-node-kind` | error | プロパティがその node kind に対して妥当でない。 |
| `link-url-scheme-not-allowed` | warning | `link` URL の scheme が許可集合（http / https / mailto）に無い。 |

### アプリケーションレベルのフォールバック

throw された compile / parse エラーを app が包むときに使う合成コード。

| Code | Severity | 発火条件 |
| --- | --- | --- |
| `app-project-compile-error` | error | `compile()` が throw し、app が汎用の compile 失敗を報告する。 |
| `app-org-parse-error` | error | org パースが throw し、app が汎用の parse 失敗を報告する。 |
| `generic-text` | error | 構造化パラメータを持たない、事前生成のフォールバックメッセージ文字列。 |

## カタログの完全性

`DiagnosticParamsByCode` と `WarningKind`（`packages/core/src/types`）の全メンバーは、
本書に `code` として現れなければならない。meta-test
（`packages/core/src/types/diagnostics-catalog.test.ts`）が双方向でこれを assert
するため、カタログが emit されるコードから無言で drift することはない。背景の規律は
[TPL-20260616-02](../test-perspectives/TPL-20260616-02-diagnostics-catalog-completeness.md)
に記録する。

> Related TPLs: [TPL-20260616-02](../test-perspectives/TPL-20260616-02-diagnostics-catalog-completeness.md)（カタログ ↔ コードの完全性）, [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)（事実 vs 流派の register）, [TPL-20260610-02](../test-perspectives/TPL-20260610-02-spec-promised-diagnostics-implemented.md)（spec が約束する診断は実装されている）, [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（spec ↔ source-of-truth 同期）.
</content>
