import { expect, test } from "vitest";
import { exportSessionHtml } from "./export";
import type { Session } from "./live-state";

const PATH = "/sessions/a.jsonl";

function fakes({ open = false, opens = true }: { open?: boolean; opens?: boolean } = {}) {
  const calls: string[] = [];
  let isOpen = open;
  const session = { exportToHtml: async (file: string) => void calls.push(`export ${file}`) } as unknown as Session;
  return {
    calls,
    find: () => (isOpen ? session : undefined),
    open: async () => {
      calls.push("open");
      isOpen = opens;
    },
    close: async () => void calls.push("close"),
  };
}

test("an open session exports and stays open", async () => {
  const { calls, ...deps } = fakes({ open: true });
  await exportSessionHtml({ path: PATH, file: "/tmp/x.html", wanted: new Set(), ...deps });
  expect(calls).toEqual(["export /tmp/x.html"]);
});

test("a closed session opens only for the export", async () => {
  const { calls, ...deps } = fakes();
  await exportSessionHtml({ path: PATH, file: "/tmp/x.html", wanted: new Set(), ...deps });
  expect(calls).toEqual(["open", "export /tmp/x.html", "close"]);
});

test("a session the user opened during the export stays open", async () => {
  const { calls, ...deps } = fakes();
  await exportSessionHtml({ path: PATH, file: "/tmp/x.html", wanted: new Set([PATH]), ...deps });
  expect(calls).toEqual(["open", "export /tmp/x.html"]);
});

test("a cancelled open cancels the export", async () => {
  const { calls, ...deps } = fakes({ opens: false });
  await expect(exportSessionHtml({ path: PATH, file: "/tmp/x.html", wanted: new Set(), ...deps })).rejects.toThrow("Export cancelled");
  expect(calls).toEqual(["open"]);
});
