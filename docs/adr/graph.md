# ADR Dependency Graph — Overview

268 ADRs across 15 topics. Clusters group by `topic` frontmatter field. Edges crossing cluster borders are cross-topic dependencies.
```mermaid
flowchart TD
  subgraph adr-tooling["adr-tooling"]
    ADR_788["ADR-788<br/>ADR knowledge graph — machine-readable frontmat..."]
    ADR_808["ADR-808<br/>ADR 本文とフロントマター関係フィールドの整合性を validator の warning ..."]
    ADR_830["ADR-830<br/>ADR タイトルは OSS 化までは日本語で書く"]
    ADR_1077["ADR-1077<br/>ADR ツール用語彙の adr.config.json への外部化"]
    ADR_1357["ADR-1357<br/>TPL ツールを `@kompiro/tpl-tools` として外出しし、karasu から..."]
    ADR_1829["ADR-1829<br/>ADR から karasu 構造へリンクする permalink 規約（taka 短縮 + 必..."]
    ADR_1830["ADR-1830<br/>ADR→karasu permalink の検証は adr-tools の krs kind ..."]
    ADR_2092["ADR-2092<br/>TPL の reference-data 設定を `tpl.config.json` に分離し..."]
  end
  subgraph app-ui["app-ui"]
    ADR_104["ADR-104<br/>system セレクタUIを採用しない"]
    ADR_164["ADR-164<br/>ツールバーボタンの表示ルール"]
    ADR_307["ADR-307<br/>ツールバーボタンの actionable 修飾クラス"]
    ADR_357["ADR-357<br/>ProjectSelector の Rename 操作 — インライン入力欄パターン"]
    ADR_455["ADR-455<br/>EditPaneToolbar — LeftPane アクションボタンの専用ツールバーへの集約"]
    ADR_465["ADR-465<br/>`EditArea` コンポーネント新設と sidebar-toggle のサイドバーエリアへの移動"]
    ADR_607["ADR-607<br/>DetailPanel は常に1つだけ表示する"]
    ADR_650["ADR-650<br/>グラフィカル diff ビューア"]
    ADR_706["ADR-706<br/>`KarasuPreviewColumn` を `PreviewColumn` にリネーム"]
    ADR_739["ADR-739<br/>Diff ペースト入力の UI 配置とストレージ方式"]
    ADR_766["ADR-766<br/>空ビューを避けるための自動タブ切替（system > deploy > org）"]
    ADR_811["ADR-811<br/>プレビューのエントリは「開いている .krs ファイル」"]
    ADR_813["ADR-813<br/>ユーザー向け文字列はデフォルトで i18n を通す"]
    ADR_1076["ADR-1076<br/>GUI 駆動の `.krs.style` 編集 — Preview コンテキストメニューから ..."]
    ADR_1108["ADR-1108<br/>アクティビティバー + サイドバー構造の導入"]
    ADR_1122["ADR-1122<br/>エディタ・プレビュー間のドラッグハンドル"]
    ADR_1142["ADR-1142<br/>GUI 駆動の `.krs.style` 編集 — 単一プロパティ rule は in-pla..."]
    ADR_1144["ADR-1144<br/>GUI コンテキストメニューの append 先解決 — `.krs.style` 直接編集時..."]
    ADR_1148["ADR-1148<br/>FileTree の外部書き込み反映 — ObservableFileSystemProvid..."]
    ADR_1150["ADR-1150<br/>Editor バッファの外部書き込み追従 — 差分検出ベースの auto-refresh"]
    ADR_1179["ADR-1179<br/>Monaco undo stack 統合 — `@monaco-editor/react` 経..."]
    ADR_1344["ADR-1344<br/>`examples/feature-samples/` を built-in ProjectM..."]
    ADR_1368["ADR-1368<br/>shadcn/ui と Tailwind v4 を packages/app に採用する"]
    ADR_1400["ADR-1400<br/>EdgeContextMenu の direction メニューは shadcn Dropdo..."]
    ADR_1408["ADR-1408<br/>App サイドバーに AST Outline ビューを追加する"]
    ADR_1410["ADR-1410<br/>Outline ビューはアクティブビューの AST に追従する"]
    ADR_1411["ADR-1411<br/>App キーボードショートカットはコマンドレジストリを基盤にする"]
    ADR_1415["ADR-1415<br/>Outline ビューはタグ駆動アイコン variant を core 共有関数で解決する"]
    ADR_1421["ADR-1421<br/>App コマンドパレットはコマンドレジストリを列挙する"]
    ADR_1463["ADR-1463<br/>translate を core に移設し App でクライアントサイド変換として提供する"]
    ADR_1468["ADR-1468<br/>overlay/portal surface の z-index を文書化されたトークンスケー..."]
    ADR_1469["ADR-1469<br/>コマンドパレットのコマンド名は当面 i18n せず、解説追加時にまとめて対応する"]
    ADR_1470["ADR-1470<br/>app.css をモジュール分割し、トークン層でライトテーマを提供する"]
    ADR_1646["ADR-1646<br/>gallery の example は id 指定・固定 origin fetch で app..."]
    ADR_1955["ADR-1955<br/>全 service をその場一括展開する — Collapse all / Expand al..."]
    ADR_9009["ADR-9009<br/>ツールバーボタンはアイコン+テキストラベル必須"]
    ADR_9010["ADR-9010<br/>MemoryMode と ProjectMode の統一 — Reducer + `Karas..."]
    ADR_9011["ADR-9011<br/>Editor 診断表示 — Monaco マーカー + Preview エラーオーバーレイ"]
    ADR_9016["ADR-9016<br/>Reference パネルの図種別コンテキスト対応"]
    ADR_9018["ADR-9018<br/>ProjectMode 初期コンテンツ — `examples/ec-platform` から..."]
  end
  subgraph build["build"]
    ADR_45["ADR-45<br/>Bun への移行は採用しない"]
    ADR_65["ADR-65<br/>main ブランチの健全性維持戦略"]
    ADR_123["ADR-123<br/>GitHub Markdown レンダリングサービス — `serve.ts` の `/ren..."]
    ADR_128["ADR-128<br/>Dependabot による依存更新の自動化"]
    ADR_158["ADR-158<br/>依存パッケージのメジャー更新 — 2026 年 3 月"]
    ADR_199["ADR-199<br/>依存パッケージ更新 — 2026-03-31"]
    ADR_209["ADR-209<br/>Markdown レンダリングに marked、ファイル監視に chokidar を採用"]
    ADR_284["ADR-284<br/>start-dev スキルで Claude セッション名を機能名にリネームしない"]
    ADR_308["ADR-308<br/>npm パッケージスコープを @karasu-tools/* に変更"]
    ADR_349["ADR-349<br/>依存パッケージ更新 — 2026-04-07"]
    ADR_377["ADR-377<br/>リリーストグルを伴う Trunk-Based Development"]
    ADR_579["ADR-579<br/>Preview workflow はラベル駆動をやめ path filter で制御する"]
    ADR_633["ADR-633<br/>Dependabot バッチトリアージ（2026-04-14）"]
    ADR_671["ADR-671<br/>HTML サニタイズに DOMPurify を採用"]
    ADR_769["ADR-769<br/>依存パッケージ更新 — 2026-04-20"]
    ADR_784["ADR-784<br/>依存パッケージ更新 — 2026-04-21"]
    ADR_843["ADR-843<br/>Feature toggle ポリシー — compile-time、短命、卒業時に削除"]
    ADR_903["ADR-903<br/>Secret 必須の CI ジョブは bot 作者の PR で skip する"]
    ADR_909["ADR-909<br/>依存更新バッチ — 2026-04-28"]
    ADR_953["ADR-953<br/>Required Check は paired stub workflow で docs-on..."]
    ADR_1038["ADR-1038<br/>Dependabot security update — `@anthropic-ai/sdk..."]
    ADR_1084["ADR-1084<br/>portable な開発スキルは `kompiro/hane` plugin に切り出し、ka..."]
    ADR_1085["ADR-1085<br/>ユーザー作成 worktree は `.claude/worktrees/<branch>` ..."]
    ADR_1112["ADR-1112<br/>依存パッケージ更新 — 2026-05-05"]
    ADR_1296["ADR-1296<br/>in-app Reference データを `reference-data.ts` に集約し、..."]
    ADR_1314["ADR-1314<br/>.krs / .krs.style を v1.0 として凍結する（ハイブリッド版管理）"]
    ADR_1315["ADR-1315<br/>OSS リリース自動化に changesets を採用し、当面は `karasu`（CLI）の..."]
    ADR_1320["ADR-1320<br/>OSS リリースのライセンス順守を allowlist CI と自動生成 THIRD_PART..."]
    ADR_1338["ADR-1338<br/>`fast-uri` を `pnpm.overrides` で `^3.1.2` に固定（GH..."]
    ADR_1350["ADR-1350<br/>Dependabot Batch Triage (2026-05-12) — `pnpm/ac..."]
    ADR_1363["ADR-1363<br/>@karasu-tools/core を v0.x の公開パッケージにする（developme..."]
    ADR_1370["ADR-1370<br/>リリースを workflow_dispatch 起動の Prepare → release P..."]
    ADR_1443["ADR-1443<br/>Dependabot Batch Triage (2026-05-19) — `pnpm/ac..."]
    ADR_1474["ADR-1474<br/>Dependabot security update — transitive 依存を pnp..."]
    ADR_1574["ADR-1574<br/>docs/guide の hero スニペットを正典として、レンダリング済み SVG を生成・..."]
    ADR_1575["ADR-1575<br/>docs/ を single source of truth として Astro Starli..."]
    ADR_1593["ADR-1593<br/>Dependabot security update — transitive 依存を pnp..."]
    ADR_1611["ADR-1611<br/>Dependabot Batch Triage (2026-06-15) — `actions..."]
    ADR_1642["ADR-1642<br/>example を examples/<lang>/<name>/ に揃え、docs gall..."]
    ADR_1652["ADR-1652<br/>Dependabot security update — transitive 依存を pnp..."]
    ADR_1675["ADR-1675<br/>js-yaml transitive 脆弱性（alert #24）を read-yaml-fi..."]
    ADR_1681["ADR-1681<br/>karasu CLI の publish 成果物を単一バンドル `dist/index.js`..."]
    ADR_1694["ADR-1694<br/>Dependabot security alert（undici #37/#38, dompu..."]
    ADR_1722["ADR-1722<br/>Dependabot Batch Triage (2026-06-23) — `pnpm/ac..."]
    ADR_1729["ADR-1729<br/>app E2E（Playwright）はラベル駆動をやめ path filter で起動する"]
    ADR_1742["ADR-1742<br/>VS Code E2E（extension host / WebView）もラベル駆動をやめ ..."]
    ADR_1758["ADR-1758<br/>VS Code 拡張を changesets の版管理対象に含める"]
    ADR_1820["ADR-1820<br/>notation promotion gate — experimental notation..."]
    ADR_1848["ADR-1848<br/>Dependabot Triage (2026-06-30) — `actions/check..."]
    ADR_1855["ADR-1855<br/>Dependabot Triage (2026-07-08) — `actions/cache..."]
    ADR_1862["ADR-1862<br/>TypeScript 7.0（native compiler）を採用する"]
    ADR_1866["ADR-1866<br/>app E2E（Playwright）を Required status check にし、p..."]
    ADR_9001["ADR-9001<br/>モノレポ構成の採用"]
    ADR_9020["ADR-9020<br/>npm publish を Trusted Publishing（GitHub OIDC）に移..."]
  end
  subgraph chat-ai["chat-ai"]
    ADR_34["ADR-34<br/>i18n ロールアウト — 英語 / 日本語の UI・診断・Chat"]
    ADR_362["ADR-362<br/>Chat UI Panel — 全体アーキテクチャと Phase 1 レイアウト"]
    ADR_363["ADR-363<br/>Chat UI AI 設計レビュー — プロンプト駆動 + トリガー二系統"]
    ADR_419["ADR-419<br/>Chat UI Phase 2 — BYOK + AI 統合の実装方針"]
    ADR_420["ADR-420<br/>Chat UI Phase 3 — 構造化インタビュープロンプトの実装方針"]
    ADR_529["ADR-529<br/>Playwright と AI による視覚レビューの併用"]
    ADR_639["ADR-639<br/>Chat システムプロンプトの i18n — ロケール検出とプロンプト選択"]
    ADR_1580["ADR-1580<br/>組織グラフと解決済み ownerIndex を AI チャットプロンプトにシリアライズする"]
    ADR_1895["ADR-1895<br/>アーキテクチャリバースハーネス — multi-subagent fan-out + CLI ..."]
    ADR_9017["ADR-9017<br/>Cloudflare Pages デプロイ基盤と BYOK AI 連携"]
  end
  subgraph cli["cli"]
    ADR_121["ADR-121<br/>CLI `karasu render` コマンド"]
    ADR_355["ADR-355<br/>CLI `karasu translate` コマンドと複数 realizes 対応"]
    ADR_464["ADR-464<br/>`karasu apply` サブコマンド — stdin + `applyKrsPatch`..."]
    ADR_469["ADR-469<br/>CLI 変更系サブコマンド — `karasu remove` / `append` / `i..."]
    ADR_643["ADR-643<br/>`translate --from openapi` のデフォルトをリソース単位の useca..."]
    ADR_644["ADR-644<br/>`translate --from db` のデフォルトを集約ルート単位のテーブル集約に変更する"]
    ADR_1020["ADR-1020<br/>`karasu diff` CLI と diff SVG の self-contained ス..."]
    ADR_1025["ADR-1025<br/>`karasu diff` の bundled all-views 出力"]
    ADR_1062["ADR-1062<br/>CRUD マトリクスビュー（usecase × resource）を派生プロジェクションとして..."]
    ADR_1104["ADR-1104<br/>translate adapter で usecase → resource バインディング ..."]
    ADR_1935["ADR-1935<br/>--from wrangler translate adapter と「adapter を採る基準」"]
    ADR_9013["ADR-9013<br/>CLI `karasu serve` モード — ローカル `.krs` のリアルタイムプレビュー"]
  end
  subgraph core-concepts["core-concepts"]
    ADR_14["ADR-14<br/>Organization 図（organization / team / member）の追加"]
    ADR_309["ADR-309<br/>Org Tree View — 組織階層の左→右ツリー俯瞰図"]
    ADR_823["ADR-823<br/>クライアント / MCP を system 図でどう表現するか — `client` kind..."]
    ADR_832["ADR-832<br/>実行時認可（usecase レベルの authz）は karasu の語彙に取り込まない"]
    ADR_834["ADR-834<br/>セキュリティ／脅威モデリングは karasu の語彙に取り込まず companion docu..."]
    ADR_837["ADR-837<br/>client の capability 軸 — device / browser permis..."]
    ADR_1281["ADR-1281<br/>user.role キーワードは存続させ、spec で「authz primitive ではな..."]
    ADR_1386["ADR-1386<br/>karasu はスタイル流派を規定せず、流派が smell と呼ぶ構造は `info` 診断で..."]
    ADR_1564["ADR-1564<br/>service / domain の `team` プロパティを削除する"]
    ADR_1566["ADR-1566<br/>`duplicate-owner-assignment` を info（fact-vs-sty..."]
    ADR_1568["ADR-1568<br/>ライフサイクルアノテーションに移行 intent パラメータを持たせる"]
    ADR_1583["ADR-1583<br/>team アノテーション対応と `@migration_target` による primary..."]
    ADR_1632["ADR-1632<br/>deploy unit は共有 infra ノードを realize できる（store ki..."]
    ADR_1639["ADR-1639<br/>user は system-scoped とする（identity ではなく relation..."]
    ADR_1718["ADR-1718<br/>vector store / search index は `database` の `[in..."]
    ADR_1720["ADR-1720<br/>client は realizes / owns の対象になれる（valid-target に..."]
    ADR_1870["ADR-1870<br/>ドメインエンティティと関連のモデリング（v1）— 非目標「DB スキーマ」の線引き直し"]
    ADR_9002["ADR-9002<br/>ツール名「karasu」の採用"]
    ADR_9003["ADR-9003<br/>論理構造と物理構造の分離"]
  end
  subgraph edges["edges"]
    ADR_285["ADR-285<br/>クロスシステムサービス参照 — ドット記法（`SystemId.ServiceId`）"]
    ADR_445["ADR-445<br/>Domain 間エッジと `[implicit]` 自動タグによる暗黙サービスエッジ"]
    ADR_460["ADR-460<br/>サービスドリルダウンビューでの Ghost Domain エッジ表示"]
    ADR_463["ADR-463<br/>集約された暗黙エッジの詳細パネル — SVG 属性埋め込み方式"]
    ADR_510["ADR-510<br/>Implicit エッジにおける sync/async の視覚的区別"]
    ADR_968["ADR-968<br/>Skip-layer エッジの直交チャネルルーティング"]
    ADR_1064["ADR-1064<br/>エッジの border-style に dotted を追加してユーザーが第3の線スタイル軸を..."]
    ADR_1096["ADR-1096<br/>`.krs.style` の `edge#<id>` セレクタ — base ID + opt..."]
    ADR_1135["ADR-1135<br/>edge `direction: left` / `direction: right` の l..."]
    ADR_1184["ADR-1184<br/>edge `label-position` / `label-offset` プロパティ — ..."]
    ADR_1185["ADR-1185<br/>同一ペア間の並列エッジ束ね"]
    ADR_1492["ADR-1492<br/>stroke-style をエッジ線スタイルの正準プロパティとして採用する"]
    ADR_1554["ADR-1554<br/>エッジコンテキストメニューへの authored ラベル表示と data-edge-label..."]
    ADR_1911["ADR-1911<br/>エンティティビューの cross-domain 関連は限定子付き参照 + ghost で表示する"]
    ADR_9019["ADR-9019<br/>`.krs.style` の edge `direction` プロパティ — 矢印の流れる向..."]
  end
  subgraph navigation["navigation"]
    ADR_110["ADR-110<br/>Permanent Link — `nodePathIndex` と URL hash の 2..."]
    ADR_177["ADR-177<br/>ノードクリック UX — ドリルダウンと Cmd/Ctrl+Click エディタジャンプ"]
    ADR_226["ADR-226<br/>Drill-down 収集ロジック統一 — `HierarchyNode` 型 + 高階関数"]
    ADR_278["ADR-278<br/>ブラウザ履歴ナビゲーション — URL hash による drill-down 同期"]
    ADR_321["ADR-321<br/>プロジェクト URL ナビゲーション — `/projects/<uuid>` パスネーム方式"]
    ADR_422["ADR-422<br/>クロスナビゲーション時のアトミックなハイライト適用"]
    ADR_425["ADR-425<br/>ブラウザ履歴でのハイライト復元 — hash コロン拡張"]
    ADR_429["ADR-429<br/>マルチファイルプロジェクトでのクロスファイルナビゲーション"]
    ADR_1094["ADR-1094<br/>ActiveView を追加するときは URL hash 対応もセットで行う"]
    ADR_1827["ADR-1827<br/>Deep permalink — 構造要素 / view への深いパーマリンク"]
    ADR_1828["ADR-1828<br/>repo-backed + ref-pinned permalink（nest Phase 2..."]
  end
  subgraph parser["parser"]
    ADR_7["ADR-7<br/>YAML スタイル構文移行の見送り"]
    ADR_19["ADR-19<br/>ID 必須化と `label` のプロパティ化"]
    ADR_211["ADR-211<br/>`compile()` API 統一 — Discriminated Union による戻り値型"]
    ADR_281["ADR-281<br/>ワイルドカードインポートと2パス解決の採用"]
    ADR_292["ADR-292<br/>Directory Import — `import &quot;dir/&quot;` 構文"]
    ADR_412["ADR-412<br/>トップレベル service の Named Import — スタブ補完 + エッジ参照によ..."]
    ADR_438["ADR-438<br/>`.krs` フォーマッター — トークン列ベースでコメント保持"]
    ADR_442["ADR-442<br/>構造的 `.krs` パッチ — ノード ID ベースの `append` / `replac..."]
    ADR_496["ADR-496<br/>ブロック内エッジの暗黙 source 簡略記法"]
    ADR_927["ADR-927<br/>system にネストした service / domain の Named Import は..."]
    ADR_1046["ADR-1046<br/>usecase 内 resource に CRUD operations プロパティを追加する"]
    ADR_1082["ADR-1082<br/>usecase resource operations に verb 装飾構文（1:N CRU..."]
    ADR_1168["ADR-1168<br/>`.krs.style` AST に位置情報と sheetId を持たせ、parser の e..."]
    ADR_1177["ADR-1177<br/>Tidy Style コマンド — `.krs.style` に trivia 保持と軸グルー..."]
    ADR_1178["ADR-1178<br/>`.krs.style` 値レベル診断 — 構造化 ValueNode AST と prope..."]
    ADR_1567["ADR-1567<br/>規則と診断を分離し、診断カタログで完全性を担保する"]
    ADR_2076["ADR-2076<br/>formatter の top-level 網羅は手で列挙せず `KrsFile` から導出し..."]
    ADR_2087["ADR-2087<br/>出力する文字列「値」を lexer のデコード規則と 1:1 で escape し、表現不能な..."]
    ADR_9008["ADR-9008<br/>AST 再構成 — Discriminated Union とプロパティブロック"]
  end
  subgraph project["project"]
    ADR_461["ADR-461<br/>Export Project as ZIP — `fflate` による OPFS エクスポート"]
    ADR_462["ADR-462<br/>Import Project from ZIP — `fflate` 再利用 + トップレベル除去"]
    ADR_740["ADR-740<br/>OPFS 履歴スナップショットを diff 比較ソースにする"]
    ADR_1302["ADR-1302<br/>Private vulnerability reporting を有効化する"]
    ADR_1783["ADR-1783<br/>karasu-nest — URL で .krs を共有・プレビューするホスト型機能"]
    ADR_1801["ADR-1801<br/>karasu-nest — 共有リンクの OGP 画像（system 図 unfurl）"]
    ADR_1809["ADR-1809<br/>プレイグラウンドを karasu.kompiro.dev カスタムドメインで公開する"]
    ADR_9006["ADR-9006<br/>プロジェクトとファイルシステム抽象化 — `FileSystemProvider` + OPFS"]
  end
  subgraph renderer["renderer"]
    ADR_21["ADR-21<br/>2 レイヤレンダリングとドリルダウンナビゲーション"]
    ADR_22["ADR-22<br/>SVG エクスポートの 2 フェーズ実装（現在ビュー + Full View 単一ファイル）"]
    ADR_29["ADR-29<br/>Deployment 図の設計判断"]
    ADR_30["ADR-30<br/>アイコンモード — SVG アイコンによるノード表示切り替え"]
    ADR_105["ADR-105<br/>PNG エクスポートは実装しない"]
    ADR_131["ADR-131<br/>KarasuPreviewColumn からの SVG エクスポート責務分離"]
    ADR_328["ADR-328<br/>クロスシステム参照の Ghost System レンダリング"]
    ADR_351["ADR-351<br/>resource shape 自動推論とインフラノード Icon Mode 対応"]
    ADR_392["ADR-392<br/>Deploy 図レイアウト — 階層 DAG レイアウト（Longest Path Layer..."]
    ADR_395["ADR-395<br/>同レイヤー内コンテナ順序の Barycenter ヒューリスティックによる最適化"]
    ADR_458["ADR-458<br/>Architecture レイアウトへの Barycenter + Sub-row wrap ..."]
    ADR_649["ADR-649<br/>draw.io（mxGraph XML）エクスポート — レイアウトの逃げ道"]
    ADR_681["ADR-681<br/>トップレベル service / domain を `(Unassigned)` 擬似システム..."]
    ADR_702["ADR-702<br/>トップレベル infra ブロック（database / queue / storage）を ..."]
    ADR_833["ADR-833<br/>図の凡例（legend）構文をモデル側に追加する"]
    ADR_967["ADR-967<br/>アクター配置 — outgoing edge の最も浅い target に隣接する row へ..."]
    ADR_974["ADR-974<br/>Infra/external ノードを最深 consumer の直下行に引き上げる"]
    ADR_1000["ADR-1000<br/>Icon display mode 用の auto-layout gap 定数を別系統に分ける"]
    ADR_1061["ADR-1061<br/>usecase→resource edge を read/write で視覚的に区別する"]
    ADR_1479["ADR-1479<br/>SVG 図のライト / ダークテーマ対応（パレット引数 + 解決済み色の埋め込み）"]
    ADR_1513["ADR-1513<br/>ドリルダウン深度スコープによる凡例の完全一致切り替え"]
    ADR_1658["ADR-1658<br/>deploy view に service→infra 依存エッジを描く（導出は共有ヘルパーで..."]
    ADR_1724["ADR-1724<br/>system-view の dep ティアを infra 行と external 行に分割する"]
    ADR_1728["ADR-1728<br/>system-view の external サービスをサイド列に配置してエッジ交差を減らす"]
    ADR_1737["ADR-1737<br/>多すぎる兄弟ノードをバランス grid で畳む"]
    ADR_1738["ADR-1738<br/>deploy view は job-only container を専用の job 帯にまとめ..."]
    ADR_1805["ADR-1805<br/>karasu-nest の PNG ラスタライズに resvg-wasm を採用する"]
    ADR_1815["ADR-1815<br/>system view のコンテナをその場で展開する（in-place expansion /..."]
    ADR_1821["ADR-1821<br/>layer toggles — external/infra カテゴリの対話的 collaps..."]
    ADR_1858["ADR-1858<br/>system view を team（owns）軸でグループ化し、折り畳み可能な境界フレームで..."]
    ADR_1859["ADR-1859<br/>grouped system view のエッジを直交ルーティング・集約トランク・交差マークで..."]
    ADR_1872["ADR-1872<br/>category collapse は境界エッジを drop せず stub に re-tar..."]
    ADR_1884["ADR-1884<br/>multi-system root view でも Group by: team を効かせる（..."]
    ADR_1886["ADR-1886<br/>差分モードの Group by で除去ノードを元の team フレームに残し、集約エッジの d..."]
    ADR_1983["ADR-1983<br/>boundary grouping の drill-down 拡張 — 描画レベルとの交差によ..."]
    ADR_9005["ADR-9005<br/>SVGアイコンファイルの外部インポート方式"]
    ADR_9007["ADR-9007<br/>インタラクティブ SVG レンダリングと NodeDetailPanel"]
    ADR_9015["ADR-9015<br/>全ビュー統合バンドル SVG（buildAllViewsSvg）"]
  end
  subgraph resolver["resolver"]
    ADR_237["ADR-237<br/>Domain Drift Detection — 検出スコープと検出キー"]
    ADR_287["ADR-287<br/>循環依存の検出と `KrsEdge.cyclic` フラグによる視覚化"]
    ADR_316["ADR-316<br/>`database` / `queue` / `storage` を system 直下のファ..."]
    ADR_477["ADR-477<br/>移行期における重複ドメイン ID の共存を `@deprecated` + `@migrati..."]
    ADR_1381["ADR-1381<br/>マルチファイル import の意味論 — whole-file import / syste..."]
    ADR_1570["ADR-1570<br/>共有 infra fan-in を info 診断として通知する"]
    ADR_1819["ADR-1819<br/>infra leaf のドメイン所有を entity から導出し cross-domain ス..."]
  end
  subgraph styling["styling"]
    ADR_8["ADR-8<br/>ビルトインスタイルの一元化と構造化リファレンス"]
    ADR_108["ADR-108<br/>スタイル解決パイプラインの一元化"]
    ADR_517["ADR-517<br/>親サービスのアノテーションを子ノードに継承する"]
    ADR_969["ADR-969<br/>`.krs.style` 側の `column` で layer 内 x 配置を上書きする e..."]
    ADR_999["ADR-999<br/>凡例 ref のフォールバック swatch（in-use なら描画する）"]
    ADR_1508["ADR-1508<br/>組み込みアノテーションバッジラベルは reference-data から生成し locale ..."]
    ADR_1755["ADR-1755<br/>`.krs.style` に始点 / 終点エッジセレクタ `edge[from=<id>]` ..."]
    ADR_9004["ADR-9004<br/>CSSインスパイアのスタイリングシステム"]
  end
  subgraph testing["testing"]
    ADR_33["ADR-33<br/>E2EテストよりQA手動確認を優先する"]
    ADR_40["ADR-40<br/>コンポーネントテストに @testing-library/react を採用する"]
    ADR_165["ADR-165<br/>モノレポ内 vitest の配置 — ルート install ではなく workspace d..."]
    ADR_862["ADR-862<br/>Playwright 向け OPFS fixture ヘルパー"]
    ADR_864["ADR-864<br/>Chat UI E2E は Playwright route で Anthropic API ..."]
    ADR_916["ADR-916<br/>受け入れテストの自動化マーカー規約と検出スクリプト"]
    ADR_926["ADR-926<br/>VS Code WebView の DOM 系テストはマニュアル運用とする"]
    ADR_1008["ADR-1008<br/>flaky な E2E テストは test.fixme でマークし追跡 Issue を立てる"]
    ADR_1014["ADR-1014<br/>VS Code WebView の DOM 系テストは ExTester ハーネスで自動化する"]
    ADR_1192["ADR-1192<br/>テスト観点ライブラリ（Test Perspective Library, TPL）の運用開始"]
    ADR_2045["ADR-2045<br/>QA 手動チェックリスト生成のマーカー対応と 3-way triage"]
    ADR_9012["ADR-9012<br/>`packages/app` のテスト戦略 — `@testing-library/react..."]
  end
  subgraph vscode["vscode"]
    ADR_176["ADR-176<br/>VSCode Phase 3 — 独立 HTML Webview アーキテクチャ"]
    ADR_218["ADR-218<br/>VSCode Phase 3.5 — Webview ドリルダウンナビゲーション"]
    ADR_299["ADR-299<br/>VSCode プレビュー Icon Mode トグル — Extension Host 管理 ..."]
    ADR_863["ADR-863<br/>VS Code 拡張ホスト向け smoke test harness"]
    ADR_1316["ADR-1316<br/>VS Code 拡張を Entra ID + GitHub OIDC（managed iden..."]
    ADR_1417["ADR-1417<br/>LSP / CLI の i18n — 互換ブリッジ廃止と @karasu-tools/i18n..."]
    ADR_9014["ADR-9014<br/>VSCode 拡張 — LSP-first アーキテクチャと段階的フェーズ計画"]
  end
  ADR_14 --> ADR_9003
  ADR_14 --> ADR_9009
  ADR_19 --> ADR_9008
  ADR_22 --> ADR_21
  ADR_22 --> ADR_9007
  ADR_22 --> ADR_9009
  ADR_34 --> ADR_639
  ADR_108 --> ADR_9004
  ADR_108 --> ADR_8
  ADR_121 --> ADR_9015
  ADR_131 --> ADR_22
  ADR_176 --> ADR_9014
  ADR_177 --> ADR_9007
  ADR_177 --> ADR_218
  ADR_218 --> ADR_176
  ADR_218 --> ADR_9007
  ADR_237 --> ADR_9003
  ADR_278 --> ADR_110
  ADR_285 --> ADR_281
  ADR_292 --> ADR_281
  ADR_299 --> ADR_30
  ADR_299 --> ADR_9014
  ADR_309 --> ADR_14
  ADR_321 --> ADR_278
  ADR_321 --> ADR_110
  ADR_351 --> ADR_316
  ADR_351 --> ADR_30
  ADR_355 --> ADR_121
  ADR_357 --> ADR_9006
  ADR_362 --> ADR_9017
  ADR_363 --> ADR_362
  ADR_363 --> ADR_420
  ADR_392 --> ADR_29
  ADR_395 --> ADR_392
  ADR_412 --> ADR_292
  ADR_412 --> ADR_281
  ADR_419 --> ADR_362
  ADR_419 --> ADR_9017
  ADR_420 --> ADR_419
  ADR_420 --> ADR_362
  ADR_422 --> ADR_9007
  ADR_425 --> ADR_422
  ADR_425 --> ADR_278
  ADR_429 --> ADR_412
  ADR_429 --> ADR_211
  ADR_455 --> ADR_9009
  ADR_458 --> ADR_392
  ADR_458 --> ADR_395
  ADR_460 --> ADR_445
  ADR_461 --> ADR_9006
  ADR_461 --> ADR_357
  ADR_462 --> ADR_357
  ADR_462 --> ADR_9018
  ADR_462 --> ADR_461
  ADR_463 --> ADR_445
  ADR_464 --> ADR_355
  ADR_469 --> ADR_464
  ADR_496 --> ADR_477
  ADR_510 --> ADR_445
  ADR_517 --> ADR_477
  ADR_643 --> ADR_355
  ADR_644 --> ADR_355
  ADR_650 --> ADR_21
  ADR_681 --> ADR_412
  ADR_702 --> ADR_681
  ADR_702 --> ADR_316
  ADR_739 --> ADR_650
  ADR_740 --> ADR_650
  ADR_813 --> ADR_34
  ADR_1061 --> ADR_1046
  ADR_1077 --> ADR_788
  ADR_1096 --> ADR_1142
  ADR_1135 --> ADR_9019
  ADR_1150 --> ADR_1148
  ADR_1177 --> ADR_1168
  ADR_1178 --> ADR_1168
  ADR_1178 --> ADR_1177
  ADR_1296 --> ADR_8
  ADR_1417 --> ADR_34
  ADR_1564 --> ADR_14
  ADR_1580 --> ADR_1583
  ADR_1583 --> ADR_1566
  ADR_1819 --> ADR_1870
  ADR_1819 --> ADR_316
  ADR_1820 --> ADR_1314
  ADR_1828 --> ADR_1827
  ADR_1911 --> ADR_460
  ADR_9007 --> ADR_9008
  ADR_9007 --> ADR_21
  ADR_9011 --> ADR_9007
  ADR_9012 --> ADR_40
  ADR_9013 --> ADR_9006
  ADR_9015 --> ADR_22
  ADR_9019 --> ADR_1142
  ADR_9019 --> ADR_1096
  ADR_529 -.supersedes.-> ADR_33
  ADR_1014 -.supersedes.-> ADR_926
  ADR_1142 -.supersedes.-> ADR_1076

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_7 not_adopted
  class ADR_8 accepted
  class ADR_14 accepted
  class ADR_19 accepted
  class ADR_21 accepted
  class ADR_22 accepted
  class ADR_29 accepted
  class ADR_30 accepted
  class ADR_33 superseded
  class ADR_34 accepted
  class ADR_40 accepted
  class ADR_45 not_adopted
  class ADR_65 accepted
  class ADR_104 not_adopted
  class ADR_105 not_adopted
  class ADR_108 accepted
  class ADR_110 accepted
  class ADR_121 accepted
  class ADR_123 accepted
  class ADR_128 accepted
  class ADR_131 accepted
  class ADR_158 accepted
  class ADR_164 accepted
  class ADR_165 accepted
  class ADR_176 accepted
  class ADR_177 accepted
  class ADR_199 accepted
  class ADR_209 accepted
  class ADR_211 accepted
  class ADR_218 accepted
  class ADR_226 accepted
  class ADR_237 accepted
  class ADR_278 accepted
  class ADR_281 accepted
  class ADR_284 not_adopted
  class ADR_285 accepted
  class ADR_287 accepted
  class ADR_292 accepted
  class ADR_299 accepted
  class ADR_307 accepted
  class ADR_308 accepted
  class ADR_309 accepted
  class ADR_316 accepted
  class ADR_321 accepted
  class ADR_328 accepted
  class ADR_349 accepted
  class ADR_351 accepted
  class ADR_355 accepted
  class ADR_357 accepted
  class ADR_362 accepted
  class ADR_363 accepted
  class ADR_377 accepted
  class ADR_392 accepted
  class ADR_395 accepted
  class ADR_412 accepted
  class ADR_419 accepted
  class ADR_420 accepted
  class ADR_422 accepted
  class ADR_425 accepted
  class ADR_429 accepted
  class ADR_438 accepted
  class ADR_442 accepted
  class ADR_445 accepted
  class ADR_455 accepted
  class ADR_458 accepted
  class ADR_460 accepted
  class ADR_461 accepted
  class ADR_462 accepted
  class ADR_463 accepted
  class ADR_464 accepted
  class ADR_465 accepted
  class ADR_469 accepted
  class ADR_477 accepted
  class ADR_496 accepted
  class ADR_510 accepted
  class ADR_517 accepted
  class ADR_529 accepted
  class ADR_579 accepted
  class ADR_607 accepted
  class ADR_633 accepted
  class ADR_639 accepted
  class ADR_643 accepted
  class ADR_644 accepted
  class ADR_649 accepted
  class ADR_650 accepted
  class ADR_671 accepted
  class ADR_681 accepted
  class ADR_702 accepted
  class ADR_706 accepted
  class ADR_739 accepted
  class ADR_740 accepted
  class ADR_766 accepted
  class ADR_769 accepted
  class ADR_784 accepted
  class ADR_788 accepted
  class ADR_808 accepted
  class ADR_811 accepted
  class ADR_813 accepted
  class ADR_823 accepted
  class ADR_830 accepted
  class ADR_832 accepted
  class ADR_833 accepted
  class ADR_834 accepted
  class ADR_837 accepted
  class ADR_843 accepted
  class ADR_862 accepted
  class ADR_863 accepted
  class ADR_864 accepted
  class ADR_903 accepted
  class ADR_909 accepted
  class ADR_916 accepted
  class ADR_926 superseded
  class ADR_927 accepted
  class ADR_953 accepted
  class ADR_967 accepted
  class ADR_968 accepted
  class ADR_969 accepted
  class ADR_974 accepted
  class ADR_999 accepted
  class ADR_1000 accepted
  class ADR_1008 accepted
  class ADR_1014 accepted
  class ADR_1020 accepted
  class ADR_1025 accepted
  class ADR_1038 accepted
  class ADR_1046 accepted
  class ADR_1061 accepted
  class ADR_1062 accepted
  class ADR_1064 accepted
  class ADR_1076 superseded
  class ADR_1077 accepted
  class ADR_1082 accepted
  class ADR_1084 accepted
  class ADR_1085 accepted
  class ADR_1094 accepted
  class ADR_1096 accepted
  class ADR_1104 accepted
  class ADR_1108 accepted
  class ADR_1112 accepted
  class ADR_1122 accepted
  class ADR_1135 accepted
  class ADR_1142 accepted
  class ADR_1144 accepted
  class ADR_1148 accepted
  class ADR_1150 accepted
  class ADR_1168 accepted
  class ADR_1177 accepted
  class ADR_1178 accepted
  class ADR_1179 accepted
  class ADR_1184 accepted
  class ADR_1185 accepted
  class ADR_1192 accepted
  class ADR_1281 accepted
  class ADR_1296 accepted
  class ADR_1302 accepted
  class ADR_1314 accepted
  class ADR_1315 accepted
  class ADR_1316 accepted
  class ADR_1320 accepted
  class ADR_1338 accepted
  class ADR_1344 accepted
  class ADR_1350 accepted
  class ADR_1357 accepted
  class ADR_1363 accepted
  class ADR_1368 accepted
  class ADR_1370 accepted
  class ADR_1381 accepted
  class ADR_1386 accepted
  class ADR_1400 accepted
  class ADR_1408 accepted
  class ADR_1410 accepted
  class ADR_1411 accepted
  class ADR_1415 accepted
  class ADR_1417 accepted
  class ADR_1421 accepted
  class ADR_1443 accepted
  class ADR_1463 accepted
  class ADR_1468 accepted
  class ADR_1469 accepted
  class ADR_1470 accepted
  class ADR_1474 accepted
  class ADR_1479 accepted
  class ADR_1492 accepted
  class ADR_1508 accepted
  class ADR_1513 accepted
  class ADR_1554 accepted
  class ADR_1564 accepted
  class ADR_1566 accepted
  class ADR_1567 accepted
  class ADR_1568 accepted
  class ADR_1570 accepted
  class ADR_1574 accepted
  class ADR_1575 accepted
  class ADR_1580 accepted
  class ADR_1583 accepted
  class ADR_1593 accepted
  class ADR_1611 accepted
  class ADR_1632 accepted
  class ADR_1639 accepted
  class ADR_1642 accepted
  class ADR_1646 accepted
  class ADR_1652 accepted
  class ADR_1658 accepted
  class ADR_1675 accepted
  class ADR_1681 accepted
  class ADR_1694 accepted
  class ADR_1718 accepted
  class ADR_1720 accepted
  class ADR_1722 accepted
  class ADR_1724 accepted
  class ADR_1728 accepted
  class ADR_1729 accepted
  class ADR_1737 accepted
  class ADR_1738 accepted
  class ADR_1742 accepted
  class ADR_1755 accepted
  class ADR_1758 accepted
  class ADR_1783 accepted
  class ADR_1801 accepted
  class ADR_1805 accepted
  class ADR_1809 accepted
  class ADR_1815 accepted
  class ADR_1819 accepted
  class ADR_1820 accepted
  class ADR_1821 accepted
  class ADR_1827 accepted
  class ADR_1828 accepted
  class ADR_1829 accepted
  class ADR_1830 accepted
  class ADR_1848 accepted
  class ADR_1855 accepted
  class ADR_1858 accepted
  class ADR_1859 accepted
  class ADR_1862 accepted
  class ADR_1866 accepted
  class ADR_1870 accepted
  class ADR_1872 accepted
  class ADR_1884 accepted
  class ADR_1886 accepted
  class ADR_1895 accepted
  class ADR_1911 accepted
  class ADR_1935 accepted
  class ADR_1955 accepted
  class ADR_1983 accepted
  class ADR_2045 accepted
  class ADR_2076 accepted
  class ADR_2087 accepted
  class ADR_2092 accepted
  class ADR_9001 accepted
  class ADR_9002 accepted
  class ADR_9003 accepted
  class ADR_9004 accepted
  class ADR_9005 accepted
  class ADR_9006 accepted
  class ADR_9007 accepted
  class ADR_9008 accepted
  class ADR_9009 accepted
  class ADR_9010 accepted
  class ADR_9011 accepted
  class ADR_9012 accepted
  class ADR_9013 accepted
  class ADR_9014 accepted
  class ADR_9015 accepted
  class ADR_9016 accepted
  class ADR_9017 accepted
  class ADR_9018 accepted
  class ADR_9019 accepted
  class ADR_9020 accepted
```

## Per-topic detail

- [`adr-tooling`](graph/adr-tooling.md) — 8 ADRs
- [`app-ui`](graph/app-ui.md) — 40 ADRs
- [`build`](graph/build.md) — 54 ADRs
- [`chat-ai`](graph/chat-ai.md) — 10 ADRs
- [`cli`](graph/cli.md) — 12 ADRs
- [`core-concepts`](graph/core-concepts.md) — 19 ADRs
- [`edges`](graph/edges.md) — 15 ADRs
- [`navigation`](graph/navigation.md) — 11 ADRs
- [`parser`](graph/parser.md) — 19 ADRs
- [`project`](graph/project.md) — 8 ADRs
- [`renderer`](graph/renderer.md) — 38 ADRs
- [`resolver`](graph/resolver.md) — 7 ADRs
- [`styling`](graph/styling.md) — 8 ADRs
- [`testing`](graph/testing.md) — 12 ADRs
- [`vscode`](graph/vscode.md) — 7 ADRs
