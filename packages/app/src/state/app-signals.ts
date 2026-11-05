import { useEffect, useSyncExternalStore } from "react";

/** What a part of the app is showing now, as a value: a reader that comes late still reads it. */
export type ShowingSignal = "team-dependencies";

/** Something the visitor did once, recorded when it succeeded. */
export type EventSignal = "share-opened" | "svg-exported";

/**
 * A few things the app's features show or do, for a reader outside them (#3599).
 * The first-run tour reads them to tell a visitor that a step's ask is done;
 * the features know nothing about the tour.
 *
 * Events carry a sequence number instead of being kept in a set someone
 * empties: each reader counts the ones after a point of its own (`seq`), so a
 * second reader cannot take events from the first.
 */
export interface AppSignals {
  showing: ReadonlySet<ShowingSignal>;
  /** The seq of each event's latest occurrence. */
  lastEvent: Readonly<Partial<Record<EventSignal, number>>>;
  /** The seq of the latest event of any kind; 0 before any. */
  seq: number;
}

const INITIAL: AppSignals = { showing: new Set(), lastEvent: {}, seq: 0 };
let current: AppSignals = INITIAL;
const listeners = new Set<() => void>();

function update(next: AppSignals): void {
  current = next;
  for (const listener of listeners) listener();
}

/** Says whether `what` is on screen now. */
export function setShowing(what: ShowingSignal, on: boolean): void {
  if (current.showing.has(what) === on) return;
  const showing = new Set(current.showing);
  if (on) showing.add(what);
  else showing.delete(what);
  update({ ...current, showing });
}

/** Records that `what` just happened. */
export function recordEvent(what: EventSignal): void {
  const seq = current.seq + 1;
  update({ ...current, lastEvent: { ...current.lastEvent, [what]: seq }, seq });
}

/** Whether any of `kinds` happened after `sinceSeq`. */
export function happenedSince(
  signals: AppSignals,
  kinds: readonly EventSignal[],
  sinceSeq: number,
): boolean {
  return kinds.some((kind) => (signals.lastEvent[kind] ?? 0) > sinceSeq);
}

export function getAppSignals(): AppSignals {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppSignals(): AppSignals {
  return useSyncExternalStore(subscribe, getAppSignals, getAppSignals);
}

/** Publishes `on` for `what` while the caller is mounted, and takes it back after. */
export function useShowingSignal(what: ShowingSignal, on: boolean): void {
  useEffect(() => {
    setShowing(what, on);
    return () => setShowing(what, false);
  }, [what, on]);
}

/** For tests: back to no signals. */
export function resetAppSignals(): void {
  update(INITIAL);
}
