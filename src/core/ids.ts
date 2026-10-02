const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for an id from crypto.randomUUID(). Use it to check an id that the window makes. */
export function isUuid(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}
