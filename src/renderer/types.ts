export type CaptureSource = {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
};

export type AnalysisResult = {
  result: string;
  confidance?: string;
  confidence?: string;
  meta?: string;
};

export type BoxItem = {
  id: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  borderWidth: number;
  opacity: number;
  loading: boolean;
  error: string | null;
  result: AnalysisResult | null;
};

declare global {
  interface Window {
    electronAPI: {
      getCaptureSources: () => Promise<CaptureSource[]>;
      getSourceImage: (sourceId: string) => Promise<string>;
      setAlwaysOnTop: (value: boolean) => Promise<boolean>;
      cropDataUrl: (
  imageDataUrl: string,
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }
) => Promise<string>;
    };
  }
}