export type AnalysisResult = {
  result: string;
  confidance?: string;
  confidence?: string;
  meta?: string;
};

export type BoxColor = "blue" | "red" | "yellow" | "green";

export type ScreenBox = {
  id: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  loading: boolean;
  error: string | null;
  result: AnalysisResult | null;
  savedPath?: string | null;
  savedCategory?: string | null;
  score?: number | null;
  boxColor?: BoxColor;
};

export type WindowSize = {
  width: number;
  height: number;
};

export type PanelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SaveScreenshotPayload = {
  dataUrl: string;
  category: string;
  boxLabel: string;
};

declare global {
  interface Window {
    electronAPI: {
      setAlwaysOnTop: (value: boolean) => Promise<boolean>;
      minimizeWindow: () => Promise<boolean>;
      closeWindow: () => Promise<boolean>;

      setDrawingMode: (value: boolean) => Promise<boolean>;
      setBrowserInteractionMode: (value: boolean) => Promise<boolean>;

      setPanelBounds: (bounds: PanelBounds) => Promise<boolean>;

      getWindowSize: () => Promise<WindowSize>;

      saveScreenshot: (payload: SaveScreenshotPayload) => Promise<string>;
      openScreenshotsFolder: () => Promise<boolean>;
      getScreenshotsFolder: () => Promise<string>;
    };
  }
}