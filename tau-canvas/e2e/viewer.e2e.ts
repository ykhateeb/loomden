import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Frame, type Page } from "@playwright/test";
import { startServer, type CanvasServer } from "../extensions/server";
import { createBoard, editBoard, proposeTokens, readCanvas } from "../extensions/store";

const board = (t: string) =>
  `<html><head><style>html,body{margin:0;width:390px;height:844px}button{margin:20px}</style></head><body><h1>${t}</h1><button>Pay now</button></body></html>`;

// The mode reaches the board by postMessage. Hover until its outline shows, so a click never comes before it.
const armed = async (frame: ReturnType<Page["frameLocator"]>, target: string) => {
  await expect(async () => {
    await frame.locator(target).hover();
    await expect(frame.locator("html > div[style*='display: block']")).toBeVisible({ timeout: 300 });
  }).toPass();
};

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
  await expect(page.locator(".lbl")).toHaveText([/^Cart rev 1/, /^Pay rev 1/]);
  await expect(page.frameLocator("iframe").first().locator("h1")).toHaveText("Cart");
});

test("a saved edit shows up without a refresh", async ({ page }) => {
  await page.goto(server.url("demo"));
  await expect(page.locator(".lbl").first()).toContainText("Cart rev 1");
  await editBoard(root, { canvas: "demo", board: "cart", baseRev: 1, edits: [{ find: ">Cart<", replace: ">Cart v2<" }] });
  await expect(page.locator(".lbl").first()).toContainText("Cart rev 2");
  await expect(page.frameLocator("iframe").first().locator("h1")).toHaveText("Cart v2");
});

test("point mode: Send now puts board, element and text in the chat", async ({ page }) => {
  await page.goto(server.url("demo"));
  await page.keyboard.press("p");
  await armed(page.frameLocator("iframe").first(), "button");
  await page.frameLocator("iframe").first().getByRole("button", { name: "Pay now" }).click();
  await page.getByPlaceholder("What should change?").fill("Make it bigger");
  await page.getByRole("button", { name: "Send to pi", exact: false }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatch(/^On board Cart, element “Pay now” \(tid \d+\): Make it bigger$/);
  expect((await readCanvas(root, "demo")).notes.n1.state).toBe("sent");
});

test("saved notes show a pin and are sent together", async ({ page }) => {
  await page.goto(server.url("demo"));
  await page.keyboard.press("p");
  await armed(page.frameLocator("iframe").first(), "button");
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

test("Design system tab: update from code, review, accept, see uses, show on boards", async ({ page }) => {
  const ds = join(root, "..", "design-system");
  await editBoard(root, { canvas: "demo", board: "cart", baseRev: 1, edits: [{ find: "<button", replace: '<button style="color:var(--link)"' }] });
  await page.goto(server.url("demo"));
  await page.getByRole("button", { name: "Design system" }).click();
  await expect(page.getByText("No design system yet")).toBeVisible();

  // "Create from code" asks pi
  await page.getByRole("button", { name: "Create from code" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toContain("design_system_propose");

  // pi proposes: the tab shows it, nothing is saved yet
  await proposeTokens(ds, { name: "app", color: { tokens: [{ name: "link", value: "#4e6f94", usage: "Links" }] }, spacing: { tokens: [{ name: "space-4", value: "16px" }] } });
  await expect(page.getByText("pi proposes 2 changes")).toBeVisible();
  await expect(page.getByText("link: (new) → #4e6f94")).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("app · v1")).toBeVisible();
  expect(await readFile(join(ds, "tokens.css"), "utf8")).toContain("--link: #4e6f94;");

  // click a token: where it is used
  await page.getByRole("button", { name: /^link/ }).click();
  await expect(page.getByText("Used 1× on Cart (1)")).toBeVisible();
  await page.getByRole("button", { name: /^space-4/ }).click();
  await expect(page.getByText("Not used on any board")).toBeVisible();

  // Show on boards: an outline appears on the element that uses the token
  await page.getByRole("button", { name: /^link/ }).click();
  await page.getByRole("button", { name: "Show on boards" }).click();
  const outlined = page.frameLocator("iframe").first().locator("html > div[style*='dashed']");
  await expect(outlined).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(outlined).toHaveCount(0);
});

test("canvas tabs, first-draft hint, note keys and filters", async ({ page }) => {
  await createBoard(root, { canvas: "other", board: "home", title: "Home", w: 390, h: 844, html: board("Home"), canvasTitle: "Onboarding" });
  await page.goto(server.url("demo"));
  await expect(page.getByRole("button", { name: "demo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Onboarding" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Design system" })).toBeVisible();
  await expect(page.getByText("This is a first draft.")).toBeVisible();

  await page.keyboard.press("p");
  await armed(page.frameLocator("iframe").first(), "button");
  const pick = async (text: string) => {
    await page.frameLocator("iframe").first().getByRole("button", { name: "Pay now" }).click();
    await page.getByPlaceholder("What should change?").fill(text);
  };
  await pick("Saved with the keyboard");
  await page.keyboard.press("ControlOrMeta+Enter"); // saves
  await expect(page.locator(".note")).toHaveCount(1);
  await expect(page.getByText("saved, not sent yet")).toBeVisible();
  await expect(page.getByText("This is a first draft.")).toBeHidden();
  expect(sent).toHaveLength(0);
  await pick("Sent with Enter");
  await page.keyboard.press("Enter"); // sends
  await expect.poll(() => sent.length).toBe(1);
  await expect(page.getByRole("button", { name: /^demo\s*2/ })).toBeVisible(); // 2 notes not done

  await page.getByRole("button", { name: "Done 0" }).click();
  await expect(page.locator(".note")).toHaveCount(0);
  await page.getByRole("button", { name: "All 2" }).click();
  await expect(page.locator(".note")).toHaveCount(2);
});

test("Edit mode: change text and token values, undo, history, custom value asks pi", async ({ page }) => {
  const ds = join(root, "..", "design-system");
  await proposeTokens(ds, {
    name: "app",
    color: { tokens: [{ name: "ink", value: "#1b1f24" }, { name: "link", value: "#4e6f94" }] },
    spacing: { tokens: [{ name: "space-4", value: "16px" }] },
  });
  await (await import("../extensions/store")).acceptProposal(ds);
  await page.goto(server.url("demo"));
  await page.keyboard.press("e");
  const frame = page.frameLocator("iframe").first();
  await armed(frame, "h1");

  // double-click text: edit in place, saved as a rev by you
  await frame.locator("h1").dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Total to pay");
  await page.keyboard.press("Enter");
  await expect(page.locator(".lbl").first()).toContainText("Cart rev 2 · edited by you");
  await expect(frame.locator("h1")).toHaveText("Total to pay");

  // click an element: the panel offers design-system values only
  await frame.locator("h1").click();
  await expect(page.getByText("Edit Cart")).toBeVisible();
  const color = page.getByLabel("Color");
  await expect(color.locator("option")).toHaveText(["—", "ink  #1b1f24", "link  #4e6f94", "Custom value…"]);
  await color.selectOption({ label: "link  #4e6f94" });
  await expect(page.locator(".lbl").first()).toContainText("Cart rev 3");
  expect((await readFile(join(root, "demo", "boards", "cart.html"), "utf8"))).toContain("color: var(--link)");
  await page.getByLabel("Padding").selectOption({ label: "space-4  16px" });
  await expect(page.locator(".lbl").first()).toContainText("Cart rev 4");

  // undo (a new rev), then history lists every rev
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(page.locator(".lbl").first()).toContainText("Cart rev 5");
  expect(await readFile(join(root, "demo", "boards", "cart.html"), "utf8")).not.toContain("padding");
  await page.locator(".lbl").first().click();
  await expect(page.locator("#hist")).toContainText("rev 1 · pi");
  await expect(page.locator("#hist")).toContainText("rev 5 · you · undo rev 4");

  // custom value: nothing is saved, pi is asked
  await page.getByLabel("Gap above").selectOption({ label: "Custom value…" });
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatch(/custom value for Gap above/);
  expect((await readCanvas(root, "demo")).boards["boards/cart.html"].rev).toBe(5);
});

const withLinks = (t: string, link: string) => board(t).replace("</body>", `${link}</body>`);

test("Play: follow links, missing board asks pi, Esc exits", async ({ page }) => {
  await editBoard(root, { canvas: "demo", board: "cart", baseRev: 1, html: withLinks("Cart", '<a href="pay.html">Go pay</a>') });
  await editBoard(root, { canvas: "demo", board: "pay", baseRev: 1, html: withLinks("Pay", '<a href="done.html">Finish</a>') });
  await page.goto(server.url("demo"));
  await page.getByRole("button", { name: /^Play/ }).click();
  const play = page.frameLocator("#pl");
  await expect(play.locator("h1")).toHaveText("Cart");
  await expect(page.getByText("Links in this flow 2")).toBeVisible();

  await play.getByRole("link", { name: "Go pay" }).click();
  await expect(play.locator("h1")).toHaveText("Pay");
  await page.keyboard.press("Backspace"); // focus is inside the frame after the click: the keys still work
  await expect(play.locator("h1")).toHaveText("Cart");
  await page.keyboard.press("r");
  await expect(play.locator("h1")).toHaveText("Cart");

  await play.getByRole("link", { name: "Go pay" }).click();
  await play.getByRole("link", { name: "Finish" }).click();
  await expect(page.getByText("No board for “done”").first()).toBeVisible();
  await page.getByRole("button", { name: "Ask pi to add it" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toContain("Add a board “done” (done.html)");

  await page.keyboard.press("Escape");
  await expect(page.locator("#player")).toBeHidden();
  await expect(page.locator(".board").first()).toBeVisible();
});

test("Compare: see changes, restore adds a rev, only a person approves", async ({ page }) => {
  await editBoard(root, { canvas: "demo", board: "cart", baseRev: 1, edits: [{ find: ">Cart<", replace: ">Cart v2<" }], why: "new title" });
  await page.goto(server.url("demo"));
  await page.getByRole("button", { name: "Compare" }).click();
  await expect(page.getByText("Cart rev 1 → rev 2 · 1 change")).toBeVisible();
  await expect(page.getByText("rev 2 · pi · new title").first()).toBeVisible();
  await expect(page.frameLocator("#cmp iframe").first().locator("h1")).toHaveText("Cart");
  await expect(page.frameLocator("#cmp iframe").nth(1).locator("h1")).toHaveText("Cart v2");

  await page.getByRole("button", { name: "Approve Cart" }).click();
  await expect(page.getByText("Approved Cart rev 2")).toBeVisible();
  await expect(page.getByText("Approval 1 of 2 boards")).toBeVisible();
  await expect(page.getByText("Approve Pay first.")).toBeVisible();
  expect((await readCanvas(root, "demo")).boards["boards/cart.html"].approved).toBe(2);
  expect(await readFile(join(root, "demo", "approved", "cart.html"), "utf8")).toContain("Cart v2");

  await page.getByRole("button", { name: "Restore rev 1" }).click();
  await expect.poll(async () => (await readCanvas(root, "demo")).boards["boards/cart.html"].rev).toBe(3);
  await expect(page.getByText("Changed since rev 2")).toBeVisible(); // approval stays at rev 2
  expect(await readFile(join(root, "demo", "approved", "cart.html"), "utf8")).toContain("Cart v2");
});
