export type AnalysisResult = {
  result: string;
  confidance?: string;
  confidence?: string;
  meta?: string;
};

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

declare global {
  interface Window {
    electronAPI: {
      setAlwaysOnTop: (value: boolean) => Promise<boolean>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;

      setDrawingMode: (value: boolean) => Promise<boolean>;
      setBrowserInteractionMode: (value: boolean) => Promise<boolean>;

      setPanelBounds: (bounds: PanelBounds) => Promise<boolean>;

      getWindowSize: () => Promise<WindowSize>;
    };
  }
}