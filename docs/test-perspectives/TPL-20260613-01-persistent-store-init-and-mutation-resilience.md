---
id: TPL-20260613-01
title: "永続ストアの初期化・更新は fail-closed に — RMW は直列化し、not-found と read error を区別する"
status: active
date: 2026-06-13
applicable_to:
  - "OPFS / localStorage / IndexedDB などのクライアント永続ストアに対するインデックス・メタデータの read-modify-write（プロジェクト一覧、スナップショット索引、設定の集合など）"
  - "起動時に永続ストアを読み、空なら seed する初期化フロー（とくに React の useEffect での非同期 bootstrap）"
  - "「ファイルが無い → 空とみなす」フォールバックを catch で実装している箇所"
known_consumers:
  - project-manager
  - project-bootstrap
discovered_from:
  - issue: "#1530"
  - issue: "#1531"
  - root_cause_file: "packages/app/src/fs/project-manager.ts"
  - root_cause_file: "packages/app/src/hooks/useProjectInitialization.ts"
related_to:
  - TPL-20260510-17
topic: app-ui
scope:
  packages:
    - app
---

# TPL-20260613-01: 永続ストアの初期化・更新は fail-closed に — RMW は直列化し、not-found と read error を区別する

## 観点

ブラウザの永続ストア（OPFS 等）に「一覧／索引」を JSON で持ち、その上で CRUD する設計は、3 つの落とし穴を同時に踏みやすい。いずれも **「機能が壊れる」形ではなく「ユーザーのデータが静かに消える / アプリが固まる」形** で表面化する。

1. **read-modify-write の非直列化（lost update）** — `list()` → `push()` → `save()` を直列化せずに並行実行すると、後発の `save()` が先発の書き込みを丸ごと上書きする。#1531 では `createProject` が毎回 `projects.json` を read-modify-write しており、import 中の create や **React StrictMode の二重 bootstrap** で索引が消えた。
2. **not-found と read/parse error の混同** — 「ファイルが無い → `[]`」を `try { read } catch { return [] }` で実装すると、**破損・部分書き込み・パースエラーも `[]` に化ける**。直後の create/import が `[]` を保存して **他の全プロジェクトを抹消** する。#1531 の core。
3. **非同期 bootstrap が fail-open** — `await load(); ...; dispatch(loadingDone)` で、途中の throw（OPFS 不可・quota 超過・破損）を握らないと `loadingDone` が永遠に発火せず、画面が「Loading…」のまま固まる（#1530）。さらに StrictMode の二重実行で seed が二重に走る。

## 想定される失敗モード

- プロジェクト/スナップショット/設定が「いつの間にか減っている / 消えている」（lost update・error→[] 上書き）
- プライベートブラウジングや storage 満杯で **永久ローディング**（fail-open bootstrap）
- 開発時だけ seed が二重に入る（StrictMode 二重 effect）
- いずれもハッピーパスのテストは緑。並行・エラー・二重実行の条件でしか出ない

## チェックリスト

永続ストアの索引/メタデータを読み書きする実装・修正時に確認する:

- [ ] index の **read-modify-write を直列化** しているか（mutation キュー / ロック）。「複数 create を await せず並行発火 → 全件残る」テストがあるか
- [ ] `list()` が **「存在しない（→空）」と「読めた but 壊れている（→throw）」を区別** しているか。`exists()` で分岐する、もしくは not-found 例外だけ握る。**「壊れた索引で list() は throw する」negative test** があるか
- [ ] JSON を読んだ後、**型ガード**（`Array.isArray` 等）で想定形を検証しているか
- [ ] 非同期 bootstrap が **try/catch/finally** になっていて、`finally` で loading を必ず解除しているか。**「load が throw したら error state を出し loading を解除する」テスト** があるか
- [ ] one-shot 初期化が **StrictMode の二重 effect 実行に耐える**か（`useRef` ガード / OPFS マーカー）。「effect が二回走っても seed は一回」テストがあるか
- [ ] 失敗時にユーザーへ surface する経路（error 画面 / バナー）があるか。無言で握りつぶしていないか

## 既知の対処パターン

- mutation を `private queue: Promise<unknown>` にチェーンし、各 CRUD を `enqueue(() => readModifyWrite())` で直列化する。rejection で後続が止まらないよう、チェーンは成否を握りつぶして繋ぐ（`packages/app/src/fs/project-manager.ts` の `enqueue`）
- `list()` は `if (!(await fs.exists(META_PATH))) return []` で not-found を先に弾き、それ以外の read/parse 失敗は throw させる
- bootstrap effect は `try { ... } catch (e) { dispatch(SET_INIT_ERROR) } finally { dispatch(SET_LOADING false) }`、かつ `const started = useRef(false)` で二重実行をガード
- TPL-20260510-17（trust boundary）と地続き: **外部・永続の境界はどちらも「未検証/不確実な入力」として扱い、fail-closed にする**

## 派生元 spec

なし（retrospective TPL — #1530 / #1531 の bug 修正から抽出）。

## 関連テスト

- `packages/app/src/fs/project-manager.test.ts`（corrupt metadata → throw / 並行 create で lost update しない）
- `packages/app/src/hooks/useProjectInitialization.test.ts`（bootstrap throw → SET_INIT_ERROR + loading 解除 / StrictMode 二重実行で seed 一回）
