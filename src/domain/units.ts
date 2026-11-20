export const DAY_MS = 24 * 3600 * 1000;

export const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
