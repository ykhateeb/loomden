import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { approve, createBoard } from "../extensions/store";

// Needs a build first: npm run build
test("/canvas in Tau opens the canvas panel next to the chat", async () => {
  const tauDir = await mkdtemp(join(tmpdir(), "tau-app-"));
  const html = "<html><body style='margin:0;width:390px;height:844px'><h1>Cart</h1></body></html>";

  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, TAU_DIR: tauDir, TAU_PI_DIR: join(tauDir, "pi"), TAU_NO_OPEN: "1" },
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
    expect(root).toContain(join(tauDir, "sessions"));
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
  const tauDir = await mkdtemp(join(tmpdir(), "tau-app-"));
  const project = join(await mkdtemp(join(tmpdir(), "tau-proj-")), "checkout-app");
  const root = join(project, ".tau", "canvases");
  const html = "<html><body style='margin:0;width:390px;height:400px'><h1>Cart</h1></body></html>";
  await createBoard(root, { canvas: "checkout", board: "cart", title: "Cart", w: 390, h: 400, html, canvasTitle: "Checkout redesign" });
  await createBoard(root, { canvas: "checkout", board: "pay", title: "Payment", w: 390, h: 400, html });
  await createBoard(root, { canvas: "onboarding", board: "home", title: "Home", w: 390, h: 400, html, canvasTitle: "Onboarding" });
  await approve(root, "checkout", "cart");
  await writeFile(join(tauDir, "projects.json"), JSON.stringify([project]));

  const app = await electron.launch({ args: ["."], env: { ...process.env, TAU_DIR: tauDir, TAU_PI_DIR: join(tauDir, "pi") } });
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
