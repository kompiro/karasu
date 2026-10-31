/** Two decimals — enough for SVG geometry, and it keeps float noise out of the output. */
export const round2 = (n: number): number => Number(n.toFixed(2));
/** Four decimals, never upwards — for a scale that has to stay within a bound. */
export const floor4 = (n: number): number => Math.floor(n * 1e4) / 1e4;
