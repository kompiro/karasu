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
- **すべてのコードは短い ID**（`KRS001` など）を `ID` 列に持つ。表示する面が診断の
  そばに ID を出す（*CLI での表示* を参照）ので、locale によらず行から表の行を
  引ける。ID は人のための別名で、ツールは `code` で判定する。1 つの ID は 1 つの
  コードを指し続ける。廃止したコードの ID は *廃止した ID* に残し、別のコードに
  振り直さない。
- `発火条件` 列に具体的なトリガを記す。severity は core が emit する値。面によって
  severity が変わるコード（`lint-style` は error、`render` は warning で出す style の
  値の検査）は面ごとに書く。ID は 1 つである。

## register と severity

診断は **severity** を持つ: `error` / `warning` / `info`。

- `error` — モデルを書かれたとおりには受理できない。言語が拒否する構文（parser が
  該当構文をモデルから除く。例: `node-not-in-context`）か、import 先の欠落や id の
  重複のようなプロジェクト単位の不備である。原因によらず、error が 1 件でも立って
  いる間は**どの surface も新しい図を出さない**。app と VS Code の
  プレビューは同じビューの直前の有効な図を出し続け、`karasu render` /
  `karasu subtree` は何も書かずに exit 1、share・`serve`・nest の描画エンドポイントは
  422 を返す。error を直すと描画が再開する。
- `warning` — 著者が直すべき実際の欠陥（dangling な参照、スタイル衝突など）。
- `info` — 欠陥ではなく **事実**。外部の流派が smell と呼びうる構造（共有
  database、領域分散など）を、誤りと断じずに surface する。これが *事実 vs 流派*
  の register 区別である — [TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md) を参照。

karasu は未解決参照に対し **warn-don't-error**（spec §S6）に従う。未解決の関係は
落とすが、参照元の node は保存し、レンダー全体を失敗させずに warning として報告
する。これは参照についての方針であり、構文の書き方を受理するかどうかは別の問題で
ある。言語が拒否する書き方は `error` になる
（[ADR-2208](../adr/2208-positional-label-error-promotion.md)、
[ADR-2501](../adr/2501-errored-edge-declaration-renders-nowhere.md)）。

## ソース位置

診断はソース位置（`loc`）を持つことがある。開始位置と終了位置、およびそれらが
指す文書からなる。

- **位置は 1 始まり。** `line` と `column` は、著者がエディタで見るとおり 1 から
  数える。別の基準が要る表示面は、自分の境界で 1 度だけ変換する（LSP の 0 始まりの
  range）。位置を印字するツールは数値をそのまま印字する。
- **`file` は位置が指す文書を名指す。** プロジェクトは複数ファイルにまたがる。
  import 先ファイルの診断や、マージ後のモデルで判定される診断（*id の一意性* の
  cross-file 多重判定、*cross-reference 解決* の参照判定）は、その構文を宣言した
  ファイルに anchor する。それはエントリとは限らない。プロジェクトを解決する
  過程で生じる診断は、`loc` を持つかぎり必ず `file` を絶対パスで持つ。
  `.krs.style` の診断はシートを名指す。
- **`file` が無いときは、消費者自身の文書として読む。** これが生じるのは単一文書の
  文脈だけである。LSP は開いている文書を 1 つずつ parse し、`karasu lint-style` は
  シートを 1 つ読み、`compile` はモデルをソーステキストで受け取る。そうした compile が
  スタイルシートもテキストで受け取ると、どちらの文書にもパスが無いので、シートの
  parse 診断はそこでは `loc` を持たない（モデルの位置として読まれる位置を持たせない）。
- **`loc` を持たない診断は位置を名指さない。** 見つからないファイルに関する診断は、
  代わりにそのパスをメッセージに含む（`file-not-found`、`style-file-not-found`）。
  宣言ではなく id を名指すマージ時の事実（`infra-redeclared-across-files`、
  `system-property-conflict` など）はどちらも持たない。

各表示面は位置を次のように印字する。

| 表示面 | 表示する位置 |
| --- | --- |
| CLI（`karasu render` と、そのエラー報告を共有するコマンド） | `<file>:<line>:<column>`。位置に `file` が無いか、`file` がエントリである（正規化したパスで比べる）ときは、ユーザーが打った綴りのエントリ。それ以外はそのファイルを作業ディレクトリからの相対パスで示す。 |
| CLI（`karasu diff`） | 診断は `<line>:<column>`。両方の入力から来るのでファイルは付けない。warning は after のモデルのものだけなので、after の entry を entry として `karasu render` と同じ規則で表記する: entry はユーザーが打った綴り（stdin から読んだときは `-`）、それ以外のファイルは作業ディレクトリからの相対パス。 |
| app のプレビューバナーと warning パネル | 開いている文書の位置、または `file` の無い位置は UI ロケールの行ラベル（英語 `Line <line>`、日本語 `<line> 行目`）。それ以外のファイルは `<path>:<line>`。パスはプロジェクトルートからの相対パスで、プロジェクトの無いモードではエントリのディレクトリからの相対パスになる。比較中のスナップショットは、撮影元のプロジェクト上のパスで示す。 |
| LSP | 文書自身の range（0 始まり）。LSP は単一文書なので `file` は生じない。 |

> Related TPLs: [TPL-2715](../test-perspectives/TPL-2715-source-position-carries-its-document.md)（位置はそれが指す文書と対で初めてアドレスになる。parse が range を作る場所でファイルを載せ、各表示面はそこから読む）。

## CLI での表示

人は行を読み、スクリプトとエージェントは JSON を読む。

**行。** カタログの診断を出す行は、severity の語の直後にコードの ID を角括弧で
置く:

```text
Error[KRS012]: index.krs:5:1: A top-level user is not allowed (declare it inside a system block)
Warning[KRS041]: index.krs:3:3: Edge "A → Ghost" references unknown node "Ghost"; the edge is dropped (the resolved endpoint is kept)
theme.krs.style:1:18 error[KRS086]: Invalid hex color ...
```

- ID は locale によらず同じである。下の表の `ID` 列で引く。
- 行のそれ以外はコマンドごとの形のまま変えない。位置（*ソース位置* を参照）、
  severity の語の位置と綴り、locale に従うメッセージである。
- ID の無い行はカタログの診断ではない。引数についての通知、`translate` の警告、
  `karasu fmt` の `Cannot format: ...` がこれに当たる。
- 行は人向けである。形はマイナーリリースで変わりうる（CHANGELOG で知らせる）ので、
  スクリプトは行を解析しない。

**JSON。** `karasu check <file> --format json` は、同じ診断を 1 つの JSON として
stdout に出し、カタログの行を stderr に出さない:

```json
{
  "schemaVersion": 1,
  "errorCount": 0,
  "diagnostics": [
    {
      "id": "KRS041",
      "code": "unresolved-edge-endpoint",
      "severity": "warning",
      "file": "index.krs",
      "line": 3,
      "column": 3,
      "params": { "from": "A", "to": "Ghost", "unresolvedId": "Ghost" },
      "message": "Edge \"A → Ghost\" references unknown node \"Ghost\"; the edge is dropped (the resolved endpoint is kept)",
      "details": []
    }
  ]
}
```

- `diagnostics` は行と同じ順に並ぶ。`id`、`code`、`severity`、`params`、
  `message`、`details` は必ずある。`code` は `DiagnosticParamsByCode` のキーか
  `WarningKind` のメンバーで、`params` はそのコードの型に従う。どちらも locale に
  よらない。`message` と `details` は locale に従う。`details` はテキストの行に出ない補足
  （ストアを共有するサービスなど）で、無ければ `[]` である。判定は `code` で行い、`id` や `message` では行わない。
- `file` は、行がファイルを示すときにある。位置を持つ診断と、位置を持たない
  `Diagnostic`（入口のファイルを示す）である。`line` と `column` は位置を持つときに
  ある。位置を持たない `Warning` には 3 つとも無い。`file` の綴りは行と同じ。
- `errorCount` は error の件数である。終了コードはテキストのときと同じで、読める
  JSON と `1` はモデルに error があること、読める JSON と `0` は無いことを表す。
- カタログの外の失敗（ファイルが無い、未知のフラグ、想定外の例外）では JSON を
  出さず、stderr に行を出して 0 以外で終わる。消費者は、stdout が JSON として
  読めないか `schemaVersion` が知らない値なら、「診断が 0 件」と読まずに止まる。
- フィールドを足しても `schemaVersion` は変えない。フィールドを消す・意味を変える
  （`params` のキーを含む）ときは上げる。

> Related TPLs: [TPL-3654](../test-perspectives/TPL-3654-cli-diagnostics-carry-stable-code.md)（人にはすべての面で短い ID を、機械には JSON のコードを出し、skill はコードで判定する）。

## 規則ファミリー

### 宣言・edge の配置・構造

何をどこに宣言できるか、edge の起点が何でありうるか。`service` / `domain` ブロック
内に書いた edge はそのブロックの id を起点にする。infra ブロックと `legend` は配置
が固定。sync edge は循環してはならない。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `edge-source-mismatch` | KRS001 | error | `service` / `domain` / `entity` ブロック内の explicit な edge source が所属ブロック id と一致しない（**edge origin scope** 規則。`entity` では関連の向き — 起点 = 参照を保持する側 — を強制する）。 |
| `edge-endpoint-not-at-scope` | KRS002 | warning | edge を宣言したスコープから届かない endpoint（**edge endpoint scope** 規則）。**bare** の endpoint は宣言ブロックの peer でなければならない — 例: `service` 配下の `domain` である `A`・`B` を `system` スコープで `A -> B` と書いた場合。source のブロック内に書くか、cross-domain の entity 参照は限定子付きにする。**qualified** の endpoint はトップレベル root を起点に anchor されていなければならず（`system` から対象までの path を丸ごと綴る）、メッセージは anchor された綴りを示し、参照先が宣言されている場所を伝える。`entity` ブロック内の**限定子付きの**関連は対象外 — entity ビューが自身の pool で解決し、外部 entity を ghost として描く。どこにも解決しない id は対象外（bare は `unresolved-edge-endpoint`、`system` スコープの edge の dotted は `cross-system-ref-unresolved` が担当（先頭のセグメントがその system の `[external]` の子なら報告しない）。`service`・`domain`・`entity` の中の dotted は、いまは報告されない。[#3655](https://github.com/kompiro/karasu/issues/3655)）。bare の `domain` → `domain` は暗黙の service edge に集約されて描画されるため除外。 |
| `edge-target-ambiguous` | KRS003 | warning | qualified な edge endpoint が、スコープの届く範囲の中で (kind, 深さ) の**揃わない**複数ノードに一致した（#2088 共通の判別子。揃った多重一致は意図された broadcast として沈黙する）。メッセージは候補の full path を列挙し、さらに修飾して絞り込めるよう促す。bare は ambiguity を出さない — peer 束縛を維持しており、そこでの多重一致は既存の broadcast であって新しい問いではない。 |
| `ambiguous-edge-base` | KRS004 | warning | 同じ `from → to` の base を持つ edge が複数あり、識別する author id が無い。 |
| `duplicate-edge-label` | KRS005 | error | エッジが label を 2 回書いている（位置引数 `A -> B "calls"` と property block 内の `label` プロパティの両方）。どちらかを黙って勝たせることはしないので、片方に寄せる。 |
| `service-outside-system` | KRS006 | warning | `service` が `system` の外で宣言されている。 |
| `infra-not-in-context` | KRS007 | error | infra ブロック（`database` / `queue` / `storage`）が `system` の直接の子でない。 |
| `boundary-not-in-context` | KRS008 | error | 自身のキャンバスを持たない kind（`entity` / `resource` / `user` / `client` / infra leaf）の中に `boundary` ブロックが宣言されており、囲む対象が存在しない。 |
| `entity-not-in-domain` | KRS009 | error | `entity` が `domain` の子以外の場所で宣言されている。 |
| `node-not-in-context` | KRS010 | error | 論理ノードが、その親の **含められるもの** 列に載っていない入れ子で宣言されている（例: `service` 直下の `usecase`）。ノードは subtree ごとモデルから除かれる。後続は通常どおりパースされ、そのノードへの参照は §S6 で報告される。言語 v1.x ではノードを保持する warning だったが、`.krs language v2.0` から error（[#2924](https://github.com/kompiro/karasu/issues/2924)）。 |
| `legend-not-top-level` | KRS011 | error | `legend` ブロックがトップレベル以外で宣言されている。 |
| `top-level-declaration` | KRS012 | error | `user` またはエッジが `system` ブロック内ではなくトップレベルで宣言されている。 |
| `system-property-conflict` | KRS013 | warning | merge された import 間で `system` の `label` / `description` が衝突する。 |
| `cyclic-dependency` | KRS014 | warning | sync edge（`->`）が依存の循環を形成する。 |

> Related TPLs: [TPL-2542](../test-perspectives/TPL-2542-sugar-form-shares-one-ast-and-element-ranges.md)（同じ意味を 2 通りで書けるようにしたら、両形が同一 AST に落ちること・二重記述に専用の診断があることを同じ PR で固定する。`duplicate-edge-label` はその診断側）。

### id の一意性

id は宣言 scope 内で一意であること。ownership は primary owner を高々 1 つに割り
当てる。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `duplicate-edge-id` | KRS015 | error | author 指定の edge id が別の edge id と衝突する。 |
| `duplicate-node-id-parent` | KRS016 | error | node id が直近の親の中で重複する（1 つの `domain` 配下で `usecase` と `entity` が同じ id を持つケースも含む）。 |
| `entity-anchor-collision` | KRS017 | warning | `entity` deep-link の名前空間（{全 domain id} ∪ {全 entity id}）で id が複数のターゲットに使われている — entity id が複数 domain にまたがって重複、または entity id が domain id と一致。deep-link の解決が曖昧になるが描画自体は成立する。 |
| `duplicate-node-in-system` | KRS018 | error | node id が `system` 内で重複する。 |
| `duplicate-node-in-deploy` | KRS019 | error | node id が `deploy` ブロック内で重複する。 |
| `duplicate-team-id` | KRS020 | error | team id が重複する。 |
| `duplicate-team-in-organization` | KRS021 | error | team id が `organization` 内で重複する。 |
| `duplicate-resource-operation` | KRS022 | warning | 1 つの resource に CRUD verb が複数回並ぶ。 |
| `duplicate-crud-decoration-target` | KRS023 | warning | CRUD decoration が同じ operation を複数回対象にする。 |
| `duplicate-owner-assignment` | KRS024 | info | node が複数の team に owned として割り当てられる（事実。[ADR-1566](../adr/1566-ownership-during-migration.md) 参照）。 |
| `duplicate-boundary-assignment` | KRS025 | info | node が複数の `boundary` に所属する（事実。所属は 1:N — ビュー側の解決規則は [syntax.ja.md](syntax.ja.md) を参照）。 |
| `boundary-membership-not-drawn` | KRS026 | info | Group by: boundary で、非メンバーを覆わずに boundary の枠をメンバーまで広げられなかったため、その所属をカード上の `◇` タブで示した。model の事実を述べる `duplicate-boundary-assignment` と違い、**この描画**が何をしたかを述べる。したがって位置情報を持たず、この軸でのみ出る。 |
| `duplicate-boundary-id` | KRS027 | error | 同じ親ノード内の 2 つの `boundary` ブロックが同じ id を宣言しており、2 つ目を指し示せない。top-level のブロックは対象外。 |
| `duplicate-facet-id` | KRS028 | error | 2 つの `facet` ブロックが同じ id を宣言しており、`facets` の参照がどちらのメタデータを指すか決まらない。マージ後のモデルで判定するのでファイルをまたぐ重複も検出する。参照が解決するのは最初の宣言。 |
| `positional-label-removed` | KRS029 | error | `boundary` / `facet` / `organization` / `team` / `member` の id 直後にラベル文字列が置かれている。ADR-19 で `label` はプロパティ化されており、位置ラベル記法は spec に存在しない。experimental な `boundary` / `facet` は deprecation を挟まず削除し（#2133）、残りは deprecation を経て削除した（#2208）。復帰動作は異なり、`boundary` / `facet` は文字列を捨てるが、`organization` / `team` / `member` は label として保持し、修正されるまで組織図が読める状態を保つ。 |
| `node-id-multiple-locations` | KRS030 | warning | 同じ id を持つ論理層ノード（`service` / `domain` / `client`）が異なるパスに複数宣言されている。warning は宣言順にもファイルの分け方にも依存しない（parse 経路はそのファイルで判定し #2550、project 経路はマージ後のモデルで判定し直す #2596。ブロックを別ファイルへ移しても沈黙しなくなった）。マージ後のモデルで判定することは同時に限界でもあり、判定の対象はモデルに到達した宣言に限られる。named import が持ち込まなかった部分に閉じた衝突は project では報告しない（そこでは描画も航法もされないため。エディタは per-file で報告し続ける）。1 つの宣言は、それを運ぶ merge 経路が何本あっても 1 件と数える。同じファイルを wildcard と named の両方で import した場合や、1 つの service が edge 参照で 2 つの system に載る場合は衝突ではない。論理層と物理層（`database` / `queue` / `storage` とその子リソース）の間の同名、および物理層内の同名は許容して沈黙する（物理参照は `resource OrderDB.users` のように dot 修飾されるため）。domain 同士の多重は対象外（`domain-dispersal`（info）の領分）。同一の親の下での id 重複は `duplicate-node-id-parent`（error）に譲るが、top-level の同名はそれを報告する親スコープが無いため、parked な `service X` と `client X` の組はこちらで報告する。`nodePathIndex` は id ごとに勝者 1 つを保持する: `@migration_target` 優先（infra の子はブロックのアノテーションを継承）、同点は traversal 順（systems → top-level の domains / services / clients → top-level infra。ファイルをまたぐ場合はマージ後のモデルの順、すなわち entry ファイル自身の宣言の後に import されたものが続く）で最初の宣言。したがって candidate の priority が異なる場合、すなわち本来の用途である移行共存のケースでは entry はファイルの分け方に依存しない。priority が同点のときだけ import グラフに従うので、無印の宣言 2 件はファイルを入れ替えると勝者も入れ替わる。負けた論理層の宣言ごとにその位置で warning が 1 つ出る。複数 system のルートビューは**すべての**宣言を描く（#2917）。各カードは bare の `data-node-id` を保ったまま `data-node-path`（`Shop.Api`）を足すので、クリックはそのカード自身のノードにドリルし、そのノードを説明する。bare id だけを運ぶ hand-over（ハイライト・アウトライン・permalink）は index の勝者か、一致する最初の要素に着く。静的ドリルダウンバンドルは id ごとに `#krs-system-<id>` / `#krs-entity-<id>` のレベルを index の勝者について 1 つだけ出すので、その anchor は app と同じノードを開く。勝者でない同名のカードはリンクを持たずに描かれる（#2933）。 |

> Related TPLs: [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（1:1 index の勝者規則は index 間で一貫させる。`node-id-multiple-locations` の勝者規則もその一つ）、[TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md)（2 ファイルに分かれた重複はどちらのファイルからも見えないので、判定とそれが説明する index はマージ後のモデルで 1 度だけ導出する）。

### cross-reference 解決（warn-don't-error, §S6）

参照された id は宣言済み node に解決されること。解決できない場合、参照元 node は
保存し、未解決の関係を報告する（致命的エラーにはしない）— syntax spec §S6 参照。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `owns-target-not-found` | KRS031 | warning | team が、マージ後のモデルでどのノードも指さない id を `owns` する。kind と深さは問わないため、宣言済みの `user` や `entity` はここでは「見つかる」扱いで、kind による拒否は `invalid-owns` が行う。`capability` はノードではなくプロパティなのでどのノードにも解決せず、ここで報告される。マージ後のツリーから導出するため、判定は import の書き方にも宣言位置にも依存しない。import 結合の診断であり、未解決の import が残るドキュメントでは判定しない（LSP の単一ドキュメント文脈では沈黙し、App / CLI がマージ後モデルで判定する）。 |
| `invalid-owns` | KRS032 | warning | `owns` 先が**ノードに解決され**、その kind が所有できない。メッセージはその kind を名指す。どのノードにも解決しない id は本診断の担当ではなく `owns-target-not-found` が報告するため、1 つの誤りに対して出るのは 2 つのうち必ず一方だけ。その結果として import 結合になる: 単一ドキュメント文脈では cross-file の対象は何にも解決しないため何も報告しない。所有できる kind は `service` / `domain` / `client` と infra ブロック（深さは問わない。`OWNS_TARGET_KINDS`。これを読むのは本診断だけで、存在検査は kind を問わない）。infra leaf（`table` / `queue-item` / `bucket`）と `capability` は存在はするが所有の単位ではないため、それらを弾くのは本診断の担当。なお system view の**カード**に team チップが出るのは論理 kind だけだが、所有された infra も *Group by: team* のフレーム（id で解決）と org view には現れる。 |
| `contains-target-not-found` | KRS033 | warning | import 結合の診断であり、未解決の import が残るドキュメントでは判定しない（member が import 先で宣言されている場合があり、スコープ内 `contains` が名指す子は cross-file の `system` 再オープンで後から増えうる）。それ以外の場合: `boundary` の `contains` 先が存在しない — top-level ブロックはマージ後の system 階層のどこにも無い場合（存在検証は per-file でなく cross-file マージ後）、スコープブロックは宣言ノードの直下の子に無い場合（照合はノード参照 path 記法の接尾辞規則）。 |
| `owns-target-ambiguous` | KRS034 | warning | `owns` の参照（接尾辞 path。bare id を含む）が **(kind, 深さ) の揃っていない** 2 つ以上のノードに解決される。揃っている多重一致は意図的な broadcast（移行共存・マルチテナント）であり沈黙する。メッセージは各候補の full path を列挙し、著者はより長い path で修飾して 1 つに絞れる。`owns-target-not-found` と同じく import 結合: マージ後モデルでのみ判定する。 |
| `contains-target-ambiguous` | KRS035 | warning | `owns-target-ambiguous` の `contains` 版（top-level `boundary` 用）: kind または深さの混在する多重一致を候補 full path つきで報告する。揃っている多重一致は broadcast として沈黙。スコープ形では構造的に到達不能（member は sibling 一意な直下の子に解決される）。import 結合: マージ後モデルでのみ判定する。 |
| `realizes-target-ambiguous` | KRS036 | warning | `realizes` の参照（接尾辞 path。bare id を含む）が realizable な kind（service / domain / client / infra ブロック）の 2 つ以上のノードに解決され、(kind, 深さ) が揃っていない。候補は full path で列挙する。揃っている多重一致は沈黙。存在検査は `unresolved-realizes` の担当。import 結合: マージ後モデルでのみ判定する。 |
| `import-target-ambiguous` | KRS037 | warning | 複数セグメントの `import { … }` エントリが接尾辞規則で (kind, 深さ) の揃わない 2 つ以上のノードに一致した。一致はすべて import される（bare id の import は元々 broadcast）。warning が候補 full path を列挙し、著者は path 修飾で絞れる。 |
| `facet-not-declared` | KRS038 | warning | `facets` の参照先の `facet` ブロックが宣言されていない（存在検証はマージ後のモデルで行うので、import 先の宣言も有効）。near-miss の annotation ヒントと違い、宣言集合が「正」を与えるためこの検査は完全で、著者定義の名前どうしの取り違えも検出する。報告位置は参照を書いた要素（ノードまたはエッジ）の宣言位置で、`facets` の行そのものではない — 他の要素単位の診断と同じ範囲になる。名指しはノードなら node id、エッジなら（エッジ自身の id が無いので）canonical base 形（`A-->B`）で、これは `edge#<id>` が同じエッジを指すのと同じ綴り。 |
| `import-id-not-found` | KRS039 | error | named import の id パスが解決できない。 |
| `import-path-not-found` | KRS040 | error | import パスがいずれかのセグメントで解決できない。 |
| `unresolved-edge-endpoint` | KRS041 | warning | edge の端点 id が merge 後のモデルのどこにも見つからない。 |
| `unresolved-handles` | KRS042 | warning | `handles` 対象の domain が one-hop expose 規則で到達できない。参照はノード参照 path で、system 直下の子のさらに直下にある `domain` を対象に解決し、警告は参照そのものに anchor する（`handles A, B` の片方だけが失敗しうる）。`owns` / `contains` / `realizes` と違い `handles` に `*-target-ambiguous` は無い: この対象集合では候補がすべて同じ深さの `domain` なので多重一致は構造上つねに揃っており（マルチテナントの broadcast）、より長い path で修飾するという対処が成立しないため。対象集合の外にある domain を名指した参照は ambiguity ではなく本コードで報告する。 |
| `unresolved-realizes` | KRS043 | warning | deploy node が論理層に無い対象を `realizes` する。 |
| `legend-ref-unresolved` | KRS044 | warning | `legend` の `ref` がどのスタイル規則にも node にも一致しない。 |
| `cross-system-ref-unresolved` | KRS045 | warning | cross-system edge（`Sys.Svc`）の対象が見つからない。 |
| `cross-system-ref-implicit-external` | KRS046 | warning | cross-system edge が `[external]` 未付与の system に跨る。 |
| `delivers-target-not-client` | KRS047 | warning | `delivers` の対象が `client` node でない。 |
| `unresolved-resource-ref` | KRS048 | warning | dot 記法の `resource <Infra>.<Leaf>` が、merge 後のモデルに宣言されていない infra ブロック、または宣言されていない leaf を指している。どちらが欠けているかをメッセージに出す — 修復が異なるため（ブロックごと欠けていれば `database` / `queue` / `storage` 宣言そのものの喪失、leaf だけなら sub-resource の欠落）。`[external]` の resource は `unassigned-resource` と揃えて対象外。import-coupled — 共有 infra は各スライスが import する専用ファイルで宣言するのが正準形（§S4.5）なので、単一ドキュメントでは判定しない。 |
| `unresolved-table-ref` | KRS049 | warning | `entity` の `table <Infra>.<Leaf>` が未宣言のブロック / leaf を指している。`missing` の区別・`[external]` 除外・import-coupling は `unresolved-resource-ref` と同じ。`table` を **持たない** entity は正当な状態（forward design、read-model projection、KV backed）なのでここでは一切報告しない — 数えるのは `karasu coverage` の役割。 |

### infra の単一宣言・fan-in

infra node は 1 度だけ宣言される。複数 service から参照される store は surface
する価値のある事実。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `infra-redeclared-across-files` | KRS050 | info | 同じ `database` / `queue` / `storage` id が複数の merge 対象ファイルで宣言される。2 つ目の宣言をどの import 形が持ち込んだかに依らず報告する（ファイル全体の import でも、path が当該ブロックを根とする named entry `import { UserDB.users }` でも同じ）。1 つの宣言を 2 つの entry で名指した場合は reopen ではなく 1 回の import として扱う。 |
| `infra-leaf-redeclared-silently` | KRS051 | info | `table` / `queue-item` / `bucket` の leaf が親 infra 内で再宣言される。 |
| `shared-infra-fan-in` | KRS052 | info | 2 つ以上の service が 1 つの system 内で同じ store に依存する（欠陥ではなく事実）。 |
| `cross-domain-store-access` | KRS053 | info | ある domain の usecase が、別の domain が所有する infra leaf を読み書きする（1 system 内。欠陥ではなく境界越えの事実）。所有は `entity` マッピングから導出、leaf 粒度で判定、`[external]` と役割タグ付き（`[index]` / `[cache]` / `[analytics]`）の store は除外。`shared-infra-fan-in` とは直交。 |

### CRUD decoration の文法

resource への operation / CRUD decoration の文法。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `invalid-crud-decoration` | KRS054 | error | CRUD decoration が認識されない verb / letter を使う。 |
| `empty-crud-decoration` | KRS055 | warning | `verb:` decoration の右辺が空。 |
| `unknown-resource-operation` | KRS056 | warning | resource operation の verb が create / read / update / delete のいずれでもない。 |

### 割り当てと凝集

構造 node が owner / 親に割り当てられているか、domain と deploy 対象の配線に関する
凝集の事実。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `unassigned-service` | KRS057 | warning | service が team 割り当てなしにトップレベルに置かれる。 |
| `unassigned-domain` | KRS058 | warning | domain がどの service にも割り当てられていない（トップレベル、または `system` 直下に置かれている）。2 つの配置は同じモデリング状態を表すため両方で発火する（[#2184](https://github.com/kompiro/karasu/issues/2184)）。`(Unassigned)` 擬似 system に包まれるのはトップレベル形のみ。 |
| `unassigned-client` | KRS059 | warning | client が team 割り当てなしにトップレベルに置かれる。 |
| `unassigned-database` | KRS060 | warning | database が team 割り当てなしにトップレベルに置かれる。 |
| `unassigned-queue` | KRS061 | warning | queue が team 割り当てなしにトップレベルに置かれる。 |
| `unassigned-storage` | KRS062 | warning | storage が team 割り当てなしにトップレベルに置かれる。 |
| `unassigned-resource` | KRS063 | warning | bare `resource <id>` がどのストアにも解決しない（dot-notation でも `[external]` でも一意な `entity` でもない）。parser ではなく resolver がモデル全体で判定するため、一致する `entity` が宣言されると編集ゼロで昇格し警告は消える。曖昧（一致する entity が複数）な bare id は未解決のまま残り、衝突自体は `entity-anchor-collision` が報告する。 |
| `domain-dispersal` | KRS064 | info | 1 つの domain id が scope 内の複数 service にまたがる（事実）。 |
| `missing-realizes` | KRS065 | info | deploy node に `realizes` プロパティが無い。 |
| `missing-runtime` | KRS066 | info | deploy node に `runtime` プロパティが無い。 |

### annotation・lifecycle

annotation パラメータ、削除・非推奨になったプロパティ、および閉じた tag /
annotation 語彙（`.krs language v2.0` はツール語彙のみを受理する。
[tags-annotations.ja.md](./tags-annotations.ja.md) 参照）。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `annotation-param-unsupported` | KRS067 | warning | annotation のパラメータ key がその annotation で認識されない。 |
| `annotation-param-value-unreadable` | KRS068 | warning | 認識される annotation パラメータの値が、文字列リテラル 1 つでも裸の語 1 つでもない（`until: 2026-12-31`、`from: system`、`from: Shop.Legacy`）。何も記録しない。描画は止まらない。AST を出力すると値が消えるため、`karasu fmt` はファイルを書き換えない。 |
| `annotation-param-conflict` | KRS069 | warning | 1 つの要素が同じ annotation パラメータに異なる 2 つの値を与えている（アノテーションを繰り返した場合も、1 つの中で繰り返した場合も）。最初の値を保ち、`karasu fmt` は最初の値を後の値に上書きして出力せず、ファイルを書き換えない。 |
| `duplicate-annotation` | KRS070 | warning | 同じ annotation が 1 つの要素に複数回書かれている。2 回目以降は効果を持たない。 |
| `annotation-possible-typo` | KRS071 | error | 非 builtin の annotation 名が builtin 名の綴り誤り（`@depracated`）である。4 文字以下の builtin なら 1 編集以内、それより長ければ 2 編集以内（隣接する 2 文字の入れ替えは 1 編集と数える）。annotation は適用されずモデルから除かれ、メッセージが builtin 名を示す。抑制条件なし。言語 v1.x では info のヒントだったが、`.krs language v2.0` から error になり、`annotation-not-builtin` とは排他になった。 |
| `tag-not-builtin` | KRS072 | warning | tag 名がツール語彙（builtin + system-assigned tag）の外にある。パースは通るが効果を持たない（`.krs language v2.0` は tag の register をツール語彙に閉じる）。抑制条件なし。 |
| `tag-not-applicable` | KRS073 | warning | 組み込み tag が適用範囲外の kind に書かれている（例: `service Api [index]` — `[index]` は `database` に適用）。その場所では効果を持たない。`tag-not-builtin` と同時には発火しない（builtin 外の名前には違反する適用範囲が無いため）。 |
| `annotation-not-builtin` | KRS074 | warning | annotation 名が builtin 集合の外にあり、builtin 名の綴り誤りでもない（綴り誤りは `annotation-possible-typo`）。パースは通るが効果を持たない。抑制条件なし。 |
| `style-tag-selector-not-builtin` | KRS075 | warning | `.krs.style` のセレクタがツール語彙の外の tag 名を狙っている（例 `[pci] { … }`）。そのルールは何にも一致しない（`.krs language v2.0`。v1.x までは適用されていた）。この warning がそれを知らせる唯一の手がかりである。facet セレクタ（`[facets=<id>]`）へ移行する。モデル側の `tag-not-builtin` とは独立にセレクタ単位で発火する（両者は別々の編集を指しており、片方だけ警告すると残った方が見つからない）。builtin テーマや注入された system sheet では発火しない。 |
| `style-annotation-selector-not-builtin` | KRS076 | warning | `.krs.style` のセレクタが builtin 集合の外の annotation 名を狙っている（例 `@canary { … }`）。契約は `style-tag-selector-not-builtin` と同じ。 |
| `team-property-removed` | KRS077 | error | 削除済みの `team` プロパティが使われる（[ADR-1564](../adr/1564-remove-team-property.md) 参照）。 |

### import とファイル

`import` 宣言とスタイル import をファイルシステムに対して解決する。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `circular-import` | KRS078 | warning | node `import` が循環を形成する。 |
| `circular-style-import` | KRS079 | warning | スタイル import が循環を形成する。 |
| `file-not-found` | KRS080 | error | import されたファイルが存在しない。 |
| `directory-not-found` | KRS081 | error | import されたディレクトリが存在しない。 |
| `style-file-not-found` | KRS082 | warning | import されたスタイルファイルが存在しない。 |

### スタイル検証

`.krs.style` のプロパティ名と値を検証する。著者のシートで下の error に当たる宣言は効かない: cascade がその宣言を外すので、弱いルールがそのプロパティに書いた値が効き、どのルールも書いていなければ既定が残る（[#3141](https://github.com/kompiro/karasu/issues/3141)）。karasu が同梱するシートは検証しない。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `style-unknown-property` | KRS083 | warning | スタイルのプロパティ名が認識されない。 |
| `style-unknown-icon` | KRS084 | warning | `shape: url("<name>")` がどの登録済みアイコンにも一致せず、ノードが `box` で描かれる。組み込みアイコンは core 自身が登録するので、どの描画面でも同じ結果になる（[TPL-2802](../test-perspectives/TPL-2802-core-registry-contents-do-not-depend-on-host.md)）。 |
| `style-invalid-enum-value` | KRS085 | error（`lint-style` / `tidy-style`）、warning（`render` / `check`） | スタイル値が許可された enum に無い。 |
| `style-invalid-hex-color` | KRS086 | error（`lint-style` / `tidy-style`）、warning（`render` / `check`） | スタイルの hex color が不正。 |
| `style-invalid-length-unit` | KRS087 | error（`lint-style` / `tidy-style`）、warning（`render` / `check`） | スタイルの length が許可されない単位を使う。 |
| `style-missing-length-unit` | KRS088 | error（`lint-style` / `tidy-style`）、warning（`render` / `check`） | スタイルの length に必要な単位が無い。 |
| `style-out-of-range` | KRS089 | error（`lint-style` / `tidy-style`）、warning（`render` / `check`） | スタイルの数値が min / max の範囲外。 |
| `style-token-type-mismatch` | KRS090 | error | スタイルの token が期待された型と一致しない。値の中（値として持てない token、空の値、空のカンマ項目）なら宣言は無視される。 |
| `expected-style-property-name` | KRS091 | error | スタイルパーサがプロパティ名を期待した。 |
| `expected-semicolon-between-properties` | KRS092 | error | スタイルパーサがプロパティ間の `;` を期待した。 |
| `unknown-edge-selector-attribute` | KRS093 | error | セレクタが `from` / `to` / `facets` 以外の属性を使っている（例: `edge[source=X]`）。コード名は `facets` より前からあるもので、`facets` は `edge` 限定ではなくノードセレクタでも受理される。 |
| `style-conflict` | KRS094 | warning | セレクタが複数のユーザースタイルシートで定義される。 |
| `style-column-ignored-non-system-view` | KRS095 | warning | `column` ヒントが deploy / org ビューに適用される（無視）。 |

> Related TPLs: [TPL-2802](../test-perspectives/TPL-2802-core-registry-contents-do-not-depend-on-host.md)（`style-unknown-icon` が引くシェイプレジストリの組み込みの中身は core 自身が埋めるので、判定はどの描画面でも同じになる）, [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（パーサが受理する値は効果か診断を持ち、黙って無視されることはない）, [TPL-3141](../test-perspectives/TPL-3141-style-diagnostic-describes-drawing.md)（値の範囲はスキーマ 1 か所にだけ置き、拒否した宣言は 1 回だけ外すので、診断が描画を説明する）。

### client・capability

`client` サブ言語: storage kind と capability。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `client-resource-invalid-kind` | KRS096 | error | client の `resource` storage kind が予約値のいずれでもない。 |
| `client-capability-duplicate` | KRS097 | warning | client が同じ capability 名を 2 度宣言する。 |

### 構文・パースレベルのエラー

token が妥当な構文を成さないときに上がる低レベルのパーサエラー。本質的にメカニズム
レベルであり、「規則」は文法そのもの。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `token-type-mismatch` | KRS098 | error | token がパーサの期待した型と一致しない。 |
| `unexpected-token-root` | KRS099 | error | root レベルに予期しない token。 |
| `unexpected-token-in-block` | KRS100 | error | ブロック内に予期しない token。 |
| `expected-brace-or-string` | KRS101 | error | パーサが `{` か string literal を期待した。 |
| `expected-identifier` | KRS102 | error | パーサが identifier を期待した。 |
| `expected-string-after` | KRS103 | error | パーサがプロパティ keyword の後に string を期待した。 |
| `expected-id-or-string` | KRS104 | error | パーサが id か string を期待した。 |
| `expected-node-id` | KRS105 | error | パーサが node id を期待した。 |
| `expected-property-value` | KRS106 | error | パーサがプロパティ値を期待した。 |
| `expected-id-after` | KRS107 | error | パーサがプロパティ keyword の後に id を期待した。 |
| `infra-path-too-long` | KRS108 | error | `table` 対応や `resource` 参照が `<Infra>.<Leaf>` の leaf より先に続く（3 段目、または leaf の後のドット）。 |
| `invalid-node-kind` | KRS109 | error | node kind の keyword が認識されない。 |
| `property-not-for-node-kind` | KRS110 | error | プロパティがその node kind に対して妥当でない。 |
| `link-url-scheme-not-allowed` | KRS111 | warning | `link` URL の scheme が許可集合（http / https / mailto）に無い。 |

### アプリケーションレベルのフォールバック

throw された compile / parse エラーを app が包むときに使う合成コード。

| Code | ID | Severity | 発火条件 |
| --- | --- | --- | --- |
| `app-project-compile-error` | KRS112 | error | `compile()` が throw し、app が汎用の compile 失敗を報告する。 |
| `app-org-parse-error` | KRS113 | error | org パースが throw し、app が汎用の parse 失敗を報告する。 |
| `generic-text` | KRS114 | error | 構造化パラメータを持たない、事前生成のフォールバックメッセージ文字列。 |

## カタログの完全性

`DiagnosticParamsByCode` と `WarningKind`（`packages/core/src/types`）の全メンバーは、
本書に `code` として現れなければならない。meta-test
（`packages/core/src/types/diagnostics-catalog.test.ts`）が双方向でこれを assert
するため、カタログが emit されるコードから無言で drift することはない。背景の規律は
[TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md)
に記録する。

同じ meta-test が、各行の `ID` が登録簿（`packages/core/src/types/diagnostic-ids.ts`）
の与える ID であることと、廃止した ID がすべて下に載っていることを確かめる。

### 廃止した ID

廃止した ID はまだ無い。コードを廃止したときは、その行をここへ移し、先頭の列に
ID、続けて旧コードを書く（``| KRS000 | `old-code` |``）。古い出力の ID からも引け、
番号は別のコードに振り直さない。

> Related TPLs: [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md)（カタログ ↔ コードの完全性）, [TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)（事実 vs 流派の register）, [TPL-2171](../test-perspectives/TPL-2171-spec-promised-diagnostics-implemented.md)（spec が約束する診断は実装されている）, [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)（spec ↔ source-of-truth 同期）.
