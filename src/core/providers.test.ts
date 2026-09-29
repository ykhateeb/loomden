import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "vitest";
import { findModels, literalKey } from "./providers";

test("a typed key stays a literal in models.json (no command, no environment variable)", () => {
  expect(literalKey("sk-abc")).toBe("sk-abc");
  expect(literalKey("a$b")).toBe("a$$b");
  expect(literalKey("!curl evil|sh")).toBe("$!curl evil|sh");
  expect(literalKey("$ANTHROPIC_API_KEY")).toBe("$$ANTHROPIC_API_KEY");
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
