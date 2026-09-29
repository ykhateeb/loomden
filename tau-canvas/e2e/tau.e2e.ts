import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, chromium, expect, test } from "@playwright/test";
import { createBoard } from "../extensions/store";

// Needs a build first: npm run build
test("/canvas in Tau opens the canvas of the session's folder", async () => {
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

    const toast = win.getByText(/^Canvas: http:\/\/127\.0\.0\.1:\d+\/\w+\/c\/demo$/);
    await expect(toast).toBeVisible();
    const url = (await toast.textContent())!.replace("Canvas: ", "");

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(url);
      await expect(page.locator(".lbl")).toHaveText("Cart · rev 1 · by pi");
    } finally {
      await browser.close();
    }
  } finally {
    await app.close();
  }
});
