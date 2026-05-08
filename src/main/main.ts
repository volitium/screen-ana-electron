import { app, BrowserWindow, ipcMain, session, desktopCapturer, screen } from "electron";
import path from "path";

let panelWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let drawWindow: BrowserWindow | null = null;

type ScreenBox = {
  id: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  loading?: boolean;
  error?: string | null;
  result?: unknown;
};

type DrawPayload = {
  frozenImageDataUrl: string;
  boxes: ScreenBox[];
};

let currentDrawPayload: DrawPayload | null = null;

function dataUrl(html: string): string {
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

function overlayHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
      font-family: Segoe UI, Arial, sans-serif;
      pointer-events: none;
    }

    #boxLayer {
      position: fixed;
      inset: 0;
      pointer-events: none;
    }

    .screen-box {
      position: absolute;
      border: 3px solid #60a5fa;
      background: rgba(96, 165, 250, 0.14);
      border-radius: 8px;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.25),
        0 10px 24px rgba(0, 0, 0, 0.25);
      pointer-events: none;
    }

    .screen-box-label {
      position: absolute;
      left: 0;
      top: -32px;
      padding: 5px 8px;
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.98);
      color: white;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="boxLayer"></div>

  <script>
    const boxLayer = document.getElementById("boxLayer");

    function renderBoxes(boxes) {
      boxLayer.innerHTML = "";

      for (const box of boxes || []) {
        const el = document.createElement("div");
        el.className = "screen-box";
        el.style.left = box.x + "px";
        el.style.top = box.y + "px";
        el.style.width = box.width + "px";
        el.style.height = box.height + "px";

        const label = document.createElement("div");
        label.className = "screen-box-label";
        label.textContent = box.label || ("Box " + box.id);

        el.appendChild(label);
        boxLayer.appendChild(el);
      }
    }

    window.electronAPI.onOverlaySetBoxes((boxes) => {
      renderBoxes(boxes);
    });
  </script>
</body>
</html>
`;
}

function drawHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: Segoe UI, Arial, sans-serif;
      background: #000;
      user-select: none;
    }

    #drawLayer {
      position: fixed;
      inset: 0;
      cursor: crosshair;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.2);
    }

    #frozenScreen {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      object-fit: fill;
      opacity: 0.88;
      pointer-events: none;
    }

    #banner {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000000;
      padding: 13px 20px;
      border-radius: 14px;
      background: rgba(220, 38, 38, 0.98);
      color: white;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.5px;
      pointer-events: none;
      box-shadow: 0 14px 35px rgba(0, 0, 0, 0.42);
    }

    #controls {
      position: fixed;
      top: 74px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000002;
      display: flex;
      gap: 10px;
    }

    button {
      border: 1px solid rgba(148, 163, 184, 0.4);
      border-radius: 12px;
      padding: 10px 16px;
      color: white;
      background: rgba(37, 99, 235, 0.96);
      cursor: pointer;
      font-size: 14px;
      font-weight: 800;
    }

    button:hover {
      background: rgba(29, 78, 216, 0.96);
    }

    .danger {
      background: rgba(239, 68, 68, 0.92);
    }

    .danger:hover {
      background: rgba(220, 38, 38, 0.96);
    }

    .screen-box {
      position: absolute;
      border: 3px solid #60a5fa;
      background: rgba(96, 165, 250, 0.18);
      border-radius: 8px;
      cursor: move;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.25),
        0 10px 24px rgba(0, 0, 0, 0.25);
      z-index: 1000001;
    }

    .screen-box.selected {
      border-color: #22c55e;
      background: rgba(34, 197, 94, 0.18);
    }

    .screen-box-label {
      position: absolute;
      left: 0;
      top: -32px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.98);
      color: white;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }

    .delete-btn {
      padding: 1px 6px;
      font-size: 11px;
      border-radius: 6px;
      background: rgba(239, 68, 68, 0.95);
      border: none;
    }

    .resize-handle {
      position: absolute;
      right: -8px;
      bottom: -8px;
      width: 16px;
      height: 16px;
      border-radius: 999px;
      background: #ffffff;
      border: 2px solid #0f172a;
      cursor: nwse-resize;
    }

    #draftBox {
      position: absolute;
      border: 3px dashed #93c5fd;
      background: rgba(147, 197, 253, 0.2);
      border-radius: 8px;
      z-index: 1000001;
      pointer-events: none;
      display: none;
    }
  </style>
</head>
<body>
  <div id="drawLayer">
    <img id="frozenScreen" />

    <div id="banner">
      DRAW MODE - DRAW, MOVE, RESIZE, OR DELETE BOXES
    </div>

    <div id="controls">
      <button id="finishBtn">Finish Drawing</button>
      <button id="cancelBtn" class="danger">Cancel</button>
    </div>

    <div id="boxLayer"></div>
    <div id="draftBox"></div>
  </div>

  <script>
    let boxes = [];
    let nextBoxId = 1;

    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    let selectedBoxId = null;
    let draggingBoxId = null;
    let resizingBoxId = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const frozenScreen = document.getElementById("frozenScreen");
    const drawLayer = document.getElementById("drawLayer");
    const boxLayer = document.getElementById("boxLayer");
    const draftBox = document.getElementById("draftBox");
    const finishBtn = document.getElementById("finishBtn");
    const cancelBtn = document.getElementById("cancelBtn");

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function getPointerPosition(event) {
      const rect = drawLayer.getBoundingClientRect();

      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    function updateNextBoxId() {
      nextBoxId = boxes.length > 0 ? Math.max(...boxes.map((box) => box.id)) + 1 : 1;
    }

    function renderBoxes() {
      boxLayer.innerHTML = "";

      for (const box of boxes) {
        const el = document.createElement("div");
        el.className = "screen-box" + (box.id === selectedBoxId ? " selected" : "");
        el.style.left = box.x + "px";
        el.style.top = box.y + "px";
        el.style.width = box.width + "px";
        el.style.height = box.height + "px";
        el.dataset.id = String(box.id);

        const label = document.createElement("div");
        label.className = "screen-box-label";
        label.textContent = box.label || ("Box " + box.id);

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = "x";

        deleteBtn.addEventListener("mousedown", (event) => {
          event.stopPropagation();
        });

        deleteBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          boxes = boxes.filter((item) => item.id !== box.id);
          if (selectedBoxId === box.id) {
            selectedBoxId = null;
          }
          renderBoxes();
        });

        label.appendChild(deleteBtn);

        const resizeHandle = document.createElement("div");
        resizeHandle.className = "resize-handle";

        resizeHandle.addEventListener("mousedown", (event) => {
          event.stopPropagation();
          selectedBoxId = box.id;
          resizingBoxId = box.id;
          renderBoxes();
        });

        el.addEventListener("mousedown", (event) => {
          event.stopPropagation();

          const pos = getPointerPosition(event);

          selectedBoxId = box.id;
          draggingBoxId = box.id;
          dragOffsetX = pos.x - box.x;
          dragOffsetY = pos.y - box.y;

          renderBoxes();
        });

        el.appendChild(label);
        el.appendChild(resizeHandle);
        boxLayer.appendChild(el);
      }
    }

    function showDraftBox() {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      draftBox.style.display = "block";
      draftBox.style.left = x + "px";
      draftBox.style.top = y + "px";
      draftBox.style.width = width + "px";
      draftBox.style.height = height + "px";
    }

    function hideDraftBox() {
      draftBox.style.display = "none";
    }

    drawLayer.addEventListener("mousedown", (event) => {
      if (event.target.closest("#controls") || event.target.closest(".screen-box")) {
        return;
      }

      const pos = getPointerPosition(event);

      isDrawing = true;
      startX = pos.x;
      startY = pos.y;
      currentX = pos.x;
      currentY = pos.y;

      showDraftBox();
    });

    drawLayer.addEventListener("mousemove", (event) => {
      const pos = getPointerPosition(event);

      if (isDrawing) {
        currentX = pos.x;
        currentY = pos.y;
        showDraftBox();
        return;
      }

      if (draggingBoxId !== null) {
        const box = boxes.find((item) => item.id === draggingBoxId);

        if (!box) {
          return;
        }

        const maxX = window.innerWidth - box.width;
        const maxY = window.innerHeight - box.height;

        box.x = clamp(pos.x - dragOffsetX, 0, maxX);
        box.y = clamp(pos.y - dragOffsetY, 0, maxY);

        renderBoxes();
      }

      if (resizingBoxId !== null) {
        const box = boxes.find((item) => item.id === resizingBoxId);

        if (!box) {
          return;
        }

        box.width = clamp(pos.x - box.x, 40, window.innerWidth - box.x);
        box.height = clamp(pos.y - box.y, 40, window.innerHeight - box.y);

        renderBoxes();
      }
    });

    function finishPointerAction() {
      if (isDrawing) {
        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        if (width > 40 && height > 40) {
          const id = nextBoxId;

          boxes.push({
            id,
            label: "Box " + id,
            x,
            y,
            width,
            height,
            loading: false,
            error: null,
            result: null
          });

          selectedBoxId = id;
          nextBoxId += 1;
        }
      }

      isDrawing = false;
      draggingBoxId = null;
      resizingBoxId = null;

      hideDraftBox();
      renderBoxes();
    }

    drawLayer.addEventListener("mouseup", finishPointerAction);
    drawLayer.addEventListener("mouseleave", finishPointerAction);

    finishBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await window.electronAPI.finishDraw(boxes);
    });

    cancelBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await window.electronAPI.finishDraw(boxes);
    });

    window.electronAPI.getDrawState().then((state) => {
      if (!state || !state.payload) {
        return;
      }

      frozenScreen.src = state.payload.frozenImageDataUrl;
      boxes = Array.isArray(state.payload.boxes)
        ? JSON.parse(JSON.stringify(state.payload.boxes))
        : [];

      updateNextBoxId();
      renderBoxes();
    });
  </script>
</body>
</html>
`;
}

function createOverlayWindow(): void {
  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;

  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    title: "Screen Box Overlay",
    backgroundColor: "#00000000",
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.loadURL(dataUrl(overlayHtml()));

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

function createPanelWindow(): void {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;

  const width = 430;
  const height = 720;

  panelWindow = new BrowserWindow({
    x: workArea.x + workArea.width - width - 20,
    y: workArea.y + 20,
    width,
    height,
    minWidth: 390,
    minHeight: 520,
    title: "Screen Analysis Panel",
    backgroundColor: "#00000000",
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    focusable: true,
    hasShadow: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  panelWindow.setAlwaysOnTop(true, "screen-saver");
  panelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  panelWindow.on("closed", () => {
    panelWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    panelWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    panelWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function createDrawWindow(payload: DrawPayload): void {
  currentDrawPayload = payload;

  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;

  const windowToCreate = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    title: "Draw Analysis Boxes",
    backgroundColor: "#000000",
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: true,
    hasShadow: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  drawWindow = windowToCreate;

  drawWindow.setAlwaysOnTop(true, "screen-saver");
  drawWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  drawWindow.setFullScreen(true);
  drawWindow.loadURL(dataUrl(drawHtml()));

  drawWindow.on("closed", () => {
    if (drawWindow === windowToCreate) {
      drawWindow = null;
    }
  });
}

function createWindows(): void {
  createOverlayWindow();
  createPanelWindow();

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
}

app.whenReady().then(() => {
  createWindows();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindows();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("window:setAlwaysOnTop", (_event, value: boolean) => {
  panelWindow?.setAlwaysOnTop(value, "screen-saver");
  overlayWindow?.setAlwaysOnTop(value, "screen-saver");
  return true;
});

ipcMain.handle("window:minimize", () => {
  panelWindow?.minimize();
});

ipcMain.handle("window:close", () => {
  drawWindow?.close();
  overlayWindow?.close();
  panelWindow?.close();
});

ipcMain.handle("overlay:getSize", () => {
  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;

  return {
    width: bounds.width,
    height: bounds.height
  };
});

ipcMain.handle("draw:start", (_event, payload: DrawPayload) => {
  createDrawWindow(payload);
});

ipcMain.handle("draw:finish", (_event, boxes: ScreenBox[]) => {
  currentDrawPayload = null;

  overlayWindow?.webContents.send("overlay:setBoxes", boxes);
  panelWindow?.webContents.send("panel:boxesUpdated", boxes);

  drawWindow?.close();
  drawWindow = null;

  panelWindow?.setAlwaysOnTop(true, "screen-saver");
  panelWindow?.show();
  panelWindow?.focus();
});

ipcMain.handle("draw:getState", () => {
  return {
    isDrawMode: !!currentDrawPayload,
    payload: currentDrawPayload
  };
});

ipcMain.handle("overlay:setBoxes", (_event, boxes: ScreenBox[]) => {
  overlayWindow?.webContents.send("overlay:setBoxes", boxes);
});

ipcMain.handle("panel:sendBoxes", (_event, boxes: ScreenBox[]) => {
  panelWindow?.webContents.send("panel:boxesUpdated", boxes);
});

ipcMain.handle("panel:screenStopped", () => {
  currentDrawPayload = null;

  overlayWindow?.webContents.send("overlay:setBoxes", []);

  if (drawWindow) {
    drawWindow.close();
    drawWindow = null;
  }
});