import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Frame, type Page } from "@playwright/test";
import { startServer, type CanvasServer } from "../extensions/server";
import { createBoard, editBoard, readCanvas } from "../extensions/store";

const board = (t: string) =>
  `<html><head><style>html,body{margin:0;width:390px;height:844px}button{margin:20px}</style></head><body><h1>${t}</h1><button>Pay now</button></body></html>`;

let root: string, server: CanvasServer, sent: string[];

test.beforeEach(async () => {
  root = join(await mkdtemp(join(tmpdir(), "tau-e2e-")), ".tau", "canvases");
  await createBoard(root, { canvas: "demo", board: "cart", title: "Cart", w: 390, h: 844, html: board("Cart") });
  await createBoard(root, { canvas: "demo", board: "pay", title: "Pay", w: 390, h: 844, html: board("Pay") });
  sent = [];
  server = await startServer({ root, onSend: (t) => sent.push(t) });
});
test.afterEach(() => server.close());

const boardFrame = (page: Page, name: string): Frame => page.frames().find((f) => f.url().includes(`/boards/${name}.html`))!;

test("shows both boards with title and rev", async ({ page }) => {
  await page.goto(server.url("demo"));
  await expect(page.locator(".lbl")).toHaveText(["Cart · rev 1 · by pi", "Pay · rev 1 · by pi"]);
  await expect(page.frameLocator("iframe").first().locator("h1")).toHaveText("Cart");
});

test("a saved edit shows up without a refresh", async ({ page }) => {
  await page.goto(server.url("demo"));
  await expect(page.locator(".lbl").first()).toContainText("rev 1");
  await editBoard(root, { canvas: "demo", board: "cart", baseRev: 1, edits: [{ find: ">Cart<", replace: ">Cart v2<" }] });
  await expect(page.locator(".lbl").first()).toContainText("rev 2");
  await expect(page.frameLocator("iframe").first().locator("h1")).toHaveText("Cart v2");
});

test("point mode: Send now puts board, element and text in the chat", async ({ page }) => {
  await page.goto(server.url("demo"));
  await page.keyboard.press("p");
  await page.frameLocator("iframe").first().getByRole("button", { name: "Pay now" }).click();
  await page.getByPlaceholder("What should change?").fill("Make it bigger");
  await page.getByRole("button", { name: "Send now" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatch(/^On board Cart, element “Pay now” \(tid \d+\): Make it bigger$/);
  expect((await readCanvas(root, "demo")).notes.n1.state).toBe("sent");
});

test("saved notes show a pin and are sent together", async ({ page }) => {
  await page.goto(server.url("demo"));
  await page.keyboard.press("p");
  await page.frameLocator("iframe").first().getByRole("button", { name: "Pay now" }).click();
  await page.getByPlaceholder("What should change?").fill("Add a total");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.locator(".pin")).toHaveCount(1);
  expect(sent).toHaveLength(0);
  await page.getByRole("button", { name: "Send 1 saved note to pi" }).click();
  await expect.poll(() => sent.length).toBe(1);
  await expect(page.locator(".pin.sent")).toHaveCount(1);
});

test("a board cannot reach the network", async ({ page }) => {
  await page.goto(server.url("demo"));
  await expect(page.frameLocator("iframe").first().locator("h1")).toBeVisible();
  const blocked = await boardFrame(page, "cart").evaluate(() =>
    fetch("https://example.com").then(() => false, () => true));
  expect(blocked).toBe(true);
});

test("a request without the token fails", async ({ request }) => {
  const origin = new URL(server.url("demo")).origin;
  expect((await request.get(`${origin}/nope/c/demo`)).status()).toBe(404);
});
