/**
 * Submitted `.krs` documents, kept until their author deletes them.
 *
 *     sub/v1/<account>/<slug> -> { slug, title, krs, submittedAt, updatedAt, visibility }
 *
 * **No TTL, and that is the decision rather than an omission.** Every other
 * key this service writes expires, because the generation service's whole
 * promise was not keeping things (`krs-cache.ts`: 90 days; metrics: 400). A
 * gallery inverts that: content its author manages must not vanish on its own.
 * If a submission aged out at 90 days, "the diagram I posted is gone" becomes a
 * support request — and the console exists to remove support requests, so the
 * expiry would manufacture exactly what the feature was built to prevent.
 *
 * The account pays for that in the only currency it can: **deletion is the
 * author's job and account deletion is the sweep**. Nothing here is reachable
 * after `GalleryStore.purgeAccount`, which is checked mechanically rather than
 * by inspection (TPL-2226).
 *
 * The record holds `krs` inline rather than pointing at a blob. A submission is
 * capped at `MAX_SUBMISSION_BYTES`, far inside KV's value limit, and a second
 * key would be a second thing for the purge to know about for no benefit.
 */
import type { KVNamespaceLike } from "../env.js";
import {
  newSubmissionSlug,
  submissionKey,
  submissionPrefix,
  normaliseAccountId,
} from "./gallery-keys.js";
import { purgeByPrefix } from "./sweep.js";

/**
 * 256KB.
 *
 * A `.krs` is structure, not source: the largest model in `examples/` is a
 * few kilobytes, and a reverse of a substantial system lands in the tens. This
 * is a bound on abuse rather than a bound anyone modelling honestly will meet.
 */
export const MAX_SUBMISSION_BYTES = 256 * 1024;

/** How long a title may be. Long enough for a sentence, short enough for a list. */
export const MAX_TITLE_LENGTH = 120;

/**
 * Whether a submission is listed and readable by anyone with the link.
 *
 * `unlisted` sits in front of `deleted` on purpose (#2589): most withdrawal
 * requests mean "not visible right now", not "gone", and a reversible control
 * absorbs those without producing an "I deleted it by mistake" follow-up.
 */
type Visibility = "public" | "unlisted";

export interface Submission {
  /** The random half of the id. The public id also carries the account. */
  slug: string;
  accountId: string;
  title: string;
  krs: string;
  submittedAt: string;
  updatedAt: string;
  visibility: Visibility;
}

export interface NewSubmission {
  title: string;
  krs: string;
  visibility?: Visibility;
}

function parse(raw: string, accountId: string): Submission | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.slug !== "string" ||
    typeof record.title !== "string" ||
    typeof record.krs !== "string" ||
    typeof record.submittedAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return undefined;
  }
  return {
    slug: record.slug,
    accountId,
    title: record.title,
    krs: record.krs,
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
    // A record written before this field existed reads as `unlisted`. Being
    // wrong in that direction withholds something its author meant to publish
    // until they say so again; being wrong the other way publishes something
    // nobody chose to. The same asymmetry `routes/repo.ts` applies to
    // `private`.
    visibility: record.visibility === "public" ? "public" : "unlisted",
  };
}

export class SubmissionStore {
  constructor(private readonly kv: KVNamespaceLike) {}

  /** Store a new submission and return it, slug and timestamps filled in. */
  async create(accountId: number | string, input: NewSubmission, at: Date): Promise<Submission> {
    const canonical = normaliseAccountId(accountId);
    const now = at.toISOString();
    const submission: Submission = {
      slug: newSubmissionSlug(),
      accountId: canonical,
      title: input.title,
      krs: input.krs,
      submittedAt: now,
      updatedAt: now,
      visibility: input.visibility ?? "public",
    };
    await this.write(submission);
    return submission;
  }

  async get(accountId: number | string, slug: string): Promise<Submission | undefined> {
    const canonical = normaliseAccountId(accountId);
    const raw = await this.kv.get(submissionKey(canonical, slug));
    if (raw === null) return undefined;
    return parse(raw, canonical);
  }

  /** Everything one account owns, newest first. */
  async list(accountId: number | string): Promise<Submission[]> {
    const canonical = normaliseAccountId(accountId);
    const prefix = submissionPrefix(canonical);
    const submissions: Submission[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.kv.list({ prefix, cursor, limit: 1000 });
      for (const key of page.keys) {
        const raw = await this.kv.get(key.name);
        if (raw === null) continue;
        const submission = parse(raw, canonical);
        if (submission !== undefined) submissions.push(submission);
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor !== undefined);
    // Key order is by slug, which is random, so the list has to be sorted by
    // something a reader recognises. Newest first: the console's first job is
    // "the thing I just posted".
    return submissions.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  /**
   * Replace the mutable parts of a submission, keeping `submittedAt`.
   *
   * Returns `undefined` if it is not there — the caller has already checked
   * ownership by reading it, and a blind write would let a stale id recreate a
   * submission its author deleted.
   */
  async update(
    accountId: number | string,
    slug: string,
    changes: Partial<Pick<Submission, "title" | "krs" | "visibility">>,
    at: Date,
  ): Promise<Submission | undefined> {
    const current = await this.get(accountId, slug);
    if (current === undefined) return undefined;
    const updated: Submission = { ...current, ...changes, updatedAt: at.toISOString() };
    await this.write(updated);
    return updated;
  }

  async delete(accountId: number | string, slug: string): Promise<boolean> {
    const key = submissionKey(normaliseAccountId(accountId), slug);
    const existed = (await this.kv.get(key)) !== null;
    await this.kv.delete(key);
    return existed;
  }

  /** Every submission this account owns. Part of `GalleryStore.purgeAccount`. */
  async purgeAccount(accountId: number | string): Promise<number> {
    return await purgeByPrefix(this.kv, submissionPrefix(accountId));
  }

  /**
   * The one place a submission is written.
   *
   * `put` is called with no options at all, deliberately: an `expirationTtl`
   * added here is how author-managed content starts disappearing on its own.
   * `submissions.test.ts` asserts on `MemoryKV.puts` so that stays a fact
   * rather than a comment.
   */
  private async write(submission: Submission): Promise<void> {
    const { accountId, ...stored } = submission;
    await this.kv.put(submissionKey(accountId, submission.slug), JSON.stringify(stored));
  }
}
