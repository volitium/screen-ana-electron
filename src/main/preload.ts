import { contextBridge, ipcRenderer } from "electron";
import type { DrawPayload, ScreenBox } from "../renderer/types";

contextBridge.exposeInMainWorld("electronAPI", {
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke("window:setAlwaysOnTop", value),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),

  getOverlaySize: () => ipcRenderer.invoke("overlay:getSize"),

  startDraw: (payload: DrawPayload) => ipcRenderer.invoke("draw:start", payload),
  finishDraw: (boxes: ScreenBox[]) => ipcRenderer.invoke("draw:finish", boxes),
  getDrawState: () => ipcRenderer.invoke("draw:getState"),

  setOverlayBoxes: (boxes: ScreenBox[]) => ipcRenderer.invoke("overlay:setBoxes", boxes),
  sendBoxesToPanel: (boxes: ScreenBox[]) => ipcRenderer.invoke("panel:sendBoxes", boxes),
  screenStopped: () => ipcRenderer.invoke("panel:screenStopped"),

  onOverlaySetBoxes: (callback: (boxes: ScreenBox[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, boxes: ScreenBox[]) => {
      callback(boxes);
    };

    ipcRenderer.on("overlay:setBoxes", listener);

    return () => {
      ipcRenderer.removeListener("overlay:setBoxes", listener);
    };
  },

  onPanelBoxesUpdated: (callback: (boxes: ScreenBox[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, boxes: ScreenBox[]) => {
      callback(boxes);
    };

    ipcRenderer.on("panel:boxesUpdated", listener);

    return () => {
      ipcRenderer.removeListener("panel:boxesUpdated", listener);
    };
  }
});