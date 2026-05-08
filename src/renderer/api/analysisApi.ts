import type { AnalysisResult } from "../types";

export async function analyzeImageRegion(_imageDataUrl: string): Promise<AnalysisResult> {
  await new Promise((resolve) => setTimeout(resolve, 350));

  const isAnomaly = Math.random() > 0.5;

  return {
    result: isAnomaly ? "Anomaly" : "Normal",
    confidance: isAnomaly ? "42%" : "89%",
    meta: isAnomaly
      ? "Mock result: possible issue found in selected region."
      : "Mock result: selected region appears normal."
  };
}