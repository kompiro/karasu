# AT: client は realizes / owns の対象になれる

- **日付**: 2026-06-23
- **関連 Issue**: [#1720](https://github.com/kompiro/karasu/issues/1720)
- **関連 ADR**: [ADR-20260623-02](../adr/20260623-02-client-realize-owns-target.md)
- **対象ファイル**: `packages/core/src/resolver/warnings.ts`, `packages/core/src/parser/parser.ts`

## 受け入れ条件

### `realizes` の client 拡張

- [x] deploy unit が system 内の client を realize しても `unresolved-realizes` 警告が出ない

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `resolves a deploy unit realizing a system-nested client (ADR-20260623-02)`

- [x] deploy unit が top-level（unassigned）の client を realize しても警告が出ない

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `resolves a deploy unit realizing a top-level (unassigned) client`

### `owns` の client 拡張

- [x] team が system 内の client を `owns` しても `invalid-owns`（resolver）警告が出ない

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `does not warn when owns references a client ID (ADR-20260623-02)`

- [x] team が top-level の client を `owns` しても `invalid-owns` 警告が出ない

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `does not warn when owns references a top-level client ID`

- [x] team が client を `owns` しても parser の `owns-target-not-found` 警告が出ない（system 内 / top-level 両方）

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › `does not emit owns-target-not-found when owns references a client (ADR-20260623-02)` / `... a top-level client`

### deploy / org view への描画

- [x] client を realize する deploy unit が、その client のコンテナ配下にグルーピングされ、ラベルが解決される

  > ✅ Automated — `packages/core/src/view/deploy-view-extract.test.ts` › `forms a container for a deploy unit realizing a client, with the label resolved (#1720)`

- [x] team が owns するノードは kind に依存せず `data-owned-service-button` として描画される（client も同じ経路）

  > ✅ Automated — `packages/core/src/renderer/org-renderer.test.ts` › `renders owned services as clickable data-owned-service-button elements`（owns は kind 非依存で描画される機構の確認）

### 手動確認

- [ ] app で `index.krs` に `system S { client Web [web] { label "Web" } }`、`deploy { assets WebBundle { realizes Web } }`、`organization O { team t { owns Web } }` を書き、(1) deploy view で `WebBundle` が `Web` のコンテナ内に描画され、(2) org view で team `t` の owned ボタンに `Web` が出て、(3) いずれの view でも警告パネルに realizes / owns 由来の警告が出ないことを目視確認する

  > ⏳ Manual — 3 view（system / deploy / org）にまたがる結合結果のため目視で確認する
