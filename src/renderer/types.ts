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

export type OverlaySize = {
  width: number;
  height: number;
};

export type DrawPayload = {
  frozenImageDataUrl: string;
  boxes: ScreenBox[];
};

export type DrawState = {
  isDrawMode: boolean;
  payload: DrawPayload | null;
};

declare global {
  interface Window {
    electronAPI: {
      setAlwaysOnTop: (value: boolean) => Promise<boolean>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;

      getOverlaySize: () => Promise<OverlaySize>;

      startDraw: (payload: DrawPayload) => Promise<void>;
      finishDraw: (boxes: ScreenBox[]) => Promise<void>;
      getDrawState: () => Promise<DrawState>;

      setOverlayBoxes: (boxes: ScreenBox[]) => Promise<void>;
      sendBoxesToPanel: (boxes: ScreenBox[]) => Promise<void>;
      screenStopped: () => Promise<void>;

      onOverlaySetBoxes: (callback: (boxes: ScreenBox[]) => void) => () => void;
      onPanelBoxesUpdated: (callback: (boxes: ScreenBox[]) => void) => () => void;
    };
  }
}