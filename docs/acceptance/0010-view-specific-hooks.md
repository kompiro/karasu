# View-Specific Hooks Refactoring

- **Date**: 2026-03-26
- **Status**: Done
- **Issue**: #46

## Overview

`useKarasu` / `useKarasuProject` を view 単位のフックに分割し、`useOrgView` と一貫したアーキテクチャにする。

## Acceptance Criteria

### AC-1: System/Deploy タブ切り替えが正常に動作する（Project mode）

1. プロジェクトを開く
2. System タブが表示されていることを確認する
3. Deploy タブをクリックする
4. Deploy ダイアグラムが表示されることを確認する
5. System タブに戻す
6. System ダイアグラムが正しく表示されることを確認する

### AC-2: ファイル編集時に両 view が更新される（Project mode）

1. プロジェクトを開き System タブを表示する
2. エディタで `.krs` ファイルを編集する（例：ノードを追加）
3. System ダイアグラムが更新されることを確認する
4. Deploy タブに切り替える
5. Deploy ダイアグラムも更新されていることを確認する

### AC-3: Memory mode の System view が正常に動作する

1. Memory mode（`?memory=1` パラメータ）でアプリを開く
2. エディタでソースを編集する
3. System ダイアグラムがリアルタイムで更新されることを確認する

### AC-4: パースエラー時に直前の valid な SVG が保持される

1. プロジェクトを開き、正常なダイアグラムが表示されている状態にする
2. エディタに構文エラーを含む内容を入力する
3. ダイアグラムが消えず、エラー前の SVG が保持されることを確認する
4. System / Deploy 両方のタブで確認する
