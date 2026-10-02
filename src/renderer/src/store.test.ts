import { expect, test } from "vitest";
import { without } from "./store";

test("without gives a copy with no such key, and keeps the record as it was", () => {
  const record = { a: 1, b: 2 };
  expect(without(record, "a")).toEqual({ b: 2 });
  expect(record).toEqual({ a: 1, b: 2 });
});
