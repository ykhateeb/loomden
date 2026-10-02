import { readdirSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { _electron as electron, expect, test } from "@playwright/test";
import { approve, createBoard } from "#canvas/store";

// Needs a build first: npm run build
test("/canvas in Tenon opens the canvas panel next to the chat", async () => {
  const tenonDir = await mkdtemp(join(tmpdir(), "tenon-app-"));
  const html = "<html><body style='margin:0;width:390px;height:844px'><h1>Cart</h1></body></html>";

  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, TENON_DIR: tenonDir, TENON_PI_DIR: join(tenonDir, "pi"), TENON_NO_OPEN: "1" },
  });
  try {
    const win = await app.firstWindow();
    await win.getByText("New session").first().click();
    const box = win.getByLabel("Message to pi");
    const run = async () => {
      await box.fill("/canvas");
      await box.press("Enter");
      if (await box.inputValue()) await box.press("Enter"); // the first Enter can pick the command in the menu
    };

    // A session with no project keeps its canvases in its own folder, so two of them never meet.
    await run();
    const empty = win.getByText(/^No canvas yet in .*\/sessions\/[\w-]+\/canvases\./);
    await expect(empty).toBeVisible();
    const root = (await empty.textContent())!.match(/in (.*)\. Ask/)![1];
    expect(root).toContain(join(tenonDir, "sessions"));
    await createBoard(root, { canvas: "demo", board: "cart", title: "Cart", w: 390, h: 844, html });
    await run();

    // The canvas opens in a panel next to the chat, not in a browser window.
    const panel = win.frameLocator('iframe[title="Design canvas"]');
    await expect(panel.locator(".lbl")).toHaveText(/^Cart rev 1/);
    await expect(panel.frameLocator("iframe").first().locator("h1")).toHaveText("Cart"); // the board itself shows
    await expect(win.getByLabel("Message to pi")).toBeVisible();

    // The Canvas button (and ⇧C) hides and shows it.
    const button = win.getByRole("button", { name: /^Canvas/ });
    await button.click();
    await expect(win.locator('iframe[title="Design canvas"]')).toHaveCount(0);
    await win.locator("main b").first().click(); // focus outside the message box
    await win.keyboard.press("Shift+C");
    await expect(panel.locator(".lbl")).toHaveText(/^Cart rev 1/);
  } finally {
    await app.close();
  }
});

test("Design page lists the project's canvases and opens one", async () => {
  const tenonDir = await mkdtemp(join(tmpdir(), "tenon-app-"));
  const project = join(await mkdtemp(join(tmpdir(), "tenon-proj-")), "checkout-app");
  const root = join(project, ".tenon", "canvases");
  const html = "<html><body style='margin:0;width:390px;height:400px'><h1>Cart</h1></body></html>";
  await createBoard(root, { canvas: "checkout", board: "cart", title: "Cart", w: 390, h: 400, html, canvasTitle: "Checkout redesign" });
  await createBoard(root, { canvas: "checkout", board: "pay", title: "Payment", w: 390, h: 400, html });
  await createBoard(root, { canvas: "onboarding", board: "home", title: "Home", w: 390, h: 400, html, canvasTitle: "Onboarding" });
  await approve(root, "checkout", "cart");
  await writeFile(join(tenonDir, "projects.json"), JSON.stringify([project]));

  const app = await electron.launch({ args: ["."], env: { ...process.env, TENON_DIR: tenonDir, TENON_PI_DIR: join(tenonDir, "pi") } });
  try {
    const win = await app.firstWindow();
    // sidebar: a Design row with the count, and each canvas under it
    await win.getByRole("button", { name: /^Design\s*2$/ }).click();
    await expect(win.getByText("Design · checkout-app")).toBeVisible();
    const list = win.getByRole("region", { name: "Canvases" });
    await expect(list.getByText("Checkout redesign")).toBeVisible();
    await expect(list.getByText("in review", { exact: true })).toBeVisible(); // one board approved, one not
    await expect(list.getByText("draft", { exact: true })).toBeVisible();
    await expect(list.getByText("2 boards")).toBeVisible();

    // filters
    await list.getByRole("button", { name: /^Drafts/ }).click();
    await expect(list.getByText("Checkout redesign")).toBeHidden();
    await expect(list.getByText("Onboarding")).toBeVisible();
    await list.getByRole("button", { name: /^All/ }).click();

    // details: boards with their approval, and where it is saved
    await list.getByText("Checkout redesign").click();
    const details = win.getByRole("complementary", { name: "Canvas details" });
    await expect(details.getByText("Cart rev 1")).toBeVisible();
    await expect(details.getByText("approved", { exact: true })).toBeVisible();
    await expect(details.getByText("needs review")).toBeVisible();
    await expect(details.getByText(/canvas\.json · 2 boards/)).toBeVisible();

    // open the canvas in the page
    await details.getByRole("button", { name: "Open canvas" }).click();
    await expect(win.frameLocator('iframe[title="Design canvas"]').locator(".lbl").first()).toHaveText(/^Cart rev 1/);
    await win.getByRole("button", { name: "Canvases" }).click();

    // the Design system tab: no design system yet
    await win.getByRole("radio", { name: "Design system" }).click();
    await expect(win.frameLocator('iframe[title="Design system"]').getByText("No design system yet")).toBeVisible();
  } finally {
    await app.close();
  }
});

test("Start build session in Tenon opens a new session for the design pack", async () => {
  const tenonDir = await mkdtemp(join(tmpdir(), "tenon-app-"));
  const html = "<html><body style='margin:0;width:390px;height:400px'><h1>Cart</h1></body></html>";
  const app = await electron.launch({ args: ["."], env: { ...process.env, TENON_DIR: tenonDir, TENON_PI_DIR: join(tenonDir, "pi") } });
  try {
    const win = await app.firstWindow();
    await win.getByText("New session").first().click();
    const box = win.getByLabel("Message to pi");
    const run = async () => {
      await box.fill("/canvas");
      await box.press("Enter");
      if (await box.inputValue()) await box.press("Enter");
    };
    await run();
    const empty = win.getByText(/^No canvas yet in /);
    await expect(empty).toBeVisible();
    const root = (await empty.textContent())!.match(/in (.*)\. Ask/)![1];
    await createBoard(root, { canvas: "demo", board: "cart", title: "Cart", w: 390, h: 400, html });
    await approve(root, "demo", "cart");
    await run();

    const panel = win.frameLocator('iframe[title="Design canvas"]');
    await panel.getByRole("button", { name: "Compare" }).click();
    await panel.getByRole("button", { name: "Start build session" }).click();
    await expect(win.getByText("Build session started from “demo”")).toBeVisible();
  } finally {
    await app.close();
  }
});

test("+ Canvas starts a canvas from the session header", async () => {
  const tenonDir = await mkdtemp(join(tmpdir(), "tenon-app-"));
  const app = await electron.launch({ args: ["."], env: { ...process.env, TENON_DIR: tenonDir, TENON_PI_DIR: join(tenonDir, "pi") } });
  try {
    const win = await app.firstWindow();
    await win.getByText("New session").first().click();
    await expect(win.getByText("no canvas yet")).toBeVisible();
    await win.getByRole("button", { name: /^\+ Canvas/ }).click();

    // an empty canvas opens in the panel, and pi is asked to draft it
    const panel = win.frameLocator('iframe[title="Design canvas"]');
    await expect(panel.getByText("No boards yet")).toBeVisible();
    await expect(win.getByText("no canvas yet")).toBeHidden();
    await expect(win.getByRole("button", { name: /^Canvas/ })).toBeVisible();
    const sessions = join(tenonDir, "sessions");
    const [id] = readdirSync(sessions);
    expect(readdirSync(join(sessions, id, "canvases"))).toEqual(["new-session"]); // named for the session
  } finally {
    await app.close();
  }
});

test("a session opens from the list at its tree, clones, and moves to a new project", async () => {
  const tenonDir = await mkdtemp(join(tmpdir(), "tenon-app-"));
  const project = await mkdtemp(join(tmpdir(), "tenon-project-"));
  await writeSession(tenonDir, "Seed session");
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, TENON_DIR: tenonDir, TENON_PI_DIR: join(tenonDir, "pi"), TENON_OPEN: "Seed", TENON_VIEW: "tree" },
  });
  try {
    // "Open a folder…" picks this folder, with no native dialog.
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as unknown as typeof dialog.showOpenDialog;
    }, project);
    const win = await app.firstWindow();

    // The window finds the key of a session that it opened by its file.
    await expect(win.getByRole("button", { name: /Switch to branch/ })).toBeVisible();

    const rows = win.getByRole("navigation", { name: "Sessions" }).getByText("Seed session");
    await rows.first().click({ button: "right" });
    await win.getByRole("menuitem", { name: /Clone/ }).click();
    await expect(rows).toHaveCount(2);

    await win.getByRole("button", { name: "Add to project" }).click();
    await win.getByRole("menuitem", { name: /Open a folder/ }).click();
    await expect(win.getByText(/^Moved to tenon-project-/)).toBeVisible();
  } finally {
    await app.close();
  }
});

/** A saved session with no project: a user message, a reply, and a name. */
async function writeSession(tenonDir: string, name: string) {
  const agentDir = join(tenonDir, "agent");
  const cwd = join(tenonDir, "no-project");
  await mkdir(cwd, { recursive: true });
  const before = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir; // pi puts the file in the sessions folder of this agent folder
  try {
    const sm = SessionManager.create(cwd);
    const timestamp = Date.now();
    sm.appendMessage({ role: "user", content: "Hello from the test", timestamp });
    sm.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "test",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp,
    });
    sm.appendSessionInfo(name);
  } finally {
    if (before === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = before;
  }
}
