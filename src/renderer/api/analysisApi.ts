import type { AnalysisResult } from "../types";

// place holder algorithm

export async function analyzeImageRegion(_imageDataUrl: string): Promise<AnalysisResult> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  const isAnomaly = Math.random() > 0.5;

  return {
    result: isAnomaly ? "Anomaly" : "Normal",
    confidance: isAnomaly ? "20%" : "67%",
    meta: isAnomaly ? "Mock anomaly detected" : "Mock normal result"
  };
}