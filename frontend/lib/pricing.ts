export type ColorMode = "bw" | "color";
export type PaperFormat = "a4" | "a3";

const RATES: Record<string, number> = {
  "bw:a4": 20,
  "bw:a3": 40,
  "color:a4": 50,
  "color:a3": 100,
};

export function pricePerSheet(color: ColorMode, paper: PaperFormat): number {
  return RATES[`${color}:${paper}`];
}

export function estimateTotalRub(
  totalPages: number,
  color: ColorMode,
  paper: PaperFormat,
): number {
  if (totalPages <= 0) return 0;
  return totalPages * pricePerSheet(color, paper);
}
