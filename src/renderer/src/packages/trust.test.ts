import { expect, test } from "vitest";
import { TRUST, trustChoice } from "./trust";

test("each trust value maps to its choice and back", () => {
  expect(trustChoice(true)).toBe("yes");
  expect(trustChoice(false)).toBe("no");
  expect(trustChoice(null)).toBe("ask");
  for (const trusted of [true, false, null]) expect(TRUST[trustChoice(trusted)].trusted).toBe(trusted);
});
