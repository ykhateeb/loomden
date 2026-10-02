const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A session key comes from the window: it must be a new id, so it cannot take an open session. */
export function assertNewKey(key: unknown, open: { has(key: string): boolean }) {
  if (typeof key !== "string" || !UUID.test(key) || open.has(key)) throw new Error("Not a new session key");
}
