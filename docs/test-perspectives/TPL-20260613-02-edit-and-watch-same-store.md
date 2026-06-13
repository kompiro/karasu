---
id: TPL-20260613-02
title: "自分で書き込みつつ監視するストアでは、書き込みを直列化し自己エコーと非同期 read レースを処理する"
status: active
date: 2026-06-13
applicable_to:
  - "エディタのオートセーブのように、同じファイル/キーへ自分で write しつつ、その変更を watch/subscribe して buffer に反映する UI"
  - "高速に切り替わる選択（ファイルツリーのクリック、タブ切替）で非同期 read → state 反映する箇所"
  - "read 失敗時に「空」へフォールバックし、その空 buffer が後続の書き込みで永続化されうる箇所"
known_consumers:
  - editor-autosave
  - file-selection
discovered_from:
  - issue: "#1535"
  - issue: "#1536"
  - root_cause_file: "packages/app/src/components/AppShell.tsx"
  - root_cause_file: "packages/app/src/hooks/useFileSelection.ts"
related_to:
  - TPL-20260613-01
topic: app-ui
scope:
  packages:
    - app
---

# TPL-20260613-02: 自分で書き込みつつ監視するストアでは、書き込みを直列化し自己エコーと非同期 read レースを処理する

## 観点

「同じファイルへ自分で write し、かつその変更を watch して buffer に反映する」ループ（エディタのオートセーブ）と、「高速に切り替わる選択で非同期 read → 反映」する経路には、ハッピーパスでは出ない 3 つの罠がある。いずれも **ユーザーの入力が静かに巻き戻る / 上書き消失する** 形で表面化する。

1. **書き込みの非直列化（reorder）** — キーストロークごとに `writeFile` を並行発火すると、OPFS は `close()` でコミットするため **古い write が新しい write の後にコミット** し、ディスクに古い内容が残る。次回ロードで直近の入力が失われる（#1535）。
2. **自己エコーの誤検知** — write を watch しているので、自分の write も change イベントで返ってくる。echo ガードを「現在の buffer と一致したら無視」だけで実装すると、**中間の自己 write（新しい write の後にコミットした古いキーストローク）は buffer と異なる** ため「外部変更」と誤認し、エディタを古い内容に巻き戻す（#1535）。
3. **非同期 read レース + 空フォールバックの上書き** — A をクリック→B をクリックで、A の read が B より後に解決すると最後の dispatch が A になり誤ったファイルを表示する。さらに read 失敗時に空内容へフォールバックすると、**存在するファイルに対する一時的な read 失敗で空 buffer に着地** し、次のキーストロークが実ファイルを空で上書きする（#1536）。

## 想定される失敗モード

- タイプ中に直近の数文字が突然消える / 古い内容に戻る（write reorder・自己エコー巻き戻し）
- ファイルを素早く切り替えると違うファイルの内容が出る（read レース）
- 一瞬の I/O エラーの後にタイプすると実ファイルが空で保存される（空フォールバック上書き）
- いずれも単発操作のテストは緑。並行・高速操作・エラー注入でしか出ない

## チェックリスト

watch + write するストア / 非同期選択を実装・修正するとき:

- [ ] 自分の write を **直列化**しているか（`SerialQueue` 等）。並行 write が reorder してディスクが古い値で終わらないか
- [ ] watch の echo ガードが **中間の自己 write も識別**できるか。「現在 buffer と一致」だけでなく **最近自分が書いた値の集合**（または世代トークン）で判定しているか。外部 write は素通しされるか
- [ ] 非同期選択に **シーケンストークン**があり、最新の選択だけが state を更新するか（遅い先行 read が後勝ちしないか）
- [ ] read 失敗時に **「存在しない（→空で良い）」と「存在するが read 失敗（→空で着地させない）」を区別**しているか。空 buffer が後続書き込みで実ファイルを上書きしないか
- [ ] 巻き戻り / 取り違え / 空上書きの **negative テスト**（並行 write・out-of-order read・exists+read失敗）があるか

## 既知の対処パターン

- editor 書き込みを `SerialQueue.run()`（`packages/app/src/fs/serial-queue.ts`、TPL-20260613-01 と共用）で直列化 → ディスクは最新値で終わる
- 直近 write の値を bounded set に記録し、watcher は `isOwnWrite(fresh)` で自己エコー（中間含む）を抑止。外部 write は集合に無いので反映される（`useSerializedFileWrite` + `useEditorExternalRefresh`）
- 非同期選択は `const seq = ++latest.current; … if (seq !== latest.current) return;` で最新のみ反映（`useFileSelection`）
- read 失敗時は `fs.exists()` で分岐し、存在するなら空 buffer に着地させず選択を中止する

## 派生元 spec

なし（retrospective TPL — #1535 / #1536 の bug 修正から抽出）。

## 関連テスト

- `packages/app/src/hooks/useSerializedFileWrite.test.ts`（直列化・自己 write 追跡・bounded 退避）
- `packages/app/src/hooks/useEditorExternalRefresh.test.ts`（中間自己 write の抑止 / 外部 write は反映）
- `packages/app/src/hooks/useFileSelection.test.ts`（out-of-order read で最新が勝つ / exists+read失敗で空上書きしない）
