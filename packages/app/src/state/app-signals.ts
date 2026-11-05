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
  /** The seq of each event's latest occurrence (its start, for one that took a ticket). */
  lastEvent: Readonly<Partial<Record<EventSignal, number>>>;
  /** The latest seq handed out, to an event or a ticket; 0 before any. */
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

/**
 * Takes a seq for something that starts now and finishes later (a share
 * waits for its link). Recording it with this ticket dates it to its start,
 * so a reader whose point is after the start does not count it, however late
 * it finishes: a share begun in another project and finished after coming
 * back is not a share made here.
 */
export function beginEvent(): number {
  const seq = current.seq + 1;
  update({ ...current, seq });
  return seq;
}

/** Records that `what` happened, now or, with a ticket from `beginEvent`, when it began. */
export function recordEvent(what: EventSignal, ticket?: number): void {
  const seq = ticket ?? current.seq + 1;
  const last = Math.max(seq, current.lastEvent[what] ?? 0);
  update({
    ...current,
    lastEvent: { ...current.lastEvent, [what]: last },
    seq: Math.max(seq, current.seq),
  });
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
