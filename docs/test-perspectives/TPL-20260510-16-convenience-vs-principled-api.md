---
id: TPL-20260510-16
title: "consumer の境界では convenience API ではなく principled API を使う"
status: active
date: 2026-05-10
applicable_to:
  - "同じ責務に対して `convenience（軽量・限定）` と `principled（正規・full）` の 2 種類の API を持つ関数ペアを呼び分ける箇所"
  - "compile / compileProject、parse / parseAsync、Sync 系 / Async 系、single-file / multi-file など"
  - "package boundary / IPC / CLI / IDE プラグインなど、外部から karasu を呼び出すレイヤー"
known_consumers:
  - vscode-extension
  - cli-entry
related_to:
  - TPL-20260510-11
discovered_from:
  - issue: "#239"
  - issue: "#507"
  - root_cause_file: "packages/vscode/src/preview-panel.ts:143"
  - root_cause_file: "packages/cli/src/index.ts:442"
topic: cli
scope:
  packages:
    - vscode
    - cli
    - core
---

# TPL-20260510-16: consumer の境界では convenience API ではなく principled API を使う

## 観点

karasu の core は同じ操作に対して **「convenience（軽量・限定）」** と **「principled（正規・full）」** の 2 種類の API を提供することがある:

| convenience | principled | 違い |
|---|---|---|
| `compile(text)` | `compileProject(uri, fs)` | 後者は `import` / multi-file を解決する |
| `program.parse()` | `program.parseAsync()` | 後者は async handler の Promise を await |
| 内部限定 helper | 公開 API | 後者はエラー伝播 / cancellation など完備 |

convenience API は便利でシグネチャが小さいので **consumer が無自覚に選んでしまう**。だが consumer 境界（VS Code 拡張、CLI エントリ、IPC ハンドラなど）では、principled API が想定する完全な振る舞い（import 解決 / async 完了 / error 伝播）が必要なことが多い。**convenience を選ぶと「動いているように見えるが特定の構文で破綻する」「特定の経路で error が消える」** といった silent な機能欠落になる。

#239 では preview panel が `compile()` を使っており `import { ... } from "./other.krs"` を無視していた。複数ファイル構成の `.krs` で preview が壊れることに気付くのが遅れた。#507 では CLI エントリが `program.parse()` を使っており async action handler の Promise が await されず、handler 内例外が unhandled rejection として漏れる構造になっていた。

## 想定される失敗モード

- consumer が動くように見えるが、**機能の一部だけサイレントに無効化** されている（multi-file 構成で preview が更新されない、async handler のエラーが exit code に反映されない）
- ユーザー報告ベースでしか発見されない（開発者の手元では single-file / sync ケースしかテストしないため）
- 後から principled API に切り替えるとシグネチャが大きく変わり、consumer 全体の書き換えが必要になる
- 同じ pattern の bug が 2 つ以上見つかった時点で、**convenience API の存在自体が rationale を持つか** を再評価すべきサイン

## チェックリスト

consumer 境界（拡張 / CLI / IPC / package public API）で karasu core を呼ぶとき、以下を確認する:

- [ ] 呼ぶ関数に **convenience / principled の双子が存在するか** 確認したか（grep で `compile` / `parse` などの名前を含む関数を一覧する）
- [ ] convenience を選ぶ場合、principled が提供する追加の振る舞い（multi-file / async / error 伝播）が **不要であることが明確** か。Design Doc / コメントで根拠を残しているか
- [ ] consumer 境界では **default で principled** を選び、convenience を選ぶのは「principled がオーバースペックである理由」が言える場合だけにしているか
- [ ] convenience の存在が「テストやスクリプト用の補助 API」として明確にラベル付けされているか（公開 API として晒すと misuse を誘発する）

## 既知の対処パターン

- consumer 境界で principled を default にする方針を README / CONTRIBUTING に明記する。convenience は **"internal use only" / "test fixture only"** とコメントを付ける
- 双子の API では関数名で区別を強める（`compileText` vs `compileProject`、`runSync` vs `run`）。同名で signature 違いだと consumer が type だけ見て選ぶリスクが高い
- convenience を呼んでいる consumer が見つかったら、そのコードに **TPL-16 を引用したコメント** を付けて「ここは principled でない理由」を明示するか、principled に切り替える
- consumer 境界の test では multi-file fixture / async error の経路を **必ず 1 件以上** 含めて、convenience を選んだ場合に regression を出せるようにする

## 関連テスト

- `packages/vscode/test/preview-panel.test.ts`
- `packages/cli/test/index.test.ts`
