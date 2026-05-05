import { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1200,
    minHeight: 800,
    title: "Screen Image Analysis Tool",
    backgroundColor: "#111111",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("capture:getSources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: {
      width: 1920,
      height: 1080
    },
    fetchWindowIcons: true
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    appIcon: source.appIcon ? source.appIcon.toDataURL() : null
  }));
});

ipcMain.handle("capture:getSourceImage", async (_event, sourceId: string) => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: {
      width: 1920,
      height: 1080
    }
  });

  const source = sources.find((item) => item.id === sourceId);

  if (!source) {
    throw new Error("Capture source was not found.");
  }

  return source.thumbnail.toDataURL();
});

ipcMain.handle("window:setAlwaysOnTop", (_event, value: boolean) => {
  if (!mainWindow) {
    return false;
  }

  mainWindow.setAlwaysOnTop(value);
  return true;
});

ipcMain.handle("image:cropDataUrl", async (_event, payload) => {
  const { imageDataUrl, box } = payload;

  const image = nativeImage.createFromDataURL(imageDataUrl);
  const bitmap = image.crop({
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height)
  });

  return bitmap.toDataURL();
});