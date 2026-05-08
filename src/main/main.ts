import { app, BrowserWindow, ipcMain, session, desktopCapturer, screen } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;

let isDrawingMode = false;
let browserInteractionMode = false;
let isMousePassthrough = false;

type PanelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

let panelBounds: PanelBounds | null = null;

function setMousePassthrough(value: boolean): void {
  if (!mainWindow) {
    return;
  }

  if (isMousePassthrough === value) {
    return;
  }

  isMousePassthrough = value;

  if (value) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
}

function forceFullScreenBounds(): void {
  if (!mainWindow) {
    return;
  }

  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;

  mainWindow.setBounds(bounds);
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
}

function updateMouseMode(): void {
  if (!mainWindow) {
    return;
  }

  if (isDrawingMode) {
    setMousePassthrough(false);
    return;
  }

  if (!browserInteractionMode) {
    setMousePassthrough(false);
    return;
  }

  if (!panelBounds) {
    setMousePassthrough(true);
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const windowBounds = mainWindow.getBounds();

  const cursorX = cursor.x - windowBounds.x;
  const cursorY = cursor.y - windowBounds.y;

  const insidePanel =
    cursorX >= panelBounds.x &&
    cursorX <= panelBounds.x + panelBounds.width &&
    cursorY >= panelBounds.y &&
    cursorY <= panelBounds.y + panelBounds.height;

  if (insidePanel) {
    setMousePassthrough(false);
  } else {
    setMousePassthrough(true);
  }
}

function createMainWindow(): void {
  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 900,
    minHeight: 600,
    title: "Screen Image Analysis Tool",
    backgroundColor: "#00000000",
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  mainWindow.setBounds(bounds);
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  setMousePassthrough(false);

  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: {
          width: 320,
          height: 180
        }
      });

      callback({
        video: sources[0]
      });
    },
    {
      useSystemPicker: true
    }
  );

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createMainWindow();

  setInterval(() => {
    updateMouseMode();
  }, 80);

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

ipcMain.handle("window:setAlwaysOnTop", (_event, value: boolean) => {
  if (!mainWindow) {
    return false;
  }

  mainWindow.setAlwaysOnTop(value, "screen-saver");
  return true;
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("window:setDrawingMode", (_event, value: boolean) => {
  isDrawingMode = value;

  if (value) {
    browserInteractionMode = false;
    forceFullScreenBounds();
  }

  updateMouseMode();
  return true;
});

ipcMain.handle("window:setBrowserInteractionMode", (_event, value: boolean) => {
  browserInteractionMode = value;
  updateMouseMode();
  return true;
});

ipcMain.handle("window:setPanelBounds", (_event, bounds: PanelBounds) => {
  panelBounds = bounds;
  updateMouseMode();
  return true;
});

ipcMain.handle("window:forceFullScreenBounds", () => {
  forceFullScreenBounds();
  return true;
});

ipcMain.handle("window:getSize", () => {
  if (!mainWindow) {
    return {
      width: 0,
      height: 0
    };
  }

  const bounds = mainWindow.getBounds();

  return {
    width: bounds.width,
    height: bounds.height
  };
});