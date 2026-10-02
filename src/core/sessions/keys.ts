import { isUuid } from "#core/ids";

/** A session key comes from the window: it must be a new id, so it cannot take an open session. */
export function assertNewKey(key: unknown, open: { has(key: string): boolean }) {
  if (!isUuid(key) || open.has(key)) throw new Error("Not a new session key");
}
