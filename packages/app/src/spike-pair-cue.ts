// SPIKE (#3027): pick how a mutual pair's labels show their direction, from `?pairCue=`,
// and offer a small switcher that reloads the page with another choice.
// off: two lines per pair (today). position: one line split in halves, each label on its own
// half. arrow: the same, with an arrow glyph before each paired label.
const MODES = [
  ["off", "Off (today)"],
  ["position", "A. Position"],
  ["arrow", "B. Position + arrow"],
] as const;

export function installPairCue(): void {
  const params = new URLSearchParams(location.search);
  const raw = params.get("pairCue");
  const mode = MODES.some(([m]) => m === raw) ? raw! : "position";
  (globalThis as { __karasuPairCue?: string }).__karasuPairCue = mode;

  const mount = () => {
    const bar = document.createElement("div");
    bar.setAttribute("data-spike", "pair-cue");
    bar.style.cssText =
      "position:fixed;left:12px;bottom:12px;z-index:2147483647;display:flex;gap:4px;align-items:center;" +
      "padding:6px 8px;border-radius:8px;background:#0F172AE6;color:#F8FAFC;font:600 12px/1 system-ui,sans-serif;" +
      "box-shadow:0 2px 8px #0005";
    const title = document.createElement("span");
    title.textContent = "#3027 pair labels:";
    title.style.marginRight = "4px";
    bar.append(title);
    for (const [m, label] of MODES) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      const on = m === mode;
      b.style.cssText =
        "font:inherit;padding:5px 8px;border-radius:6px;cursor:pointer;border:1px solid #475569;" +
        (on ? "background:#F8FAFC;color:#0F172A;" : "background:transparent;color:#F8FAFC;");
      b.addEventListener("click", () => {
        const next = new URL(location.href);
        next.searchParams.set("pairCue", m);
        location.assign(next.toString());
      });
      bar.append(b);
    }
    document.body.append(bar);
  };
  if (document.body) mount();
  else addEventListener("DOMContentLoaded", mount, { once: true });
}
