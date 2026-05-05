import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getCaptureSources: () => ipcRenderer.invoke("capture:getSources"),
  getSourceImage: (sourceId: string) => ipcRenderer.invoke("capture:getSourceImage", sourceId),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke("window:setAlwaysOnTop", value),
  cropDataUrl: (imageDataUrl: string, box: unknown) =>
    ipcRenderer.invoke("image:cropDataUrl", {
      imageDataUrl,
      box
    })
});