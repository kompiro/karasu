# ADR Topic: build

66 ADRs in this topic. Solid nodes belong to `build`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
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
    ADR_1628["ADR-1628<br/>docs-site の Examples gallery は examples/ をビルド時レ..."]
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
    ADR_1890["ADR-1890<br/>CI ランナーは Ubicloud を採用し、secret を握る publish / dep..."]
    ADR_2106["ADR-2106<br/>Dependabot トリアージ 2026-07-21 — setup-node 採用・ast..."]
    ADR_2111["ADR-2111<br/>Dependabot security update — brace-expansion / ..."]
    ADR_2115["ADR-2115<br/>Dependabot security update 第 2 便 — fast-uri / s..."]
    ADR_2124["ADR-2124<br/>version vocabulary — 言語版とパッケージ semver は独立の軸とし、言..."]
    ADR_2129["ADR-2129<br/>Dependabot security alert"]
    ADR_2139["ADR-2139<br/>Dependabot security 第 2 便 — postcss の後続 advisor..."]
    ADR_2142["ADR-2142<br/>Dependabot security 第 3 便 — brace-expansion OOM..."]
    ADR_2152["ADR-2152<br/>Dependabot トリアージ 2026-07-27 — 6 件全採用、radix の pu..."]
    ADR_2318["ADR-2318<br/>Dependabot トリアージ 2026-08-03 — react 分割 PR の相互ブロ..."]
    ADR_2333["ADR-2333<br/>Dependabot トリアージ 2026-08-04 — LSP protocol の単独 ..."]
    ADR_9001["ADR-9001<br/>モノレポ構成の採用"]
    ADR_9020["ADR-9020<br/>npm publish を Trusted Publishing（GitHub OIDC）に移..."]
  end
  ADR_8["ADR-8<br/>[styling] ビルトインスタイルの一元化と構造化リファレンス"]
  ADR_1974["ADR-1974<br/>[parser] system view の意味的クラスタを宣言する `boundary` 構文と `bound..."]
  ADR_2075["ADR-2075<br/>[resolver] 宣言スコープで描画できない edge endpoint を診断する — peer はノードイン..."]
  ADR_2165["ADR-2165<br/>[parser] 論理ノードの containment 規則は `canContain` を唯一の定義とし、違反..."]
  ADR_2184["ADR-2184<br/>[resolver] 同じモデリング状態を表す配置には同じ診断を出す — `system` 直下の domain に..."]
  ADR_1296 --> ADR_8
  ADR_1628 --> ADR_1575
  ADR_1820 --> ADR_1314
  ADR_2124 --> ADR_1314
  ADR_1974 --> ADR_1820
  ADR_2075 --> ADR_1314
  ADR_2165 --> ADR_1296
  ADR_2165 --> ADR_1314
  ADR_2184 --> ADR_2165
  ADR_2184 --> ADR_1314

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_45 not_adopted
  class ADR_65 accepted
  class ADR_123 accepted
  class ADR_128 accepted
  class ADR_158 accepted
  class ADR_199 accepted
  class ADR_209 accepted
  class ADR_284 not_adopted
  class ADR_308 accepted
  class ADR_349 accepted
  class ADR_377 accepted
  class ADR_579 accepted
  class ADR_633 accepted
  class ADR_671 accepted
  class ADR_769 accepted
  class ADR_784 accepted
  class ADR_843 accepted
  class ADR_903 accepted
  class ADR_909 accepted
  class ADR_953 accepted
  class ADR_1038 accepted
  class ADR_1084 accepted
  class ADR_1085 accepted
  class ADR_1112 accepted
  class ADR_1296 accepted
  class ADR_1314 accepted
  class ADR_1315 accepted
  class ADR_1320 accepted
  class ADR_1338 accepted
  class ADR_1350 accepted
  class ADR_1363 accepted
  class ADR_1370 accepted
  class ADR_1443 accepted
  class ADR_1474 accepted
  class ADR_1574 accepted
  class ADR_1575 accepted
  class ADR_1593 accepted
  class ADR_1611 accepted
  class ADR_1628 accepted
  class ADR_1642 accepted
  class ADR_1652 accepted
  class ADR_1675 accepted
  class ADR_1681 accepted
  class ADR_1694 accepted
  class ADR_1722 accepted
  class ADR_1729 accepted
  class ADR_1742 accepted
  class ADR_1758 accepted
  class ADR_1820 accepted
  class ADR_1848 accepted
  class ADR_1855 accepted
  class ADR_1862 accepted
  class ADR_1866 accepted
  class ADR_1890 accepted
  class ADR_2106 accepted
  class ADR_2111 accepted
  class ADR_2115 accepted
  class ADR_2124 accepted
  class ADR_2129 accepted
  class ADR_2139 accepted
  class ADR_2142 accepted
  class ADR_2152 accepted
  class ADR_2318 accepted
  class ADR_2333 accepted
  class ADR_9001 accepted
  class ADR_9020 accepted
  class ADR_8 ghost
  class ADR_1974 ghost
  class ADR_2075 ghost
  class ADR_2165 ghost
  class ADR_2184 ghost
```
