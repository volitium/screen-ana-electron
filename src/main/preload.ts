import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke("window:setAlwaysOnTop", value),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),

  setDrawingMode: (value: boolean) => ipcRenderer.invoke("window:setDrawingMode", value),
  setBrowserInteractionMode: (value: boolean) =>
    ipcRenderer.invoke("window:setBrowserInteractionMode", value),

  setPanelBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke("window:setPanelBounds", bounds),

  forceFullScreenBounds: () => ipcRenderer.invoke("window:forceFullScreenBounds"),

  getWindowSize: () => ipcRenderer.invoke("window:getSize")
});