// Tracks native listeners added to DOM that React rendered and reports the
// ones still attached after that DOM unmounted (TPL-1537 item 2: a native
// `addEventListener` in an effect needs a `removeEventListener` cleanup).
// A listener an effect leaves behind on a React-rendered element is the same
// missing cleanup that stacks a second listener when the effect re-runs.
//
// Installed for every app test file by `listener-leak-setup.ts`; exported
// separately so its own test can drive it.
//
// What counts: a listener added to an element React created (it carries a
// `__reactFiber$<random>` key) while it was in the document, still attached
// after the test, while the element has left the document (the component
// unmounted). Out of scope:
// - `document` / `window`: libraries park long-lived listeners there.
// - React's root container: React delegates every event type to it and keeps
//   those listeners after `root.unmount()`. The container is not a fiber, so
//   the React-owned rule already leaves it out.
// - Elements built imperatively (`document.createElement`): their owner
//   removes the element, and its listeners go with it.
// - `once` listeners remove themselves; a listener added with an AbortSignal
//   counts as removed when the signal aborts.

interface Registration {
  target: Element;
  type: string;
  listener: EventListenerOrEventListenerObject;
  capture: boolean;
}

export interface LeakedListener {
  type: string;
  element: string;
}

const registrations: Registration[] = [];
let installed = false;

function captureOf(options: boolean | AddEventListenerOptions | undefined): boolean {
  return typeof options === "boolean" ? options : Boolean(options?.capture);
}

function forget(target: Element, type: string, listener: unknown, capture: boolean): void {
  const i = registrations.findIndex(
    (r) =>
      r.target === target && r.type === type && r.listener === listener && r.capture === capture,
  );
  if (i >= 0) registrations.splice(i, 1);
}

function track(
  target: Element,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options: boolean | AddEventListenerOptions | undefined,
): void {
  if (!target.isConnected || !isReactOwned(target)) return;
  if (typeof options === "object" && options.once) return;
  const capture = captureOf(options);
  const same = (r: Registration) =>
    r.target === target && r.type === type && r.listener === listener && r.capture === capture;
  // The DOM ignores a duplicate registration; so do we.
  if (registrations.some(same)) return;
  registrations.push({ target, type, listener, capture });
  const signal = typeof options === "object" ? options.signal : undefined;
  signal?.addEventListener("abort", () => forget(target, type, listener, capture), { once: true });
}

/** Patch `EventTarget` once per test file. A no-op outside a DOM environment. */
export function installListenerTracking(): void {
  if (installed || typeof EventTarget === "undefined" || typeof Element === "undefined") return;
  installed = true;
  const proto = EventTarget.prototype;
  const add = proto.addEventListener;
  const remove = proto.removeEventListener;

  proto.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    add.call(this, type, listener, options);
    if (listener && this instanceof Element) track(this, type, listener, options);
  };

  proto.removeEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    remove.call(this, type, listener, options);
    if (this instanceof Element) forget(this, type, listener, captureOf(options));
  };
}

/** Start a fresh record (call before each test). */
export function resetListenerTracking(): void {
  registrations.length = 0;
}

/** Listeners whose element has left the document while they stayed attached. */
export function leakedListeners(): LeakedListener[] {
  return registrations
    .filter((r) => !r.target.isConnected)
    .map((r) => ({ type: r.type, element: describe(r.target) }));
}

/** How many listeners are tracked right now (for the guard's own test). */
export function trackedListenerCount(): number {
  return registrations.length;
}

/** React stores the fiber on each element it creates under `__reactFiber$<random>`. */
function isReactOwned(el: Element): boolean {
  return Object.keys(el).some((k) => k.startsWith("__reactFiber$"));
}

function describe(el: Element): string {
  const cls = el.getAttribute("class");
  return `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ""}>`;
}
