/**
 * Extract a human-readable detail string from an unknown thrown value, for
 * interpolation into a user-facing error message. `Error` instances yield
 * their `message`; anything else is stringified.
 */
export function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
