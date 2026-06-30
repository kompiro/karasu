# Deep permalink: 構造要素 / view への深いパーマリンク

- **日付**: 2026-06-29
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1827](https://github.com/kompiro/karasu/issues/1827)（permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826) の子）
  - PRD: `docs/prd/keystone-primary-path.md`（[#1825](https://github.com/kompiro/karasu/issues/1825)）
  - 隣接: comprehension pillar の drill/focus（[#1817](https://github.com/kompiro/karasu/issues/1817)）/ taka 連携（[#1829](https://github.com/kompiro/karasu/issues/1829)）
  - 関連 ADR: [ADR-20260626-01](../adr/20260626-01-karasu-nest-hosted-preview.md)（nest hosted preview）/ [ADR-20260626-04](../adr/20260626-04-karasu-nest-ogp-share-page.md)（OGP share page `/s?s=`）
  - 関連 TPL: [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)（trust boundary validate）/ [TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)（id を identity に使う）/ [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)（drill-down first-class）/ [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)（parallel parity）/ [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md)（enum 網羅）
  - コード: `packages/app/src/hooks/useHistoryNavigation.ts` / `packages/app/src/utils/inline-share.ts` / `packages/app/src/App.tsx` / `packages/core/src/share/synthesize.ts` / `packages/core/src/renderer/drill-down-svg.ts`

## 背景・課題

keystone PRD は「ADR が karasu 構造の *特定の部分*（あるサービス・ドメイン・ある view）にリンクし、読者がそのリンクをクリックすると**ちょうどその要素**に着地する」ことを要求する。

今日の nest share（`#s=<payload>` / `/s?s=<payload>`）は**モデル全体**しか指せない。share URL を開くと in-memory プロジェクトが root view で開くだけで、「この要素を見せる」を URL に載せる手段がない。

埋め込み済みの足場は2つある:

1. **SPA 内の deep anchor** — `useHistoryNavigation` が `#krs-<view>-<node>:highlight?file=<path>` を encode / decode し、mount 時と popstate で復元する。これは「開いているプロジェクト内で要素にドリル / フォーカスする」アンカーで、すでに存在する。
2. **静的 SVG の `:target` ドリル** — `drill-down-svg.ts` が `id="krs-<view>-<sanitizeId(id)>"` の `<g>` を吐き、純 CSS `:target` + `:has()` でドリルする。`<svg-url>#krs-system-Payment` を開けば JS なしで当該レベルに着地する。

つまり「要素アンカー」のスキーム自体は両サーフェスにすでにあり、**share payload と組み合わさっていない**ことだけが欠けている。`inline-share.ts` のコメントは fragment key を `krs` ではなく `s` にした理由を「drill-down hash（`#krs-...`）と衝突させないため」と明記しており、両者は意図的に分離されている。

本 Design Doc は #1827 のスコープ（#1826 のレビューで「share URL + 静的 SVG の両サーフェス」と確定）に対し、(A) share URL に deep target を載せる encoding、(B) 静的 SVG アンカーを安定した contract として spec 化する方針を決める。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| share 復元 | `App.tsx` が mount 時に `readSharedProjectFromHash(location.hash)` を1回読む。`#s=<payload>` のみ解釈。payload があれば `MemoryModeApp` を `initialKrs` / `initialStyle` で開く |
| share payload | `SharePayload = { krs: string; style?: string }`（`synthesize.ts`）。JSON → deflate → base64url で `#s=` / `/s?s=` に載る。version field なし |
| SPA deep anchor | `useHistoryNavigation` の `buildHash` / `parseHash`。`#krs-<view>-<node>:highlight?file=<path>`。`view ∈ {system, deploy, org, matrix}`（`ActiveView` union、exhaustive switch で網羅強制 = TPL-20260510-03）。node は `sanitizeId(id)` で正規化。mount 時に `nodePathIndex` / `orgPathIndex` 経由で viewPath に遅延解決、popstate も対応 |
| 静的 SVG anchor | `drill-down-svg.ts`。`id="krs-<viewPrefix>-<sanitizeId(id)>"`、back ボタンは `href="#krs-<view>-<parent>"`。CSS `:target` でレベル切替。deploy/system のペイン切替も `[id^="krs-deploy-"]:target` に依存 |
| server `/s?s=` | OGP unfurl（ADR-20260626-04）。`s` を base64url charset で validate（TPL-20260510-17）し、`/render?...&format=png` の og:image を出す。人間訪問者は `/#s=<payload>` に bounce |
| 衝突回避 | fragment key `s` は `krs` と別名（`inline-share.ts` の明示コメント）。現状 `#s=` と `#krs-` は相互排他 |

**重要な一致**: SPA の `buildHash` も静的 SVG も同じ `krs-<view>-<sanitizeId(id)>` 形を使う。アンカーは既に両サーフェスで揃っており、これを**不変条件として固定**できれば、1つの deep link が両サーフェスで可搬になる。

## 制約・前提

- **後方互換**: 既存の `#s=<payload>`（target なし）URL は今まで通りモデル全体を root で開く。target なし payload を新 app が読んでも、target あり payload を旧 app が読んでも壊れない（graceful degradation）。
- **identity は `id`**（TPL-20260510-20）: アンカーは node の author-given `id` を指す。label / 翻訳文字列は使わない。rename でアンカーが壊れるのは原理的に不可避で、本 Issue のスコープ外（安定化は #1830 の `adr:check-assumptions` 拡張で検証する）。
- **trust boundary**（TPL-20260510-17）: target 文字列は server `/s` route と SVG / HTML に流れうる。`s` payload の base64url charset チェックの内側にある（= Option B）なら追加の echo 面はないが、target を別 query / fragment（Option A）にすると新たな validate 面が増える。
- **drill-down は first-class**（TPL-20260510-21）: deep link は「全部見せる」ではなく当該要素にドリル / フォーカスして着地する。
- **スコープ外**: repo-backed / ref-pinned 解決（#1828）、taka 短縮の実装（#1829、本 Doc は「短縮しやすい形か」だけ考慮）、focus UI そのものの作り込み（#1817）。

## 検討した選択肢（share URL の deep target encoding）

### 案A: fragment に sibling key を足す（`#s=<payload>&t=<view>-<node>:<highlight>`）

payload は opaque のまま、target を別セグメントとして並べる。`t=` の中身は既存の `#krs-<view>-<node>:highlight` と同じ文法にして `parseHash` / `buildHash` を再利用する。share 復元後、`MemoryModeApp` mount で `location.hash` に残った `&t=...` を `useHistoryNavigation` が拾ってドリルする。

**メリット**

- target が human-readable / 手編集可能。
- SPA 側の `parseHash` / `buildHash` を素直に再利用できる（target 文法が同一）。
- payload schema を変えない。

**デメリット**

- `readSharedProjectFromHash` と `parseHash` が互いのセグメント（`s=` と `t=`）を許容するよう両方に glue が要る。現状 `parseHash` は `#s=...&t=...` を解釈できない。
- **server `/s?s=` の deep 化に追加面が要る**: fragment は server に届かないので、unfurl を target に追従させるには `&t=` を query param にも載せ、`/s` route で別途 validate（TPL-20260510-17）→ og:image へ echo する必要がある。trust boundary の面が1つ増える。
- 1つの URL に2トークン（payload + target）。taka 短縮の単位が増える。

### 案B: target を SharePayload に埋め込む（`#s=<payload>` 単一トークン、target は圧縮 JSON の内側）

`SharePayload` に optional な `target` を足す:

```ts
interface SharePayload {
  krs: string;
  style?: string;
  /** deep permalink target — 無ければモデル全体を root で開く */
  target?: {
    view: ActiveView;          // "system" | "deploy" | "org" | "matrix"
    path: string[];            // ドリル先の node id 列（viewPath）。空 = root レベル
    highlight?: string;        // フォーカス強調する node id（任意）
    orgTree?: boolean;         // org の Tree View モード（任意）
  };
}
```

share 復元時、`App.tsx` → `MemoryModeApp` が `payload.target` から初期 `activeView` / `viewPath` / `highlightedNodeId` を seed する。`useHistoryNavigation` の既存の遅延解決（`nodePathIndex` が揃うまで pending）にそのまま乗せる。

**メリット**

- **単一 opaque トークンが全形で同一に効く**: fragment（`#s=`）でも server query（`/s?s=`）でも taka 短縮形でも、target がトークンに同梱されるので deep 化が自動。server `/s` の追加 validate 面はゼロ（既存の base64url チェックの内側）。
- OGP og:image も将来 target に追従してフォーカス描画できる余地（本 Issue では未実装）。
- taka（#1829）は1トークンを短縮するだけ。
- graceful degradation: 旧 app は未知の `target` を無視 → モデル全体で開く。新 app が target なし payload を読む → 従来通り。version field 不要。

**デメリット**

- payload schema を1フィールド広げる（ただし optional で前方後方互換）。
- share encode が navigation 語彙（`ActiveView` / viewPath）に依存する。`core` の `SharePayload` 型が app の navigation 概念を持つことになる（型は `core` 側に置くが、値の意味は app と共有）。
- target は payload の内側なので人間が URL から読めない / 手編集しにくい。

## 比較

| 観点 | 案A（sibling fragment key） | 案B（payload 埋め込み） |
| --- | --- | --- |
| 変更量 | parseHash/readShared 双方に glue + server `/s` に `&t=` | SharePayload に1フィールド + MemoryMode の seed |
| server `/s?s=` deep 化 | 追加の query + validate 面が要る | トークン同梱で自動・追加面ゼロ |
| trust boundary 面 | 1面増える（TPL-20260510-17） | 増えない |
| taka 短縮単位 | 2トークン | 1トークン |
| target の可読性 / 手編集 | できる | できない（圧縮内） |
| 後方互換 | payload 不変 | optional field（前方後方とも degrade で安全） |
| 既存 parseHash 再利用 | そのまま | seed 経路を別に書く |

## 現時点の方針

**案B（target を SharePayload に埋め込む）を採用する。**

決め手は server `/s?s=` 経路と taka（#1829）との整合。permalink は最終的に「ADR に貼る1本の URL」であり、epic #1826 はそのターゲットを *app/nest URL* と定義している。target をトークンに同梱すれば、fragment / server query / taka 短縮形のすべてで deep link が同一に効き、`/s` の unfurl も将来フォーカス描画へ素直に拡張できる。trust boundary の追加面（TPL-20260510-17）を増やさない点も大きい。案A の唯一の優位（URL から target を手編集できる）は permalink のユースケース（生成して貼る）では効用が小さい。

ただし `target` の **文法は静的 SVG の `#krs-<view>-<sanitizeId(id)>` と1対1対応させる**（下記 contract）。これにより案B の payload-内 target と、静的 SVG / SPA hash の plaintext アンカーが相互変換可能になり、案A の「human-readable アンカー」も静的 SVG サーフェス側で温存される。

### 静的 SVG / SPA アンカー contract（両サーフェス共通）

`docs/spec/` に deep-link アンカーの安定 contract を新設する:

- **形**: `#krs-<view>-<sanitizeId(nodeId)>`。`view ∈ ActiveView`。`:<highlight>` 接尾は SPA hash のみ（静的 SVG は `:target` 単一なので highlight 接尾は持たない）。
- **identity は `id`**（TPL-20260510-20）。label は使わない。
- **正規化は `sanitizeId`** に一元化。SPA `buildHash` と `drill-down-svg.ts` が同じ関数を使う不変条件を**parity test**（TPL-20260510-11）で固定する。
- **安定性 caveat を明記**: node rename はアンカーを壊す。検証は #1830 に委ねる旨を spec に書く。
- spec 章追加に伴い **proactive TPL を同 PR で1件**起こす（CLAUDE.md の spec 改訂ルール）: 「deep-link アンカーは `id` ベースで両サーフェス（SPA hash / 静的 SVG）が同一スキームを保つ」。spec 章末に `> Related TPLs:`、TPL 末尾に「## 派生元 spec」で双方向リンク。

### 実装の指針

1. **core**: `SharePayload` に optional `target` を追加（`synthesize.ts`）。`synthesizeSharePayload` は target を受け取らない（既存の全体 share はそのまま）。target は app 側で「現在の view 状態」から組み立てて付与する別経路 helper を `inline-share.ts` に置く。`ActiveView` を core が直接 import しない設計にするため、`target.view` は `string` リテラル union として core 側に最小定義し、app の `ActiveView` と型整合させる（または core の中立な型として定義し app が satisfies する）。
2. **app / encode**: ShareDialog（`components/ShareDialog.tsx`）に「現在のドリル位置 / フォーカスを含める」オプションを追加し、`buildShareUrls` 系へ現在の `activeView` / `viewPath` / `highlightedNodeId` / `isOrgTreeView` を渡して `target` を載せる。
3. **app / decode**: `App.tsx` の `sharedPayload` 経路で `payload.target` を `MemoryModeApp` に渡し、初期 `activeView` / `viewPath` / `highlight` / orgTree を seed。`useHistoryNavigation` の既存遅延解決（`nodePathIndex`/`orgPathIndex` が揃うまで pending）に相乗りする。seed 後は通常の hash 同期（`#krs-...`）に引き継ぐので、共有閲覧者がさらにドリルしても破綻しない。
4. **静的 SVG contract**: `docs/spec/` にアンカー contract 節を追加。`buildHash`（app）と `drill-down-svg.ts`（core）の `sanitizeId` 一致を parity test で固定。proactive TPL を同 PR で起こし双方向リンク。
5. **i18n**: ShareDialog の新オプション文言を en/ja に追加（`docs/spec/i18n.md` 準拠）。
6. AT: `docs/acceptance/` に新規ファイル。TC は:
   - `#s=<payload(target=service)>` を開くと当該 service レベルにドリルして着地する
   - target に highlight を含むと当該 node がフォーカス強調される
   - target なしの旧 `#s=` URL は従来通りモデル全体 root で開く（後方互換）
   - 存在しない / rename 済み node id を指す target は、エラーにせず root（または最近接の解決可能レベル）にフォールバックする
   - 静的 SVG を `<url>#krs-system-<id>` で開くと CSS `:target` で当該レベルが表示される（contract）
   - SPA `buildHash` と `drill-down-svg.ts` のアンカーが同一 id で一致する（parity）
7. ADR 昇格: 実装完了後、`docs/adr/<番号>-permalink-deep-element.md` として昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし。target なし `#s=` URL は不変の挙動。
- ドキュメント更新: `docs/spec/`（アンカー contract 節 + proactive TPL 双方向リンク）、`docs/concepts*.md`（permalink layer の用語に触れる場合）、ADR-20260626-04 から本アンカー contract への相互参照。
- テスト・examples への影響: なし（新規 AT / parity test のみ追加）。

## 未解決の問い / 決めないこと

- **OGP の focused og:image**: server `/s?s=` の unfurl 画像を target に追従させてフォーカス描画するのは案B なら可能だが、本 Issue では未実装（`/render` 側の focus 引数が必要）。フォローアップ。
- **rename 安定化**: アンカーが壊れる問題の検出は #1830（`adr:check-assumptions` 拡張）に委ねる。
- **`target.view` 型を core / app でどう共有するか**の最終形（core に中立 union を置く vs app の `ActiveView` を import）は実装時に確定。core が app の navigation 概念に依存しすぎない置き方を優先する。
