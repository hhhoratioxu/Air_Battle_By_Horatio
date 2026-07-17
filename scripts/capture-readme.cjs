"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-dev-shm-usage");

const root = path.join(__dirname, "..");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: true,
    backgroundColor: "#050711",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  window.setMenuBarVisibility(false);
  await window.loadFile(path.join(root, "index.html"));
  await delay(1200);

  const menu = await window.webContents.capturePage();
  await fs.writeFile(path.join(root, "assets", "menu.png"), menu.toPNG());

  await window.webContents.executeJavaScript("window.__NEON_STRIKE__.start()");
  await delay(4300);

  const gameState = await window.webContents.executeJavaScript("window.__NEON_STRIKE__.getState()");
  const gameplay = await window.webContents.capturePage();
  await fs.writeFile(path.join(root, "assets", "gameplay.png"), gameplay.toPNG());

  console.log(JSON.stringify({
    menu: menu.getSize(),
    gameplay: gameplay.getSize(),
    gameState,
  }));

  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

