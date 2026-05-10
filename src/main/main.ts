import { app, BrowserWindow, ipcMain, session, desktopCapturer, screen } from "electron";
import path from "path";

/*
  Important:
  This must be called before app.whenReady().
  It helps prevent black/white/blur compositor issues with transparent always-on-top windows.
*/
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let mouseModeInterval: NodeJS.Timeout | null = null;

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

function isWindowUsable(): boolean {
  return mainWindow !== null && !mainWindow.isDestroyed();
}

function setMousePassthrough(value: boolean): void {
  if (!isWindowUsable() || !mainWindow) {
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

function lockWindowForDrawing(): void {
  if (!isWindowUsable() || !mainWindow) {
    return;
  }

  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;

  mainWindow.setIgnoreMouseEvents(false);
  isMousePassthrough = false;

  mainWindow.setBounds(bounds);
  mainWindow.setResizable(false);
  mainWindow.setMaximizable(false);
  mainWindow.setMinimizable(false);
  mainWindow.setFullScreenable(false);

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.setFullScreen(true);
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
}

function unlockWindowAfterDrawing(): void {
  if (!isWindowUsable() || !mainWindow) {
    return;
  }

  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;

  mainWindow.setFullScreen(false);
  mainWindow.setBounds(bounds);

  mainWindow.setResizable(false);
  mainWindow.setMaximizable(false);
  mainWindow.setMinimizable(true);
  mainWindow.setFullScreenable(false);

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.show();
}

function forceFullScreenBounds(): void {
  if (!isWindowUsable() || !mainWindow) {
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
  if (!isWindowUsable() || !mainWindow) {
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

function startMouseModeInterval(): void {
  if (mouseModeInterval) {
    clearInterval(mouseModeInterval);
  }

  mouseModeInterval = setInterval(() => {
    updateMouseMode();
  }, 80);
}

function stopMouseModeInterval(): void {
  if (mouseModeInterval) {
    clearInterval(mouseModeInterval);
    mouseModeInterval = null;
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
    minWidth: bounds.width,
    minHeight: bounds.height,
    title: "Screen Image Analysis Tool",
    backgroundColor: "#00000000",
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
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
  mainWindow.setResizable(false);
  mainWindow.setMaximizable(false);
  mainWindow.setFullScreenable(false);
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  setMousePassthrough(false);

  mainWindow.on("closed", () => {
    mainWindow = null;
    isDrawingMode = false;
    browserInteractionMode = false;
    isMousePassthrough = false;
    panelBounds = null;
  });

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
  startMouseModeInterval();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      startMouseModeInterval();
    }
  });
});

app.on("before-quit", () => {
  stopMouseModeInterval();
});

app.on("window-all-closed", () => {
  stopMouseModeInterval();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("window:setAlwaysOnTop", (_event, value: boolean) => {
  if (!isWindowUsable() || !mainWindow) {
    return false;
  }

  mainWindow.setAlwaysOnTop(value, "screen-saver");
  return true;
});

ipcMain.handle("window:minimize", () => {
  if (!isWindowUsable() || !mainWindow) {
    return false;
  }

  if (isDrawingMode) {
    return false;
  }

  mainWindow.minimize();
  return true;
});

ipcMain.handle("window:close", () => {
  if (!isWindowUsable() || !mainWindow) {
    return false;
  }

  mainWindow.close();
  return true;
});

ipcMain.handle("window:setDrawingMode", (_event, value: boolean) => {
  isDrawingMode = value;

  if (value) {
    browserInteractionMode = false;
    lockWindowForDrawing();
  } else {
    unlockWindowAfterDrawing();
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
  if (!isWindowUsable() || !mainWindow) {
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