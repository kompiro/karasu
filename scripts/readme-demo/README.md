# readme-demo: the README demo GIFs

These scripts produce `docs/assets/readme-demo.en.gif` and `docs/assets/readme-demo.ja.gif`,
the looping, captioned demos at the top of `README.md` and `README.ja.md` (Issue #3175).
Re-record them when the app UI changes enough that the GIFs no longer match it.

| File                                   | Role                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `record.mts`                           | Drives the karasu app with Playwright and records it through the CDP screencast                                                           |
| `make-gif.mts`                         | Turns the recorded frames into a looping GIF with ImageMagick                                                                             |
| `intro.html`                           | The opening scene: a sped-up replay of the `reverse-architecture` run that produced the model. Its commands and counts come from that run |
| `captions.en.json`, `captions.ja.json` | The caption of each scene, per language                                                                                                   |

## The model is not in this repository

The demo model is a `reverse-architecture` output of a private system (an AI journaling
system on Cloudflare), with its names made neutral. It is kept out of this public repository
because it still describes that system's internals. Recording needs a copy of it served by
`karasu serve`. `record.mts` walks the scenes by node id (the `SCENE` constant), so a
different model needs those ids changed, and `intro.html` and the captions describe this
particular run.

## Re-recording

Prerequisites:

- Chromium from the E2E suite's Playwright install: `pnpm --filter @karasu-tools/e2e install-browsers`
- ImageMagick (`convert`) on `PATH`
- A Japanese font for the Japanese captions and UI, for example Noto Sans JP in
  `~/.local/share/fonts` followed by `fc-cache -f`. Without one, Japanese text renders as boxes

```bash
karasu serve <dir holding the demo model as index.krs> --port 3000   # in another terminal

pnpm readme-demo:record --url http://localhost:3000/ --out /tmp/demo-en --lang en
pnpm readme-demo:gif /tmp/demo-en docs/assets/readme-demo.en.gif

pnpm readme-demo:record --url http://localhost:3000/ --out /tmp/demo-ja --lang ja
pnpm readme-demo:gif /tmp/demo-ja docs/assets/readme-demo.ja.gif
```

`--no-captions` records the same scenes without captions. `make-gif.mts` takes `--width`
(default 960, about the width of a README on GitHub), `--fps` (12) and `--hold` (seconds the
last frame stays before the loop restarts, 2).

## How the recording works

- **Frames only on change.** The CDP screencast emits a frame only when the page repaints, so a
  still scene is one frame. `make-gif.mts` gives each kept frame the delay until the next one.
- **Fitting each view.** The app has no fit-to-screen control and keeps the zoom across
  drill-down, so `record.mts` hides the canvas, zooms and pans with the wheel and drags until
  every node fits, then shows it again. `make-gif.mts` shortens those hidden stretches, and the
  page navigation after the intro, to a quarter second.
- **Panning.** A pan only registers when the pointer stays inside the canvas for the whole drag
  and moves after React has re-rendered the mousedown, so drags start at the centre and wait a
  moment after the press.
- **A visible cursor and the captions** are overlays the script adds to every page; the
  screencast does not draw the OS pointer.
