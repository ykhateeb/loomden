import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { createBoard } from "../extensions/store";

// Needs a build first: npm run build
test("/canvas in Tau opens the canvas panel next to the chat", async () => {
  const tauDir = await mkdtemp(join(tmpdir(), "tau-app-"));
  // A session started with "New session" has this folder as its project folder.
  const root = join(tauDir, "no-project", ".tau", "canvases");
  const html = "<html><body style='margin:0;width:390px;height:844px'><h1>Cart</h1></body></html>";
  await createBoard(root, { canvas: "demo", board: "cart", title: "Cart", w: 390, h: 844, html });

  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, TAU_DIR: tauDir, TAU_PI_DIR: join(tauDir, "pi"), TAU_NO_OPEN: "1" },
  });
  try {
    const win = await app.firstWindow();
    await win.getByText("New session").first().click();
    const box = win.getByLabel("Message to pi");
    await box.fill("/canvas");
    await box.press("Enter");
    if (await box.inputValue()) await box.press("Enter"); // the first Enter can pick the command in the menu

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
