# Deploy-only file rendering

- **日付**: 2026-04-23
- **ステータス**: 検討中
- **関連**:
  - Issue [#766](https://github.com/kompiro/karasu/issues/766)
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
