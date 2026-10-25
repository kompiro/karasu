---
name: demo-video
description: >
  Record captioned MP4 demo videos of karasu features (the karasu app via `karasu serve`,
  or the VS Code extension) from a written highlight, in English and/or Japanese, by driving
  the real app on a virtual display and recording the screen. Use it for weekly highlights,
  release notes, dev.to / blog posts, or any "show this feature in a short video" request.
  Trigger when the user says: "デモ動画", "動画を作って", "mp4 で", "ハイライトの動画",
  "英語の動画", "demo video", "record a demo", "make an mp4", "screen recording of the feature",
  or similar phrases asking for a video of karasu behavior.
---

# Demo Video

## 到達状態

終わったとき、次が成り立っている。

- 頼まれたハイライトと言語の組ごとに、メインのチェックアウトの `dist/<scenario>.<lang>.mp4`
  （1920×1080、H.264、30fps、音声なし）がある。冒頭と末尾にタイトルカード、各場面に
  キャプションが付いている
- 同じ場所の `dist/<scenario>.<lang>.contact.png`（3 秒ごとのコマ割り）を自分の目で見て、
  各場面が意図どおりに映っていることを確かめた。確かめた結果（直したこと・残した違和感）を
  ユーザーに伝えた
- 新しく書いたシナリオは `scripts/demo-video/scenarios/` に入り、PR に乗っている

確かめ方:

```bash
ls -la "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/dist/"*.mp4
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of csv=p=0 <mp4>
```

contact sheet は Read で画像として開いて見る。動画の中身を見ないまま「できた」と報告しない。

## 仕組み

`pnpm demo-video:record <scenario> --lang en|ja` が次を行う（`scripts/demo-video/record.mts`）。

1. 前提（ffmpeg / Xvfb / xdotool / Noto CJK・絵文字フォント / シナリオが要るビルド成果物）を
   確かめ、足りなければ入れ方を表示して止まる
2. `fixtures/<fixture>/<lang>/` のモデルを一時ディレクトリにコピーする
3. Xvfb（`:99`、1920×1080）を立て、シナリオが app か VS Code を実際に操作するあいだ、
   ffmpeg の x11grab で画面全体を録る。ポインタは xdotool で本物を動かす
4. タイトルカードを PNG にして、録画の前後に fade でつなぎ、`dist/` に書く

| ファイル | 役割 |
| --- | --- |
| `lib/display.mts` | Xvfb・録画・本物のポインタ（移動・クリック・ホイール・Ctrl+クリック） |
| `lib/overlay.mts` | キャプション（左下）と編集内容を見せるコードパネル（右上） |
| `lib/browser.mts` | 画面いっぱいのキオスク Chromium（app 用）と画面座標の変換 |
| `lib/vscode.mts` | VS Code の入手・CDP での起動・webview 内の座標変換・エディタ操作 |
| `lib/compose.mts` | タイトルカード・最終 MP4・contact sheet |
| `scenarios/*.mts` | 1 ハイライト = 1 ファイル。言語別キャプションをファイル内の `T` に持つ |
| `fixtures/<name>/{en,ja}/` | デモ用モデル。言語ごとにラベルを訳したもの |

既存のシナリオ: `serve-import`（`karasu serve` の import 解決と Share）、
`vscode-shared-viewer`（VS Code のプレビューが app のビューアになった件）。
README 冒頭の GIF は別の仕組み（`scripts/readme-demo/`）で、こちらとは共有しない。

## 手順

### 1. ハイライトの文から場面を起こす

ハイライトの文の主張 1 つを 1 場面にし、キャプションはその主張を短く言い直したものにする。
文が主張していないことを動画で言わない（例:「VS Code 上で再現は確かめていない」と書かれた
旧来の不具合は、新しい挙動だけを映し、旧挙動を再現したかのように見せない）。

既存シナリオで足りるなら、キャプションを直すだけにする。新しい機能なら既存シナリオを
コピーして書き換える。モデルが要るなら `fixtures/` に en と ja の両方を足し、
`node packages/cli/dist/index.js check <file>` が通ることを確かめる。

### 2. ビルドする

シナリオの `requires` に並んだ成果物を作る。worktree で作業しているならその worktree で。

```bash
pnpm --filter ./packages/cli run build && pnpm --filter ./packages/cli run build:app   # serve の場面
pnpm --filter karasu-vscode run build                                 # VS Code の場面
```

### 3. 録る

新しいシナリオの構図（図が収まるか、キャプションが要点を隠さないか）は、録画の前に
`lib/display.mts` の `grab(<png>)` で表示中の画面を 1 枚撮って確かめられる。

```bash
pnpm demo-video:record <scenario> --lang en
pnpm demo-video:record <scenario> --lang ja
```

場面ごとに `HH:MM:SS caption: …` が出る。どこまで進んだかはこの行で分かる。
録画は Xvfb の `:99`、VS Code の CDP ポート 9333、serve のポート 3456 を使うので、2 本を同時に
録らない（順に実行する）。`serve-import` の Share の場面は公開アプリ karasu.kompiro.dev を開くので、
ネットワークが要り、映るのはローカルのビルドではなく公開中の版になる。

### 4. 見る

`dist/<scenario>.<lang>.contact.png` を開き、各コマについて次を見る。気になるコマは
`ffmpeg -ss <秒> -i <mp4> -frames:v 1 <png>` で原寸を取り出して見る。

- キャプションやコードパネルが図の要点を隠していない
- クリックやジャンプが狙った要素に当たっている（違う要素の右クリックメニューが出ていない）
- 図が画面からはみ出していない（はみ出すならホイールでズームアウトする手順を足す）

失敗して止まったときは、OS の一時ディレクトリ（通常 `/tmp/karasu-demo-video/<scenario>.<lang>/`）に
途中までの `raw.mp4` とその `raw.contact.png`、VS Code なら `vscode.log` が残る。

## 落とし穴

一度踏んで原因を突き止めたもの。`lib/` は対処済みなので、新しいシナリオを書くときは
`lib/` の関数を使えば踏まない。自前で書くときだけこの表を見る。

| 症状 | 原因 | 対処（`lib/` での扱い） |
| --- | --- | --- |
| `code: bad option: --extensionDevelopmentPath` | VS Code server から起動したシェルに `ELECTRON_RUN_AS_NODE=1` がある | 起動時に `ELECTRON_*` / `VSCODE_*` を環境から外す |
| VS Code が途中で消え、ログに `No space left on device` | devcontainer の `/dev/shm` が 64MB | `--disable-dev-shm-usage` を付ける |
| プレビューが灰色のまま描かれない | ワークベンチに全画面オーバーレイを一度でも出した | タイトルカードは PNG にして録画の外でつなぐ |
| `Target closed` で座標が取れない | プレビューを開いた直後に webview が作り直される | 毎回 frame を探し直す（`inViewer`） |
| webview 内のクリック位置がずれる | 2 段の iframe のオフセットを boundingBox が足さない | frame を親までたどって足し、ズーム倍率を掛ける（`toScreen`） |
| 打った文字が「行へ移動」の入力欄やプレビュー側に入る | プレビューをクリックしたあとフォーカスが webview に残る | キー操作の前に Ctrl+1 で左のエディタグループへ戻す（`editorKeys`） |
| 打った行の字下げが深い・括弧が二重になる | 自動インデント・自動で閉じる括弧 | 設定で切り、行は字下げなしで打つ（`typeLine`） |
| プレビューが別ファイルに切り替わる | プレビューはアクティブな `.krs` エディタに追従する | import 先を編集したら元のファイルのタブに戻して見せる |
| エッジの右クリックで別のエッジのメニューが出る | エッジのグループの中心は線上にない | 線上の点を取る（`edgePoint`）。他のエッジと交わらない位置（0.3 など）を選ぶ |
| 日本語ロケールで Share ボタンが見つからない | accessible name が翻訳される | 表示テキスト `Share` で探す |
| ポインタが止まったままクリックが起きる | Playwright の mouse は X のカーソルを動かさない | xdotool で動かしてクリックする（`clickAt`） |
| 翻訳バーが出る | `--disable-features=Translate` では消えない | プロファイルの Preferences で翻訳を切る |
| ウィンドウが画面からはみ出す | Chromium の `--window-size` は DIP 単位 | 画面サイズを倍率で割る |
| 動画の末尾に「変更を保存しますか？」が映る | 未保存のデモ編集を残したまま VS Code を閉じた（SIGTERM でも CDP の close でも出る） | 最後の場面のあとに `ctx.stopRecording()` を呼んでから閉じる |
| 録画ファイルが `moov atom not found` で開けない | 強制終了で MP4 が閉じられなかった | 録画中は fragmented MP4 で書き、仕上げで `+faststart` に直す |
| `pkill -f <パターン>` でシェルごと落ちる（exit 144） | 同じコマンド行にそのパターン文字列が含まれていた | `pkill -f "[v]scode-linux"` のように先頭を `[]` で囲み、pkill は単独のコマンドで実行する |
| `downloadAndUnzipVSCode` が `ENOENT: mkdir` | キャッシュの親ディレクトリを作らない | 先に `mkdirSync(..., { recursive: true })` |

VS Code の操作に ExTester を使わないのは、arm64 の devcontainer では ChromeDriver が動かず、
デモにはどのみち録画できる実ウィンドウが要るため。タイトルバーに
「[Extension Development Host]」と出るのはこの起動方法による。気になるときはユーザーに伝える。

## 渡し方

最終メッセージに、言語ごとの MP4 の絶対パス・長さ・サイズを表で示す。あわせて、
contact sheet を見て気づいた点（UI の言語が混ざる、開発用ホストの表示など）を書く。
動画を外部へアップロードするのはユーザーが決めることなので、こちらからは行わない。
