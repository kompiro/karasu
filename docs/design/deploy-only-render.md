# Deploy-only file rendering

- **日付**: 2026-04-23（初版）/ 2026-04-26（org-only 拡張を追記）
- **ステータス**: deploy-only 部分は実装済み（PR [#821](https://github.com/kompiro/karasu/pull/821) マージ済み） / org-only 拡張は検討中
- **関連**:
  - Issue [#766](https://github.com/kompiro/karasu/issues/766) — deploy-only（実装済み）
  - Issue [#817](https://github.com/kompiro/karasu/issues/817) — org-only 横展開
  - ADR-20260312-03 — 論理構造と物理構造の分離
  - ADR-20260327-01 — Deployment Diagram Design Decisions
  - Issue [#735](https://github.com/kompiro/karasu/issues/735) — deploy-view diff（本 Issue の発端）

## 背景・課題

`.krs` ファイルに `deploy` ブロックだけが書かれていて `system` ブロックが存在しないケースで、
プレビュー画面が「空に見える」という問題が Issue [#766](https://github.com/kompiro/karasu/issues/766) で報告された。
特に #735 で deploy diff のテスト用フィクスチャを作ろうとしたとき、
意味のない `system` スタブを書かないと何も出ない、という不便が発端となっている。

### 実装コードを読んで分かったこと

Issue 本文の現象記述には誤解があり、実測したところコア層（`packages/core`）は
deploy-only ファイルを**すでに正しくコンパイルできている**:

- `extractDeployView` は `realizes` の値で units をグルーピングするだけで、
  対応する service が system 内に存在するかは問わない。
- 対応 service が無い場合でも、ラベルは `realizes` の値（例: `OrderAPI`）にフォールバックされ、
  コンテナが生成される。
- `renderDeploy` → `renderFromLayout` の経路は system に依存していないため、
  system が無くても deploy SVG は問題なく生成される。

実証: `deploy Production { oci "order-api" { realizes OrderAPI } }` だけの `.krs` を
`compile(src, { diagramType: "deploy" })` に与えると、2.8KB の適切な SVG が返る。
`"No nodes to render"` のプレースホルダは出ない。

### 本当の問題の所在

観測される「空っぽ」の正体は app 層（`packages/app`）の UX 問題:

| 層 | 状態 |
|----|------|
| core | deploy view は生成できる |
| app 初期状態 | `activeView = "system"` でハードコードされている（`app-reducer.ts:40,80,92`） |
| app タブ表示 | `hasDeployDiagram` が true なら Deploy タブは表示される（`DiagramTabBar.tsx:34`） |
| 起動時の見え方 | System タブが選択状態で、system 空のため `"No nodes to render"` が表示される |

つまり Deploy タブを手動でクリックすれば正しく描画されるが、
**初見のユーザーはそれに気づけない**、というのが体験上のバグ。

## 制約・前提

- ADR-20260312-03 が定める「論理/物理の分離」は変えない。
  deploy-only ファイルを「system に何か物が入っているように見せかける」
  （例: realizes から仮の service を合成する）ような対応は**しない**。
- Core 層の振る舞いは変えない。
  realizes 先が存在しないときに unclassified に落とす案も考えたが、
  ユーザーの宣言した意図（「このユニットは OrderAPI を実体化している」）を
  失うだけなので採らない（§ 選択肢で議論）。
- 既存の deploy-only 以外のファイルに対する挙動を変えない（regression を出さない）。
- 「system が存在しないファイルでは system タブに何か代替コンテンツを出す」
  （empty-state ヒント）は Issue 本文で sibling issue として延期されており、
  本 Issue の範囲外とする。

## 検討した選択肢

### 案1: 初期 `activeView` をコンパイル結果に応じて自動決定する（採用候補）

app 層で、ファイル読込 → コンパイル結果が出たタイミングで、
以下の条件に当てはまったら `activeView` を `"deploy"` に切り替える。

- `hasDeployDiagram === true`
- `resolvedSystems.length === 0`（=ファイルに `system` ブロックが無い）
- `activeView === "system"`（ユーザーがすでに別のタブを選んでいたら上書きしない）

実装場所は `useAppViews.ts` の `useEffect` が自然。
`entryPath` をキーにした `ref` で「このファイルでは一度スイッチ済み」を
記録し、ユーザーが後から明示的に System タブを選び直した場合には
再スイッチしない（UX 上のフリップを防ぐ）。

**Pros**
- Core を触らない。影響範囲が小さい。
- deploy-only ファイルを開いた瞬間に正しい絵が出る（報告された体験の直接的な修正）。
- system ブロックがあるファイル（99% のケース）は影響を受けない。

**Cons**
- 自動で画面がチラっと切り替わる挙動はユーザーに軽いサプライズを与える可能性がある。
  → ただし system 側は "No nodes to render" しか出ないので、切り替わる前の状態は
    ほぼ空画面。知覚上のコストは小さい。
- 「System を見たかっただけなのに勝手に Deploy に飛ばされた」との声があり得るが、
  system ブロックが無いファイルで system タブに価値は無いため、
  切り替え後に手動で System タブに戻すこともできる（ref で再スイッチを抑止）。

### 案2: 初期 `activeView` をリデューサで `null` にし、描画直前に解決する

`ActiveView` に `null` を許容して、初期値を未決定にする。
描画コンポーネントが `null` を受け取ったら、その時点のコンパイル結果から
「system か deploy か」を決める。

**Pros**
- リデューサ一箇所で初期化を一本化できる。

**Cons**
- 型拡張の波及範囲が広い（`ActiveView` が使われている全ての箇所で null 分岐が要る）。
- テストコードも多数書き直し。
- 実質やっていることは案1と同じで、実装コストだけ重い。

### 案3: deploy 側に `hasSystemDiagram` を追加して、描画判定で使う

core の compile 結果（`diagramType: "deploy"` 側）に `hasSystemDiagram` を足す。
app の useDeployView がそれを返し、AppShell がそれを見て判断する。

**Pros**
- 判断に必要な情報が対応する view の compile 結果から得られる形になる。

**Cons**
- いまでも system 側の compile 結果に `resolvedSystems` がすでに出ており、
  useAppViews で両方の結果が揃う状態なので、追加する必要が無い。
- 公開 API（CompileResult）への追加は慎重にやりたい。

### 案4: realizes 先が無い場合は unclassified に寄せる（Issue 本文の提案）

Issue 本文は "When no `realizes` target exists, fall back to the
`__unclassified__` container as today" としているが、**現行の実装はそうなっていない**
（コンテナは realizes の値でラベルされ生成される）。
仮にこれを unclassified に寄せるよう変更すると:

**Pros**
- system が無いときに「知らないサービスを参照している」状態を明示できる。

**Cons**
- ユーザーの意図（`realizes OrderAPI` と書いた）が描画上失われる。
- 既存の deploy-only 描画テスト（deploy-renderer.test.ts）と矛盾する可能性があり、
  regression リスクが大きい。
- そもそも本 Issue の体験上の問題（初期 view が system）には効かない。

→ 採らない。

## 比較

| 軸 | 案1 | 案2 | 案3 | 案4 |
|---|---|---|---|---|
| 実装コスト | 小 | 中 | 小〜中 | 小 |
| 影響範囲 | app の 1 hook | 型の波及 | core public API | core 描画 |
| 既存テストへの影響 | ほぼ無し | 多数 | 一部 | renderer テスト更新必要 |
| Issue 本体の体験修正 | ✅ | ✅ | ✅ | ❌ |
| ADR-20260312-03 尊重 | ✅ | ✅ | ✅ | ✅ |

## 現時点の方針

**案1 を採用する。**

### 実装の骨子

1. `packages/app/src/hooks/useAppViews.ts`
   - 内部に `autoSwitchedEntryRef = useRef<string | null>(null)` を持つ。
   - `useEffect(() => { ... }, [entryPath, activeView, hasDeployDiagram, resolvedSystems])` で
     下記条件を満たしたら `dispatch({ type: "SET_ACTIVE_VIEW", activeView: "deploy" })` を
     発行し、`autoSwitchedEntryRef.current = entryPath` を記録する。
     - `entryPath !== null`
     - `autoSwitchedEntryRef.current !== entryPath`（このファイルでまだ切り替えていない）
     - `activeView === "system"`
     - `hasDeployDiagram === true`
     - `resolvedSystems.length === 0`
2. ユニットテスト:
   - deploy-only ファイル → 自動で deploy に切り替わる
   - system を含むファイル → 切り替わらない
   - ユーザーが一度 System タブに戻した後は、同じファイルを選び直さない限り
     再スイッチしない
3. アクセプタンステスト: `docs/acceptance/766-deploy-only-render.md`
   に「deploy-only の `.krs` を開く → Deploy タブが自動選択され描画される」を記述。
4. サンプルフィクスチャ: `examples/deploy-only/index.krs`
   （上記 AT の手動検証用と、#735 での deploy diff fixture 用を兼ねる）。

### やらないこと（Out of scope）

- core の extractDeployView / renderer の変更。
- System view の empty-state メッセージ改善（sibling issue 待ち）。
- `realizes` 先が存在しない場合の unclassified 送り。
- organization / org-only ファイルの同等対応 → sibling issue [#817](https://github.com/kompiro/karasu/issues/817) で扱う。

## ADR 化の提案

案1 が採用され実装がマージされたら、ADR として記録するほどの「分岐点」ではないので
ADR 化は不要と判断する（core の挙動や syntax の決定は行っていないため）。
関連する挙動は ADR-20260327-01 の補遺として記述すれば十分。

---

## 追記（2026-04-26）: org-only ファイルへの横展開（Issue #817）

deploy-only と同じ症状が `organization` ブロックのみを含む `.krs` でも発生する
ことが分かっている（#817）。本セクションでは「同じパターンを org に複製する」
という方針を採るにあたって考えた点と、その判断根拠を残す。

### 横展開で答える必要があった 2 つの問い

#766 実装後のコードレビュー（PR #821）で、私が将来の横展開に向けて
2 つの未決定事項を Issue [#817](https://github.com/kompiro/karasu/issues/817#issuecomment-4318613833)
にコメントとして残していた。本追記で **deploy 側と同じ挙動を踏襲する** と決める。

#### 問い 1: `switchedEntryRef` の close+reopen 跨ぎでの永続性

deploy 側は「同じファイルを閉じて開き直しても、ref が `entryPath` を覚えているため
再スイッチしない」という sticky semantics を採っている。

| 候補 | 内容 | 判定 |
|---|---|---|
| **A. 同じ semantics を踏襲** | org 側でも ref はファイルを跨いでもクリアしない | ✅ 採用 |
| B. SELECT_FILE で ref をクリア | reopen 時に新規体験を提供 | ❌ |

採用理由:
- 2 つのフックで挙動が異なると、ユーザーから見て「deploy はスティッキーだが
  org はそうでない」という非直感的な差が生まれる。一貫性が UX の予測可能性を
  支える。
- そもそも karasu の現 UI に「ファイルを閉じる」明示的な操作は無く、
  別ファイルに切り替えて戻ってくるだけ。その場合は `entryPath` が変わるので
  ref も自然に更新される。
- 将来「ファイルを閉じて開き直したら新規体験」を要求するなら、deploy/org の
  両方で同時に変える方が筋が良い。今は両方とも sticky で揃える。

#### 問い 2: swap モード時に `effEntryPath` を渡すか raw `entryPath` を渡すか

deploy 側は `useAppViews` 内で `effEntryPath`（swap 時は compare 側のパス）を
渡している。これは「画面に表示している中身に最も適したタブを選ぶ」という
セマンティクス。

| 候補 | 内容 | 判定 |
|---|---|---|
| **A. `effEntryPath` を渡す（deploy と同じ）** | 表示中の中身に追従 | ✅ 採用 |
| B. raw `entryPath` を渡す | ユーザーの「ホーム」ファイルに追従 | ❌ |

採用理由:
- deploy 側で A を採った時点で、A は karasu の auto-switch ポリシー
  「いま画面に映している絵に合うタブを選ぶ」として確立した。org 側でも
  同じポリシーに従うのが整合的。
- ただし `swap + org-only な比較対象` という二重に絞られた稀なケースで
  「System タブを見ていたのに突然 Org に飛ばされた」とユーザーが感じる
  可能性は残る。これは deploy 側でも同じ性質の問題で、許容範囲と判断。

### 一般化（generic auto-switch hook）を見送った理由

deploy / org の 2 フックに共通点が多いため `useAutoSwitchView({ targetView, when })` の
ような汎用フックに統合する案も考えた。しかし:

- 共通部分は ~25 行で、抽象化のコストよりも 2 つの独立した薄いフックの方が
  読みやすい（`CLAUDE.md`「Three similar lines is better than a premature abstraction」）。
- 2 つのフックは「条件式」「dispatch するアクション」が異なるため、
  抽象化すると引数で渡すクロージャが増えて結局複雑になる。
- 3 個目の auto-switch（例: 仮想的な future view）が出るタイミングで
  リファクタするのが妥当。今は YAGNI。

### 実装の骨子

1. `packages/app/src/hooks/useAutoSwitchToOrg.ts`
   - 引数: `entryPath`, `activeView`, `hasOrg`, `hasSystem`,
     `hasDeployDiagram`, `dispatch`
   - 発火条件:
     - `entryPath !== null`
     - `switchedEntryRef.current !== entryPath`
     - `activeView === "system"`
     - `hasOrg === true`
     - `hasSystem === false`
     - `hasDeployDiagram === false`
   - 発火時: `dispatch({ type: "SET_ACTIVE_VIEW", activeView: "org" })`
2. `packages/app/src/hooks/useAppViews.ts`
   - 既存の `useAutoSwitchToDeploy(...)` の後ろに `useAutoSwitchToOrg(...)` を追加。
   - `hasOrg = organizations.length > 0` を `useOrgView` の戻り値から渡す。
3. ユニットテスト `useAutoSwitchToOrg.test.ts`:
   - org-only ファイル → 自動で org に切り替わる
   - org + system のファイル → 切り替わらない（hasSystem=true）
   - org + deploy のファイル → 切り替わらない（hasDeployDiagram=true）
     - このケースでは deploy 側のフックが先に deploy へ切り替えるので、
       org 側は activeView !== "system" の条件で発火しない、という動きを
       カバーする
   - org の無いファイル → 切り替わらない
   - 同一ファイルで System に戻した後は再スイッチしない（sticky 検証）
   - 別ファイルへ切り替えると再スイッチする
4. アクセプタンステスト `docs/acceptance/0064-org-only-render.md` を新規作成
   （AT-0063 と並列の構成）。
5. サンプルフィクスチャ `examples/org-only/index.krs`。

### deploy/org 両フックの相互作用

両方のフックが `useAppViews` から呼ばれる。実行順序は **deploy → org**（コード上）。

| ファイル種別 | hasSystem | hasDeploy | hasOrg | deploy フック | org フック | 最終 active |
|---|---|---|---|---|---|---|
| system のみ | ✅ | - | - | 発火せず | 発火せず | system |
| deploy のみ | - | ✅ | - | system→deploy | activeView!=system で発火せず | deploy |
| org のみ | - | - | ✅ | 発火せず | system→org | org |
| system+deploy | ✅ | ✅ | - | hasSystem で発火せず | hasDeploy で発火せず | system |
| system+org | ✅ | - | ✅ | 発火せず | hasSystem で発火せず | system |
| deploy+org | - | ✅ | ✅ | system→deploy | hasDeploy で発火せず | deploy |
| 全部入り | ✅ | ✅ | ✅ | hasSystem で発火せず | hasSystem で発火せず | system |

優先度は「system > deploy > org」で固定。これは ADR-20260312-03 の
「論理（system）が中心、deploy は物理層、org は組織情報の補助」という
位置付けと整合する。

### Out of scope（org 拡張版）

- 「strict org-only ではない、org が唯一中身のあるブロック」のような
  ヒューリスティクス（Issue 本文で out-of-scope と明記）。
- 優先順位（system > deploy > org）の設定変更 UI。

### ADR 化の判断（org 拡張版）

deploy 側と同じ理由で ADR 化は不要。本 design doc 内の追記として残し、
deploy/org 両フックの優先度ルール（上の表）が将来の参照点になる。
